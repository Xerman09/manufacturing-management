import { FetchLeadTimeParams, PaginatedLeadTimeResponse } from "../types";

export const leadTimeTrackerService = {
    async fetchLeadTimes(params: FetchLeadTimeParams): Promise<PaginatedLeadTimeResponse> {
        const query = new URLSearchParams();

        if (params.search) query.set("search", params.search);
        if (params.branchId !== undefined && params.branchId !== null) {
            query.set("branchId", String(params.branchId));
        }
        if (params.customerCode) query.set("customerCode", params.customerCode);
        if (params.status && params.status !== "All") query.set("status", params.status);
        if (params.startDate) query.set("startDate", params.startDate);
        if (params.endDate) query.set("endDate", params.endDate);
        if (params.page) query.set("page", String(params.page));
        if (params.pageSize) query.set("pageSize", String(params.pageSize));

        const res = await fetch(
            `/api/manufacturing/sales-and-fulfillment/customer-order-lead-time-tracker?${query.toString()}`,
            {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
            }
        );

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Failed to fetch lead times (${res.status})`);
        }

        return res.json();
    },
};
