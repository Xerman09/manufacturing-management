import {
    OffsettingSheetQueueItem,
    OffsettingLineDetail,
    OffsettingPairing,
    OffsettingFilters,
    Branch,
} from "../types";
import { normalizeOffsetPairings, offsetFlag, readOffsetPairings } from "../utils/offset-pairings";

const API_BASE = "/api/manufacturing/physical-inventory-manufacturing";

export function parseOffsettingSheetData(item: Record<string, unknown>): OffsettingSheetQueueItem {
    const details: OffsettingLineDetail[] = Array.isArray(item.details)
        ? (item.details as OffsettingLineDetail[])
        : [];

    let totalShortageQty = 0;
    let totalShortageCost = 0;
    let totalSurplusQty = 0;
    let totalSurplusCost = 0;

    for (const d of details) {
        const sys = Number(d.system_count || 0);
        const phys = Number(d.physical_count !== null && d.physical_count !== undefined ? d.physical_count : sys);
        const rawVar = d.variance !== undefined ? Number(d.variance) : phys - sys;
        const unitCost = Number(d.unit_cost || 0);

        if (rawVar < -0.0001) {
            const qty = Math.abs(rawVar);
            totalShortageQty += qty;
            totalShortageCost += qty * unitCost;
        } else if (rawVar > 0.0001) {
            totalSurplusQty += rawVar;
            totalSurplusCost += rawVar * unitCost;
        }
    }

    const storedPairings: OffsettingPairing[] = Array.isArray(item.offset_pairings)
        ? (item.offset_pairings as OffsettingPairing[])
        : readOffsetPairings(item.remarks);
    const pairings = details.length ? normalizeOffsetPairings(storedPairings, details, false) : storedPairings;

    let totalOffsetQty = 0;
    let netFinancialImpact = 0;
    for (const p of pairings) {
        totalOffsetQty += Number(p.offset_qty || 0);
        netFinancialImpact += Number(p.net_financial_impact || 0);
    }

    const isCommitted =
        offsetFlag(item.isCommitted) ||
        String(item.status) === "COMMITTED" ||
        String(item.status) === "POSTED";

    let offsettingStatus: OffsettingSheetQueueItem["offsetting_status"] = "PENDING_OFFSETTING";
    if (isCommitted) {
        offsettingStatus = "COMMITTED";
    } else if (totalOffsetQty > 0 && totalOffsetQty >= Math.min(totalShortageQty, totalSurplusQty)) {
        offsettingStatus = "FULLY_RECONCILED";
    } else if (totalOffsetQty > 0) {
        offsettingStatus = "PARTIALLY_OFFSET";
    }

    const branchObj = typeof item.branch_id === "object" ? (item.branch_id as Branch) : null;
    const branchName = branchObj?.branch_name || branchObj?.branchName || `Branch #${item.branch_id}`;

    return {
        physical_inventory_id: Number(item.physical_inventory_id || item.id || 0),
        pi_no: String(item.pi_no || `PI-${item.physical_inventory_id}`),
        starting_date: String(item.starting_date || ""),
        cutoff_date: String(item.cutoff_date || ""),
        stock_type: String(item.stock_type || "REGULAR"),
        branch_id: item.branch_id as number | Branch,
        branch_name: branchName,
        status: String(item.status || "DRAFT"),
        offsetting_status: offsettingStatus,
        total_system_quantity: Number(item.total_system_quantity || 0),
        total_physical_quantity: Number(item.total_physical_quantity || 0),
        total_variance: Number(item.total_variance || 0),
        total_difference_cost: Number(item.total_difference_cost || 0),
        total_shortage_qty: totalShortageQty,
        total_shortage_cost: totalShortageCost,
        total_surplus_qty: totalSurplusQty,
        total_surplus_cost: totalSurplusCost,
        total_offset_qty: totalOffsetQty,
        net_financial_offset_impact: netFinancialImpact,
        isCommitted,
        isCancelled: offsetFlag(item.isCancelled) || String(item.status).toUpperCase() === "CANCELLED",
        committed_at: item.committed_at ? String(item.committed_at) : null,
        details,
        offset_pairings: pairings,
    };
}

export async function fetchOffsettingQueueSheets(filters?: OffsettingFilters): Promise<OffsettingSheetQueueItem[]> {
    try {
        const params = new URLSearchParams();
        if (filters?.search) params.append("search", filters.search);
        if (filters?.branch_id) params.append("branch_id", filters.branch_id);
        if (filters?.stock_type) params.append("stock_type", filters.stock_type);

        const statusParam = filters?.offsetting_status || "PENDING_REVIEW,COMMITTED";
        params.append("status", statusParam);

        const res = await fetch(`${API_BASE}?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || json.success === false) throw new Error(json.error || "Failed to fetch physical inventory sheets");
        const rawList: Array<Record<string, unknown>> = json.data || [];

        // Only show PENDING_REVIEW and COMMITTED sheets for Offsetting (filter out DRAFT and CANCELLED)
        const list = rawList.filter(item => {
            const s = String(item.status || "").toUpperCase();
            const isCommitted = offsetFlag(item.isCommitted) || s === "COMMITTED" || s === "POSTED";
            const isPendingReview = s === "PENDING_REVIEW";
            const isCancelled = offsetFlag(item.isCancelled) || s === "CANCELLED";

            return (isPendingReview || isCommitted) && !isCancelled;
        });

        const fullSheets = await Promise.all(
            list.map(async (item) => {
                const sheetId = Number(item.physical_inventory_id || item.id || 0);
                if (sheetId > 0 && (!item.details || !Array.isArray(item.details) || item.details.length === 0)) {
                    const full = await fetchOffsettingSheetById(sheetId);
                    if (full) return full;
                }
                return parseOffsettingSheetData(item);
            })
        );

        return fullSheets;
    } catch (e) {
        console.error("Error fetching offsetting queue sheets:", e);
        throw e;
    }
}

export async function fetchOffsettingSheetById(id: number): Promise<OffsettingSheetQueueItem> {
    try {
        const res = await fetch(`${API_BASE}/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || json.success === false) throw new Error(json.error || "Failed to load the audit record. Retry loading.");
        const item = json.data;
        if (!item) throw new Error("The audit record response is incomplete. Retry loading.");

        return parseOffsettingSheetData(item);
    } catch (e) {
        console.error("Error fetching offsetting sheet by ID:", e);
        throw e;
    }
}

export async function saveOffsettingPairings(
    sheetId: number,
    pairings: OffsettingPairing[]
): Promise<OffsettingPairing[]> {
    const res = await fetch(`${API_BASE}/${sheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset_pairings: pairings }),
    });
    const json = await res.json();
    if (!res.ok || json.success !== true) throw new Error(json.error || "Failed to save offset pairs. Your changes have been retained; retry saving.");
    if (!Array.isArray(json.data?.offset_pairings)) throw new Error("The saved offset pairs could not be verified. Retry saving or reload the record.");
    return json.data.offset_pairings;
}

export async function commitOffsettingSheet(sheetId: number, auditNotes?: string): Promise<boolean> {
    try {
        const res = await fetch(`${API_BASE}/${sheetId}/commit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ remarks: auditNotes || "Audited and committed via Offsetting Module" }),
        });
        const json = await res.json();
        if (!res.ok || json.success !== true) {
            throw new Error(json.error || "Failed to commit offsetting sheet");
        }
        return true;
    } catch (e) {
        console.error("Error committing offsetting sheet:", e);
        throw e;
    }
}
