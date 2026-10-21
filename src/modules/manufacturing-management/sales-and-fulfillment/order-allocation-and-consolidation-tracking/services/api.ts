// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/services/api.ts

import { toast } from "sonner";
import {
    TrackingFilterParams,
    TrackingApiResponse,
    OrderTrackingItem,
    BranchOption,
} from "../types";

const BASE_API = "/api/manufacturing/sales-and-fulfillment/order-allocation-and-consolidation-tracking";

export async function fetchOrderTrackingList(
    params: TrackingFilterParams
): Promise<TrackingApiResponse> {
    try {
        const query = new URLSearchParams();
        if (params.branchId !== undefined) {
            query.set("branchId", String(params.branchId));
        }
        if (params.search) {
            query.set("search", params.search.trim());
        }
        if (params.stage && params.stage !== "All") {
            query.set("stage", params.stage);
        }
        if (params.allocationStatus && params.allocationStatus !== "All") {
            query.set("allocationStatus", params.allocationStatus);
        }
        if (params.consolidationStatus && params.consolidationStatus !== "All") {
            query.set("consolidationStatus", params.consolidationStatus);
        }
        if (params.exceptionsOnly) {
            query.set("exceptionsOnly", "true");
        }
        if (params.page !== undefined) {
            query.set("page", String(params.page));
        }
        if (params.pageSize !== undefined) {
            query.set("pageSize", String(params.pageSize));
        }
        query.set("_ts", String(Date.now()));

        const res = await fetch(`${BASE_API}?${query.toString()}`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const msg = errBody.message || `Failed to fetch tracking list (HTTP ${res.status})`;
            toast.error(msg);
            throw new Error(msg);
        }

        const data: TrackingApiResponse = await res.json();
        return data;
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Error connecting to tracking service";
        // Ensure toast was presented if not already thrown
        if (!errorMsg.includes("HTTP")) {
            toast.error(errorMsg);
        }
        throw err;
    }
}

export async function fetchSingleOrderTracking(
    orderId: number
): Promise<OrderTrackingItem> {
    try {
        const res = await fetch(`${BASE_API}/${orderId}?_ts=${Date.now()}`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const msg = errBody.message || `Failed to fetch order #${orderId} details (HTTP ${res.status})`;
            toast.error(msg);
            throw new Error(msg);
        }

        const json = await res.json();
        if (!json.success || !json.data) {
            const msg = json.message || "Failed to load order tracking details";
            toast.error(msg);
            throw new Error(msg);
        }

        return json.data;
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load order drill-down";
        if (!errorMsg.includes("HTTP")) {
            toast.error(errorMsg);
        }
        throw err;
    }
}

export async function fetchBranches(): Promise<BranchOption[]> {
    try {
        const res = await fetch(`${BASE_API}/branches?_ts=${Date.now()}`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        });

        if (!res.ok) {
            toast.error(`Failed to fetch branches (HTTP ${res.status})`);
            return [];
        }

        const json = await res.json();
        return json.data || [];
    } catch {
        toast.error("Network error while loading branches");
        return [];
    }
}
