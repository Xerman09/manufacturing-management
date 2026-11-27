import { cookies } from "next/headers";
import { headers as directusHeaders } from "@/app/api/manufacturing/directus-api";

const MODULE_PATH = "/mm/reports/predictive-maintenance-report";

interface AuthenticatedUser {
    id?: unknown;
    admin?: unknown;
    isAdmin?: unknown;
    role?: unknown;
}

export type PredictiveReportAccessResult =
    | { ok: true; userId: number; isAdmin: boolean; accessToken: string }
    | { ok: false; status: number; error: string };

function positiveId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function authorizePredictiveMaintenanceReport(
    signal?: AbortSignal
): Promise<PredictiveReportAccessResult> {
    const cookieStore = await cookies();
    const token =
        cookieStore.get("vos_mm_access_token")?.value ||
        cookieStore.get("vos_mm_springboot_token")?.value ||
        cookieStore.get("token")?.value;

    if (!token) {
        return { ok: false, status: 401, error: "Authentication is required." };
    }

    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");
    if (!springBase) {
        return { ok: false, status: 503, error: "Authentication service is not configured." };
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
        return { ok: false, status: 503, error: "Authentication service is unavailable." };
    }

    if (authResponse.status === 401 || authResponse.status === 403) {
        return { ok: false, status: 401, error: "Your session is invalid or has expired." };
    }
    if (!authResponse.ok) {
        return { ok: false, status: 503, error: "Authentication service is unavailable." };
    }

    let user: AuthenticatedUser;
    try {
        user = (await authResponse.json()) as AuthenticatedUser;
    } catch (error) {
        if (signal?.aborted) throw error;
        return { ok: false, status: 503, error: "Authentication service returned an invalid response." };
    }

    const userId = positiveId(user.id);
    if (!userId) {
        return { ok: false, status: 401, error: "Unable to verify the current user." };
    }

    const isAdmin = user.admin === true || user.isAdmin === true || user.role === "ADMIN";
    if (isAdmin) {
        return { ok: true, userId, isAdmin: true, accessToken: token };
    }

    const directusBase = (process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL)?.replace(/\/+$/, "");
    if (!directusBase) {
        return { ok: false, status: 503, error: "Module authorization service is not configured." };
    }

    const params = new URLSearchParams({
        "filter[user_id][_eq]": String(userId),
        fields: "module_id.base_path",
        limit: "-1"
    });

    let accessResponse: Response;
    try {
        accessResponse = await fetch(`${directusBase}/items/user_access_modules?${params.toString()}`, {
            headers: directusHeaders,
            cache: "no-store",
            signal
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        return { ok: false, status: 503, error: "Module authorization service is unavailable." };
    }

    if (!accessResponse.ok) {
        return { ok: false, status: 503, error: "Unable to verify module permissions." };
    }

    interface UserAccessItem {
        module_id?: { base_path?: unknown } | number | null;
    }

    let records: UserAccessItem[] = [];
    try {
        const body = (await accessResponse.json()) as { data?: unknown };
        if (Array.isArray(body?.data)) {
            records = body.data as UserAccessItem[];
        }
    } catch {
        return { ok: false, status: 503, error: "Malformed response from permissions service." };
    }

    const authorized = records.some((r) => {
        if (typeof r.module_id === "object" && r.module_id !== null) {
            return r.module_id.base_path === MODULE_PATH;
        }
        return false;
    });

    if (!authorized) {
        // Fallback check: if user has access to reports parent module or any reporting modules
        const canAccessReports = records.some((r) => {
            if (typeof r.module_id === "object" && r.module_id !== null) {
                const path = String(r.module_id.base_path || "");
                return path.includes("/mm/reports");
            }
            return false;
        });
        if (!canAccessReports) {
            return {
                ok: false,
                status: 403,
                error: "You do not have permission to view the Predictive Maintenance Report."
            };
        }
    }

    return { ok: true, userId, isAdmin: false, accessToken: token };
}
