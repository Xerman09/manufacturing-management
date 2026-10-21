import { OperationsDashboardData } from "../types/operations-dashboard.types";

export interface FetchOperationsDashboardParams {
    branchId?: string | number | null;
    startDate?: string | null;
    endDate?: string | null;
    period?: string | null;
}

export async function fetchOperationsDashboard(
    params: FetchOperationsDashboardParams = {}
): Promise<OperationsDashboardData> {
    const query = new URLSearchParams();

    if (params.branchId && params.branchId !== "all") {
        query.set("branchId", String(params.branchId));
    }
    if (params.startDate) {
        query.set("startDate", params.startDate);
    }
    if (params.endDate) {
        query.set("endDate", params.endDate);
    }
    if (params.period) {
        query.set("period", params.period);
    }

    const url = `/api/manufacturing/operations-dashboard${query.toString() ? `?${query.toString()}` : ""}`;
    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        },
        cache: "no-store"
    });

    if (!res.ok) {
        let errorMsg = `Server error ${res.status}`;
        try {
            const errJson = await res.json();
            if (errJson?.error) errorMsg = errJson.error;
        } catch {
            // Keep status code message
        }
        throw new Error(errorMsg);
    }

    return res.json();
}
