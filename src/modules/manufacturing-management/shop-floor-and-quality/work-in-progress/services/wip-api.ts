import { toast } from "sonner";
import type { WipApiResponse, WipFilterState } from "../types";

export async function fetchWipData(filters?: Partial<WipFilterState>): Promise<WipApiResponse> {
    try {
        const params = new URLSearchParams();

        if (filters?.jobOrderId && filters.jobOrderId !== "all") {
            params.set("job_order_id", filters.jobOrderId);
        }
        if (filters?.branchId && filters.branchId !== "all") {
            params.set("branch_id", filters.branchId);
        }
        if (filters?.materialId && filters.materialId !== "all") {
            params.set("material_id", filters.materialId);
        }
        if (filters?.status && filters.status !== "all") {
            params.set("status", filters.status);
        }
        if (filters?.search) {
            params.set("search", filters.search);
        }
        if (filters?.dateFrom) {
            params.set("date_from", filters.dateFrom);
        }
        if (filters?.dateTo) {
            params.set("date_to", filters.dateTo);
        }

        const queryString = params.toString();
        const url = `/api/manufacturing/shop-floor-and-quality/work-in-progress${queryString ? `?${queryString}` : ""}`;

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        if (!res.ok) {
            const errorPayload = await res.json().catch(() => null);
            const message = errorPayload?.error || `Failed to retrieve WIP tracking data (${res.status})`;
            toast.error(message);
            throw new Error(message);
        }

        const data: WipApiResponse = await res.json();
        return data;
    } catch (err) {
        console.error("[WIP API Client]", err);
        throw err;
    }
}
