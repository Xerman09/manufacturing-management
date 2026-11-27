import { cookies } from "next/headers";
import { procurementDirectusFetch } from "@/app/api/manufacturing/procurement/_directus";
import type { ApprovalStage } from "./_domain";

const ACCESS_TOKEN_COOKIE = "vos_mm_access_token";

export const PURCHASE_ORDER_MODULE_PATHS = {
    procurement: "incoming-purchase-shipments",
    suppliers: "suppliers",
    rawMaterials: "raw-materials",
    financeApproval: "finance-approval",
    warehouseReceiving: "warehouse-receiving",
    receiving: "qa-receiving-inspections",
    expenses: "shipment-expenses"
} as const;

export function purchaseOrderApprovalModulePath(stage: ApprovalStage) {
    if (stage !== "Finance") throw new PurchaseOrderAuthorizationError(400, "Only Finance approval is supported.");
    return PURCHASE_ORDER_MODULE_PATHS.financeApproval;
}

export type PurchaseOrderModulePath = typeof PURCHASE_ORDER_MODULE_PATHS[keyof typeof PURCHASE_ORDER_MODULE_PATHS];

export class PurchaseOrderAuthorizationError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

interface RelationRecord {
    id?: unknown;
}

interface DirectusUserRecord {
    user_id?: unknown;
    role_id?: number | RelationRecord | null;
    role?: unknown;
    isAdmin?: unknown;
}

interface AuthenticatedUserResponse {
    id?: unknown;
    admin?: unknown;
    isAdmin?: unknown;
    firstName?: unknown;
    middleName?: unknown;
    lastName?: unknown;
    suffixName?: unknown;
}

interface DirectusModuleRow {
    id?: unknown;
    slug?: unknown;
    base_path?: unknown;
    status?: unknown;
    parent_module_id?: { id?: unknown; slug?: unknown; base_path?: unknown } | number | null;
}

interface ModuleAccessRecord {
    module_id?: DirectusModuleRow | number | null;
}

export interface AuthorizedPurchaseOrderUser {
    userId: number;
    displayName: string;
    roleId: number | null;
    admin: boolean;
    modulePath?: string;
    approvalStage: ApprovalStage | null;
    canReject: boolean;
}

function positiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function relationId(value: DirectusUserRecord["role_id"]): number | null {
    if (typeof value === "number") return positiveInteger(value);
    return value && typeof value === "object" ? positiveInteger(value.id) : null;
}

function authenticatedUserDisplayName(user: AuthenticatedUserResponse): string {
    const name = [user.firstName, user.middleName, user.lastName, user.suffixName]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .map(part => part.trim())
        .join(" ");
    return name || "Unknown inspector";
}

async function responseData<T>(response: Response, message: string): Promise<T> {
    if (!response.ok) throw new PurchaseOrderAuthorizationError(503, message);
    const body = await response.json();
    return body.data as T;
}

function normalizePath(p?: unknown): string {
    if (typeof p !== "string") return "";
    const trimmed = p.trim();
    if (!trimmed) return "";
    return trimmed.replace(/\/+$/, "");
}

export async function requirePurchaseOrderModuleAccess(options: {
    modulePath?: string;
    modulePaths?: readonly string[];
    moduleSlug?: string;
    moduleSlugs?: readonly string[];
    approvalStage?: ApprovalStage;
    requireDecision?: boolean;
    requireReject?: boolean;
}): Promise<AuthorizedPurchaseOrderUser> {
    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) throw new PurchaseOrderAuthorizationError(401, "Authentication is required.");

    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/$/, "");
    if (!springBase) throw new PurchaseOrderAuthorizationError(500, "Authentication service is not configured.");

    let authResponse: Response;
    try {
        authResponse = await fetch(`${springBase}/auth/me`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store"
        });
    } catch {
        throw new PurchaseOrderAuthorizationError(503, "Authentication service is unavailable.");
    }
    if (authResponse.status === 401 || authResponse.status === 403) {
        throw new PurchaseOrderAuthorizationError(401, "Your session is invalid or has expired.");
    }
    if (!authResponse.ok) throw new PurchaseOrderAuthorizationError(503, "Authentication service is unavailable.");

    const authenticated = await authResponse.json() as AuthenticatedUserResponse;
    const userId = positiveInteger(authenticated?.id);
    if (!userId) throw new PurchaseOrderAuthorizationError(401, "Unable to verify the current user.");

    const accessParams = new URLSearchParams({
        "filter[user_id][_eq]": String(userId),
        fields: "module_id.id,module_id.base_path,module_id.slug,module_id.status,module_id.parent_module_id.id,module_id.parent_module_id.slug,module_id.parent_module_id.base_path",
        limit: "-1"
    });
    const [userResponse, accessResponse, modulesResponse] = await Promise.all([
        procurementDirectusFetch(`/items/user/${userId}?fields=user_id,role_id.id,role,isAdmin`),
        procurementDirectusFetch(`/items/user_access_modules?${accessParams.toString()}`),
        procurementDirectusFetch("/items/modules?filter[status][_eq]=active&fields=id,slug,base_path,status,parent_module_id.id,parent_module_id.slug,parent_module_id.base_path&limit=-1")
    ]);
    const user = await responseData<DirectusUserRecord>(userResponse, "Unable to verify the current user role.");
    const accessRows = await responseData<ModuleAccessRecord[]>(accessResponse, "Unable to verify module access.");
    const activeModules = modulesResponse.ok
        ? ((await modulesResponse.json().catch(() => null))?.data || []) as DirectusModuleRow[]
        : [];
    const roleId = relationId(user.role_id);
    const admin = authenticated?.admin === true
        || authenticated?.isAdmin === true
        || user.role === "ADMIN"
        || user.isAdmin === true
        || Number(user.isAdmin) === 1;

    const requestedTargets = [
        ...(options.modulePaths || []),
        ...(options.modulePath ? [options.modulePath] : []),
        ...(options.moduleSlugs || []),
        ...(options.moduleSlug ? [options.moduleSlug] : [])
    ].map(target => normalizePath(target)).filter(Boolean);

    // Resolve matching active module rows from the database `modules` table
    const matchedDbModules = activeModules.filter(mod => {
        const modSlug = normalizePath(mod.slug);
        const modPath = normalizePath(mod.base_path);
        const parentObj = mod.parent_module_id && typeof mod.parent_module_id === "object" ? mod.parent_module_id : null;
        const parentSlug = normalizePath(parentObj?.slug);
        const parentPath = normalizePath(parentObj?.base_path);

        return requestedTargets.some(target => {
            const targetSlug = target.split("/").filter(Boolean).pop() || target;
            return modSlug === target
                || modSlug === targetSlug
                || modPath === target
                || (modPath && modPath.endsWith(`/${targetSlug}`))
                || parentSlug === targetSlug
                || (parentPath && parentPath === target);
        });
    });

    const allowedModuleIds = new Set<number>();
    const allowedSlugs = new Set<string>();
    const allowedPaths = new Set<string>();

    for (const target of requestedTargets) {
        const targetSlug = target.split("/").filter(Boolean).pop() || target;
        allowedSlugs.add(targetSlug);
        if (target.startsWith("/")) allowedPaths.add(target);
    }

    for (const mod of matchedDbModules) {
        const id = positiveInteger(mod.id);
        if (id) allowedModuleIds.add(id);
        const slug = normalizePath(mod.slug);
        if (slug) allowedSlugs.add(slug);
        const basePath = normalizePath(mod.base_path);
        if (basePath) allowedPaths.add(basePath);
        const parentObj = mod.parent_module_id && typeof mod.parent_module_id === "object" ? mod.parent_module_id : null;
        const parentId = positiveInteger(parentObj?.id ?? mod.parent_module_id);
        if (parentId) allowedModuleIds.add(parentId);
        const parentSlug = normalizePath(parentObj?.slug);
        if (parentSlug) allowedSlugs.add(parentSlug);
        const parentPath = normalizePath(parentObj?.base_path);
        if (parentPath) allowedPaths.add(parentPath);
    }

    const hasModule = admin || accessRows.some(row => {
        if (!row.module_id) return false;
        if (typeof row.module_id === "number") {
            return allowedModuleIds.has(row.module_id);
        }
        if (typeof row.module_id !== "object") return false;

        const rowStatus = typeof row.module_id.status === "string" ? row.module_id.status.trim() : "active";
        if (rowStatus && rowStatus !== "active") return false;

        const rowId = positiveInteger(row.module_id.id);
        if (rowId && allowedModuleIds.has(rowId)) return true;

        const rowSlug = normalizePath(row.module_id.slug);
        if (rowSlug && allowedSlugs.has(rowSlug)) return true;

        const rowPath = normalizePath(row.module_id.base_path);
        if (rowPath) {
            const rowLeafSlug = rowPath.split("/").filter(Boolean).pop() || "";
            if (rowLeafSlug && allowedSlugs.has(rowLeafSlug)) return true;
            for (const clean of allowedPaths) {
                if (clean === rowPath || clean.startsWith(`${rowPath}/`) || rowPath.startsWith(`${clean}/`)) {
                    return true;
                }
            }
        }

        const parentObj = row.module_id.parent_module_id && typeof row.module_id.parent_module_id === "object"
            ? row.module_id.parent_module_id
            : null;
        const parentId = positiveInteger(parentObj?.id ?? row.module_id.parent_module_id);
        if (parentId && allowedModuleIds.has(parentId)) return true;
        const parentSlug = normalizePath(parentObj?.slug);
        if (parentSlug && allowedSlugs.has(parentSlug)) return true;

        return false;
    });

    if (!hasModule) {
        throw new PurchaseOrderAuthorizationError(403, "You do not have access to this purchase-order module.");
    }

    return {
        userId,
        displayName: authenticatedUserDisplayName(authenticated),
        roleId,
        admin,
        modulePath: [...allowedPaths][0] || requestedTargets[0],
        approvalStage: options.approvalStage || null,
        canReject: true
    };
}
