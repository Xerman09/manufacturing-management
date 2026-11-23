import { cookies } from "next/headers";
import { procurementDirectusFetch } from "@/app/api/manufacturing/procurement/_directus";
import type { ApprovalStage } from "./_domain";

const ACCESS_TOKEN_COOKIE = "vos_access_token";

export const PURCHASE_ORDER_MODULE_PATHS = {
    procurement: "/mm/incoming-purchase-shipments",
    suppliers: "/mm/suppliers",
    rawMaterials: "/mm/raw-materials",
    financeApproval: "/mm/finance-approval",
    warehouseReceiving: "/mm/warehouse-receiving",
    receiving: "/mm/qa-receiving-inspections",
    expenses: "/mm/shipment-expenses"
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

interface ModuleAccessRecord {
    module_id?: { base_path?: unknown; slug?: unknown } | number | null;
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
        fields: "module_id.base_path,module_id.slug",
        limit: "-1"
    });
    const [userResponse, accessResponse] = await Promise.all([
        procurementDirectusFetch(`/items/user/${userId}?fields=user_id,role_id.id,role,isAdmin`),
        procurementDirectusFetch(`/items/user_access_modules?${accessParams.toString()}`)
    ]);
    const user = await responseData<DirectusUserRecord>(userResponse, "Unable to verify the current user role.");
    const accessRows = await responseData<ModuleAccessRecord[]>(accessResponse, "Unable to verify module access.");
    const roleId = relationId(user.role_id);
    const admin = authenticated?.admin === true
        || authenticated?.isAdmin === true
        || user.role === "ADMIN"
        || user.isAdmin === true
        || Number(user.isAdmin) === 1;

    const requestedPaths = options.modulePaths?.length
        ? [...options.modulePaths]
        : options.modulePath
            ? [options.modulePath]
            : [];
    const requestedSlugs = options.moduleSlugs?.length
        ? [...options.moduleSlugs]
        : options.moduleSlug
            ? [options.moduleSlug]
            : [];

    const hasModule = admin || accessRows.some(row => {
        if (!row.module_id || typeof row.module_id !== "object") return false;
        const rowSlug = typeof row.module_id.slug === "string" ? row.module_id.slug.trim() : "";
        const rowPath = normalizePath(row.module_id.base_path);

        if (requestedSlugs.length > 0 && rowSlug && requestedSlugs.includes(rowSlug)) {
            return true;
        }

        if (requestedPaths.length > 0 && rowPath) {
            return requestedPaths.some(p => {
                const clean = normalizePath(p);
                return clean === rowPath || clean.startsWith(`${rowPath}/`) || rowPath.startsWith(`${clean}/`);
            });
        }

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
        modulePath: requestedPaths[0],
        approvalStage: options.approvalStage || null,
        canReject: true
    };
}
