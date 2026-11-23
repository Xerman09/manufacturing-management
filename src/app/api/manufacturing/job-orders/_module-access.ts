import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { JobOrderWorkflowAction } from "@/modules/manufacturing-management/job-order-workflow";

export const JOB_ORDER_MODULE_PATHS = {
    planning: "/mm/planning-engineering",
    staging: "/mm/material-staging",
    production: "/mm/shop-floor-execution-terminal",
    qualityAssurance: "/mm/manufacturing-qa",
    inspectionQa: "/mm/manufacturing-job-order-inspection-qa",
    calendarOfSchedule: "/mm/calendar-of-schedule",
    costVariance: "/mm/cost-variance",
    salesOrders: "/mm/sales-and-fulfillment/sales-order"
} as const;

export const JOB_ORDER_MODULE_SLUGS: Record<keyof typeof JOB_ORDER_MODULE_PATHS, string[]> = {
    planning: ["planning-engineering", "planning", "master-planning"],
    staging: ["material-staging", "staging"],
    production: ["shop-floor-execution-terminal", "shop-floor", "production"],
    qualityAssurance: ["manufacturing-qa", "qa", "quality-assurance"],
    inspectionQa: ["manufacturing-job-order-inspection-qa", "job-order-inspection-qa", "inspection-qa"],
    calendarOfSchedule: ["calendar-of-schedule", "calendar", "schedule"],
    costVariance: ["cost-variance", "variance"],
    salesOrders: ["sales-order", "sales-orders", "sales-and-fulfillment"]
};

export type JobOrderModulePath = typeof JOB_ORDER_MODULE_PATHS[keyof typeof JOB_ORDER_MODULE_PATHS] | string;

export class JobOrderModuleAccessError extends Error {
    constructor(
        readonly status: 401 | 403 | 503,
        readonly code: "AUTHENTICATION_REQUIRED" | "MODULE_ACCESS_REQUIRED" | "MODULE_ACCESS_SERVICE_UNAVAILABLE",
        message: string
    ) {
        super(message);
        this.name = "JobOrderModuleAccessError";
    }
}

export interface AuthorizedJobOrderUser {
    userId: number;
    admin: boolean;
    canRevokeYieldAudit: boolean;
}

interface ModuleAccessRow {
    module_id?: { base_path?: unknown; slug?: unknown } | number | null;
}

interface AuthenticatedUser {
    id?: unknown;
    admin?: unknown;
    isAdmin?: unknown;
    role?: unknown;
}

interface DirectusUser {
    role?: unknown;
    isAdmin?: unknown;
}

function positiveId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isAdminValue(value: unknown): boolean {
    return value === true || value === 1 || value === "1" || String(value ?? "").trim().toLowerCase() === "true";
}

function hasAdminRole(value: unknown): boolean {
    const role = value && typeof value === "object"
        ? (value as Record<string, unknown>).name ?? (value as Record<string, unknown>).code
        : value;
    return String(role ?? "").trim().toUpperCase() === "ADMIN";
}

function responseData<T>(payload: unknown): T | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as { data?: unknown };
    return (record.data ?? payload) as T;
}

async function getJson(response: Response): Promise<unknown> {
    return response.json().catch(() => null);
}

export async function requireJobOrderModuleAccess(
    modulePaths: JobOrderModulePath | readonly JobOrderModulePath[],
    signal?: AbortSignal
): Promise<AuthorizedJobOrderUser> {
    const requestedPaths: readonly JobOrderModulePath[] = typeof modulePaths === "string"
        ? [modulePaths]
        : modulePaths;
    if (requestedPaths.length === 0) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Job Order module access is not configured.");
    }

    const token = (await cookies()).get("vos_access_token")?.value;
    if (!token) {
        throw new JobOrderModuleAccessError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    }

    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");
    if (!springBase) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Authentication service is not configured.");
    }

    let authResponse: Response;
    try {
        authResponse = await fetch(`${springBase}/auth/me`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store",
            signal
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Authentication service is unavailable.");
    }
    if (authResponse.status === 401 || authResponse.status === 403) {
        throw new JobOrderModuleAccessError(401, "AUTHENTICATION_REQUIRED", "Your session is invalid or has expired.");
    }
    if (!authResponse.ok) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Authentication service is unavailable.");
    }

    const authenticatedPayload = await getJson(authResponse);
    if (signal?.aborted) throw signal.reason;
    const authenticated = responseData<AuthenticatedUser>(authenticatedPayload);
    const userId = positiveId(authenticated?.id);
    if (!userId) {
        throw new JobOrderModuleAccessError(401, "AUTHENTICATION_REQUIRED", "Unable to verify the current user.");
    }

    const directusBase = (process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL)?.replace(/\/+$/, "");
    const directusToken = process.env.DIRECTUS_STATIC_TOKEN;
    if (!directusBase || !directusToken) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Module authorization service is not configured.");
    }

    const authHeaders = { Authorization: `Bearer ${directusToken}`, Accept: "application/json" };
    const accessParams = new URLSearchParams({
        "filter[user_id][_eq]": String(userId),
        fields: "module_id.base_path,module_id.slug",
        limit: "-1"
    });

    let userResponse: Response;
    let accessResponse: Response;
    try {
        [userResponse, accessResponse] = await Promise.all([
            fetch(`${directusBase}/items/user/${userId}?fields=role,isAdmin`, { headers: authHeaders, cache: "no-store", signal }),
            fetch(`${directusBase}/items/user_access_modules?${accessParams.toString()}`, { headers: authHeaders, cache: "no-store", signal })
        ]);
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Module authorization service is unavailable.");
    }
    if (!userResponse.ok || !accessResponse.ok) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Unable to verify Job Order module access.");
    }

    const directusUser = responseData<DirectusUser>(await getJson(userResponse));
    const accessPayload = await getJson(accessResponse);
    if (signal?.aborted) throw signal.reason;
    const accessRows = responseData<ModuleAccessRow[]>(accessPayload);
    if (!directusUser || !Array.isArray(accessRows)) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Module authorization service returned an invalid response.");
    }

    const admin = isAdminValue(authenticated?.admin)
        || isAdminValue(authenticated?.isAdmin)
        || hasAdminRole(authenticated?.role)
        || hasAdminRole(directusUser.role)
        || isAdminValue(directusUser.isAdmin);

    const normalizePathStr = (p?: unknown): string => {
        if (typeof p !== "string") return "";
        return p.trim().replace(/\/+$/, "");
    };

    const hasModuleAccess = admin || accessRows.some((row) => {
        if (!row.module_id || typeof row.module_id !== "object") return false;
        const rowSlug = typeof row.module_id.slug === "string" ? row.module_id.slug.trim() : "";
        const rowBasePath = normalizePathStr(row.module_id.base_path);

        return requestedPaths.some((p) => {
            const cleanTarget = normalizePathStr(p);
            // Match slug directly if target matches
            if (rowSlug && cleanTarget.toLowerCase().includes(rowSlug.toLowerCase())) return true;
            // Match base path exactly or hierarchical
            if (rowBasePath && cleanTarget) {
                return cleanTarget === rowBasePath
                    || cleanTarget.startsWith(`${rowBasePath}/`)
                    || rowBasePath.startsWith(`${cleanTarget}/`);
            }
            return false;
        });
    });
    if (!hasModuleAccess) {
        throw new JobOrderModuleAccessError(403, "MODULE_ACCESS_REQUIRED", "You do not have access to this Job Order module.");
    }

    return {
        userId,
        admin,
        canRevokeYieldAudit: requestedPaths.some((path) =>
            path === JOB_ORDER_MODULE_PATHS.qualityAssurance
            || path === JOB_ORDER_MODULE_PATHS.inspectionQa
        )
    };
}

export async function authorizeJobOrderModuleAccess(
    modulePaths: JobOrderModulePath | readonly JobOrderModulePath[],
    signal?: AbortSignal
): Promise<NextResponse | null> {
    try {
        await requireJobOrderModuleAccess(modulePaths, signal);
        return null;
    } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof JobOrderModuleAccessError) {
            return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
        }
        console.error("Job Order module authorization failed:", error);
        return NextResponse.json({
            success: false,
            error: "Unable to verify Job Order module access.",
            code: "MODULE_ACCESS_SERVICE_UNAVAILABLE"
        }, { status: 503 });
    }
}

export function jobOrderWorkflowModulePath(
    action: JobOrderWorkflowAction
): JobOrderModulePath | readonly JobOrderModulePath[] {
    switch (action) {
        case "initialize":
            return JOB_ORDER_MODULE_PATHS.planning;
        case "pick":
            return JOB_ORDER_MODULE_PATHS.staging;
        case "start-production":
        case "place-on-hold":
        case "resume-production":
        case "complete-production":
        case "terminate-production":
        case "cancel":
            return JOB_ORDER_MODULE_PATHS.production;
        case "begin-qa-reconciliation":
            return JOB_ORDER_MODULE_PATHS.qualityAssurance;
        case "close":
            return [JOB_ORDER_MODULE_PATHS.qualityAssurance, JOB_ORDER_MODULE_PATHS.inspectionQa];
    }
}
