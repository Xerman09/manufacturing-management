import type { WipLotReservation, WipMaterialItem, WipMaterialStatus } from "../types";

export const EPSILON = 0.000001;

export function round4(value: number): number {
    return Math.round((Number.isFinite(value) ? value : 0) * 10000) / 10000;
}

/**
 * Business Rule:
 * Remaining Material WIP = Opening WIP + Issued Quantities - Consumed Quantities - Accepted Returns - Approved Losses
 */
export function calculateRemainingWip(
    issuedQty: number,
    consumedQty: number,
    returnedQty: number,
    lossQty: number,
    openingWip = 0
): number {
    const raw = (openingWip || 0) + (issuedQty || 0) - (consumedQty || 0) - (returnedQty || 0) - (lossQty || 0);
    return round4(raw);
}

/**
 * Determine material WIP status according to business logic rules.
 */
export function determineWipStatus(
    reservedQty: number,
    issuedQty: number,
    consumedQty: number,
    returnedQty: number,
    lossQty: number,
    remainingWip: number
): WipMaterialStatus {
    // If consumed strictly exceeds issued, flag as negative WIP exception
    if (consumedQty > issuedQty + EPSILON) {
        return "EXCEPTION_OVER_CONSUMED";
    }

    // Fully returned before any consumption
    if (remainingWip <= EPSILON && returnedQty > 0 && consumedQty <= EPSILON) {
        return "RETURNED";
    }

    // Fully consumed (no WIP left on floor)
    if (remainingWip <= EPSILON && consumedQty > 0 && (consumedQty + returnedQty + lossQty >= issuedQty - EPSILON)) {
        return "CONSUMED";
    }

    // Actively running in production with partial remaining WIP
    if (consumedQty > EPSILON && remainingWip > EPSILON) {
        return "PARTIALLY_CONSUMED";
    }

    // Staged/issued to floor, awaiting run
    if (issuedQty > EPSILON) {
        return "ISSUED_TO_PRODUCTION";
    }

    // Otherwise reserved in warehouse
    return "RESERVED";
}

/**
 * Checks if a lot reservation has expired while currently sitting in WIP.
 * Per business rules:
 * - Packaging materials follow FIFO and are never flagged as expired.
 * - Depleted or consumed lots (remaining <= 0) are NOT flagged as expired because 0 stock is on the floor.
 */
export function isLotExpired(
    expiryDate: string | null | undefined,
    remainingWipQuantity: number,
    isPackaging = false,
    nowTimestamp = Date.now()
): boolean {
    if (isPackaging) return false;
    if (remainingWipQuantity <= EPSILON) return false;
    if (!expiryDate) return false;
    const expTime = new Date(expiryDate).getTime();
    return Number.isFinite(expTime) && expTime < nowTimestamp;
}

/**
 * Context-aware status for an individual lot reservation.
 */
export function determineLotStatus(lot: {
    remainingWipQuantity: number;
    actualUsedQuantity: number;
    issuedToWipQuantity: number;
    returnedQuantity: number;
    reservedQuantity: number;
    reservationStatus?: string | null;
}): string {
    const rem = lot.remainingWipQuantity;
    const used = lot.actualUsedQuantity;
    const issued = lot.issuedToWipQuantity;
    const ret = lot.returnedQuantity;

    if (rem < -EPSILON) {
        return "DEFICIT";
    }
    if (rem <= EPSILON && used > EPSILON && (used + ret >= issued - EPSILON)) {
        return "CONSUMED";
    }
    if (rem <= EPSILON && ret > EPSILON && used <= EPSILON) {
        return "RETURNED";
    }
    if (rem > EPSILON && issued > EPSILON) {
        return "WIP";
    }
    if (issued <= EPSILON && lot.reservedQuantity > EPSILON) {
        return "ALLOCATED";
    }
    return lot.reservationStatus || "ALLOCATED";
}

/**
 * Sorts lots by FEFO (First Expired, First Out) for raw materials/ingredients,
 * or FIFO (earliest creation/batch) for packaging.
 */
export function sortLotsByInventoryStrategy(
    lots: WipLotReservation[],
    isPackaging = false
): WipLotReservation[] {
    return [...lots].sort((a, b) => {
        if (!isPackaging) {
            // FEFO: Nearest expiry first. Lots without expiry go to the end.
            if (!a.expiryDate && !b.expiryDate) return 0;
            if (!a.expiryDate) return 1;
            if (!b.expiryDate) return -1;
            const timeA = new Date(a.expiryDate).getTime();
            const timeB = new Date(b.expiryDate).getTime();
            return timeA - timeB;
        }

        // FIFO: Sort by reservation ID / created order
        return a.reservationId - b.reservationId;
    });
}

/**
 * Formats a numeric value for UI display with context-aware precision.
 * Strictly returns "-" for empty or invalid values per manufacturing_guide.md.
 */
export function formatQty(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) {
        return "-";
    }
    const num = Number(value);
    if (num === 0) return "0";
    // If integer, display without decimal places
    if (Number.isInteger(num)) return num.toLocaleString("en-US");
    // Otherwise up to 4 decimal places without trailing zeros
    return round4(num).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    });
}

/**
 * Filter WIP items based on user search and dropdown selections.
 */
export function filterWipItems(
    items: WipMaterialItem[],
    filters: {
        jobOrderId: string;
        branchId: string;
        materialId: string;
        status: string;
        search: string;
        dateFrom: string;
        dateTo: string;
    }
): WipMaterialItem[] {
    const q = filters.search.trim().toLowerCase();

    return items.filter((item) => {
        // Job Order filter
        if (filters.jobOrderId && filters.jobOrderId !== "all") {
            if (String(item.jobOrderId) !== filters.jobOrderId) return false;
        }

        // Branch filter
        if (filters.branchId && filters.branchId !== "all") {
            if (String(item.branchId) !== filters.branchId) return false;
        }

        // Material filter
        if (filters.materialId && filters.materialId !== "all") {
            if (String(item.materialId) !== filters.materialId) return false;
        }

        // Status filter
        if (filters.status && filters.status !== "all") {
            if (filters.status === "EXCEPTION") {
                if (item.status !== "EXCEPTION_OVER_CONSUMED" && !item.hasDiscrepancy) return false;
            } else if (item.status !== filters.status) {
                return false;
            }
        }

        // Date range filter against Job Order start/end date
        if (filters.dateFrom) {
            const itemDate = item.startDate ? new Date(item.startDate) : null;
            if (itemDate && itemDate < new Date(filters.dateFrom)) return false;
        }
        if (filters.dateTo) {
            const itemDate = item.endDate ? new Date(item.endDate) : item.startDate ? new Date(item.startDate) : null;
            if (itemDate) {
                const toLimit = new Date(filters.dateTo);
                toLimit.setHours(23, 59, 59, 999);
                if (itemDate > toLimit) return false;
            }
        }

        // Free-text search
        if (q) {
            const matchJo = item.jobOrderNo.toLowerCase().includes(q);
            const matchTargetProduct = item.targetProductName.toLowerCase().includes(q);
            const matchMaterial = item.materialName.toLowerCase().includes(q) || item.materialCode.toLowerCase().includes(q);
            const matchBranch = item.branchName.toLowerCase().includes(q);
            const matchLot = item.lots.some(
                (l) => l.batchNo.toLowerCase().includes(q) || (l.stagingBin && l.stagingBin.toLowerCase().includes(q))
            );
            if (!matchJo && !matchTargetProduct && !matchMaterial && !matchBranch && !matchLot) {
                return false;
            }
        }

        return true;
    });
}
