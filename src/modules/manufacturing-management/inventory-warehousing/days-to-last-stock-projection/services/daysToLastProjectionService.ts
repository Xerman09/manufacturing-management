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

export async function fetchMaterialConsumptionBreakdown(item: import("../types").StockProjectionItem): Promise<VerifiedConsumptionDetail[]> {
    const params = new URLSearchParams({ product_id: String(item.product_id), branch_id: String(item.branch_id), assessment_start: item.assessment_start || "", assessment_end: item.assessment_end, unit_id: String(item.unit_id || "") });
    const response = await fetch(`/api/manufacturing/inventory-warehousing/days-to-last-stock-projection/audit?${params}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Verified consumption unavailable.");
    return body.data;
}
