import { RequestedItem, RfqProject, SupplierBid } from "../types";
import { calculateSupplierLandedCost } from "./landed-cost-calculator";

export interface OptimizationResult {
    optimizedTotalCompCurr: number;
    supplierAwardMap: Record<string, string>; // rfqItemId -> bidId
    participatingBidIds: string[];
    costPerSupplier: Record<string, number>;
}

/**
 * Finds the combination of valid suppliers that achieves the lowest total landed cost,
 * correctly recalculating each supplier's landed cost on only the subset of items awarded to it.
 */
export function optimizeSplitAward(
    project: RfqProject,
    validBids: SupplierBid[]
): OptimizationResult | null {
    const items = project.items || [];
    if (items.length === 0 || validBids.length === 0) return null;

    // Filter to bids that have quoted at least one item
    const eligibleBids = validBids.filter((bid) => {
        return items.some((item) => {
            const q = bid.quotations?.[item.id];
            return q && q.priceBreaks && q.priceBreaks.length > 0;
        });
    });

    if (eligibleBids.length === 0) return null;

    const n = items.length;
    const memoCost: Map<string, number> = new Map();

    const getCost = (bid: SupplierBid, mask: number): number => {
        const key = `${bid.id}:${mask}`;
        if (memoCost.has(key)) return memoCost.get(key)!;

        const awardedItemIds = new Set<string>();
        for (let i = 0; i < n; i++) {
            if ((mask & (1 << i)) !== 0) {
                awardedItemIds.add(items[i].id);
            }
        }

        const res = calculateSupplierLandedCost(project, items, bid, awardedItemIds);
        memoCost.set(key, res.totalLandedCostCompCurr);
        return res.totalLandedCostCompCurr;
    };

    // Precompute valid item masks for each bid (supplier must have quoted all items in the mask)
    const bidItemBitmasks = new Map<string, number>();
    for (const bid of eligibleBids) {
        let mask = 0;
        for (let i = 0; i < n; i++) {
            const q = bid.quotations?.[items[i].id];
            if (q && q.priceBreaks && q.priceBreaks.length > 0) {
                mask |= 1 << i;
            }
        }
        bidItemBitmasks.set(bid.id, mask);
    }

    // Exact branch-and-bound assignment
    const bestAssignment: number[] = new Array(n).fill(-1);
    let bestTotalCost = Infinity;

    // Initial upper bound: single supplier full bids if any
    for (let bIdx = 0; bIdx < eligibleBids.length; bIdx++) {
        const bid = eligibleBids[bIdx];
        const fullMask = (1 << n) - 1;
        if ((bidItemBitmasks.get(bid.id)! & fullMask) === fullMask) {
            const cost = getCost(bid, fullMask);
            if (cost < bestTotalCost) {
                bestTotalCost = cost;
                bestAssignment.fill(bIdx);
            }
        }
    }

    // Heuristic initial assignment: cheapest valid unit landed cost per item
    const initialAssignment = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
        let bestBidIdx = -1;
        let lowestUnitCost = Infinity;
        for (let bIdx = 0; bIdx < eligibleBids.length; bIdx++) {
            const bid = eligibleBids[bIdx];
            if ((bidItemBitmasks.get(bid.id)! & (1 << i)) !== 0) {
                const singleRes = calculateSupplierLandedCost(project, items, bid, new Set([items[i].id]));
                const unitCost = singleRes.items[items[i].id]?.landedUnitCostCompCurr || Infinity;
                if (unitCost < lowestUnitCost) {
                    lowestUnitCost = unitCost;
                    bestBidIdx = bIdx;
                }
            }
        }
        initialAssignment[i] = bestBidIdx;
    }

    if (initialAssignment.every((idx) => idx !== -1)) {
        // Calculate total cost of initial assignment
        const masks = new Array(eligibleBids.length).fill(0);
        for (let i = 0; i < n; i++) {
            masks[initialAssignment[i]] |= 1 << i;
        }
        let initialCost = 0;
        for (let bIdx = 0; bIdx < eligibleBids.length; bIdx++) {
            if (masks[bIdx] > 0) {
                initialCost += getCost(eligibleBids[bIdx], masks[bIdx]);
            }
        }
        if (initialCost < bestTotalCost) {
            bestTotalCost = initialCost;
            for (let i = 0; i < n; i++) {
                bestAssignment[i] = initialAssignment[i];
            }
        }
    }

    // If item count <= 10, run exact search across item partitions
    if (n <= 10 && eligibleBids.length <= 10) {
        const currentAssignment = new Array(n).fill(-1);

        const search = (itemIdx: number) => {
            if (itemIdx === n) {
                // Evaluate partition
                const masks = new Array(eligibleBids.length).fill(0);
                for (let i = 0; i < n; i++) {
                    masks[currentAssignment[i]] |= 1 << i;
                }
                let totalCost = 0;
                for (let bIdx = 0; bIdx < eligibleBids.length; bIdx++) {
                    if (masks[bIdx] > 0) {
                        totalCost += getCost(eligibleBids[bIdx], masks[bIdx]);
                        if (totalCost >= bestTotalCost) return;
                    }
                }
                if (totalCost < bestTotalCost) {
                    bestTotalCost = totalCost;
                    for (let i = 0; i < n; i++) {
                        bestAssignment[i] = currentAssignment[i];
                    }
                }
                return;
            }

            for (let bIdx = 0; bIdx < eligibleBids.length; bIdx++) {
                const bid = eligibleBids[bIdx];
                if ((bidItemBitmasks.get(bid.id)! & (1 << itemIdx)) !== 0) {
                    currentAssignment[itemIdx] = bIdx;
                    search(itemIdx + 1);
                }
            }
        };

        search(0);
    }

    if (bestTotalCost === Infinity || bestAssignment.includes(-1)) {
        return null;
    }

    const supplierAwardMap: Record<string, string> = {};
    const participatingBidIds = new Set<string>();
    const costPerSupplier: Record<string, number> = {};

    const finalMasks = new Array(eligibleBids.length).fill(0);
    for (let i = 0; i < n; i++) {
        const bIdx = bestAssignment[i];
        const bid = eligibleBids[bIdx];
        supplierAwardMap[items[i].id] = bid.id;
        participatingBidIds.add(bid.id);
        finalMasks[bIdx] |= 1 << i;
    }

    for (let bIdx = 0; bIdx < eligibleBids.length; bIdx++) {
        if (finalMasks[bIdx] > 0) {
            const bid = eligibleBids[bIdx];
            costPerSupplier[bid.id] = getCost(bid, finalMasks[bIdx]);
        }
    }

    return {
        optimizedTotalCompCurr: Number(bestTotalCost.toFixed(2)),
        supplierAwardMap,
        participatingBidIds: Array.from(participatingBidIds),
        costPerSupplier,
    };
}
