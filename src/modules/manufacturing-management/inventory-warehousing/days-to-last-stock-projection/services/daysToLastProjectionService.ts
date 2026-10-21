import {
    StockProjectionApiResponse,
    VerifiedConsumptionDetail,
    StockProjectionFilters,
} from "../types";

export async function fetchStockProjections(
    filters: StockProjectionFilters
): Promise<StockProjectionApiResponse> {
    const queryParams = new URLSearchParams({
        branch: filters.branch_id === "ALL" ? "" : String(filters.branch_id),
        window_months: String(filters.assessment_window_months),
        working_days: String(filters.working_days_per_month),
    });

    const res = await fetch(
        `/api/manufacturing/inventory-warehousing/days-to-last-stock-projection?${queryParams.toString()}`,
        { cache: "no-store" }
    );

    if (!res.ok) {
        throw new Error(`Server returned error ${res.status}`);
    }

    const data: StockProjectionApiResponse = await res.json();
    return data;
}

export async function fetchMaterialConsumptionBreakdown(
    productId: number,
    branchId?: number
): Promise<VerifiedConsumptionDetail[]> {
    try {
        const params = new URLSearchParams({ product_id: String(productId) });
        if (branchId) params.set("branch_id", String(branchId));

        const res = await fetch(
            `/api/manufacturing/inventory-warehousing/days-to-last-stock-projection/audit?${params.toString()}`,
            { cache: "no-store" }
        );
        if (res.ok) {
            const body = await res.json();
            return body.data || [];
        }
    } catch {
        // Return empty array
    }
    return [];
}
