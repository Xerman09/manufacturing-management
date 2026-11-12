import {
    ComparisonSummary,
    RequestedItem,
    RfqProject,
    SupplierBid,
    SupplierLandedCostResult,
} from "../types";
import { calculateSupplierLandedCost } from "./landed-cost-calculator";

/**
 * Computes comparative scoring across all suppliers and generates the comparison summary.
 */
export function evaluateAndCompareSuppliers(
    project: RfqProject
): ComparisonSummary {
    const items = project.items || [];
    const bids = project.bids || [];

    // 1. Calculate landed cost for each supplier
    const results: Record<string, SupplierLandedCostResult> = {};
    for (const bid of bids) {
        results[bid.id] = calculateSupplierLandedCost(project, items, bid);
    }

    // 2. Determine lowest valid landed unit cost per item (with fallback reference group)
    const validResults = Object.values(results).filter((r) => r.isValid && r.quotedItemCount > 0);
    const refResults = validResults.length > 0 ? validResults : Object.values(results).filter((r) => r.quotedItemCount > 0);

    const lowestValidUnitCostPerItem: Record<string, number> = {};
    for (const item of items) {
        let lowestCost: number | null = null;
        for (const res of refResults) {
            const itemBreakdown = res.items[item.id];
            if (itemBreakdown && itemBreakdown.hasQuote && itemBreakdown.landedUnitCostCompCurr > 0) {
                if (lowestCost === null || itemBreakdown.landedUnitCostCompCurr < lowestCost) {
                    lowestCost = itemBreakdown.landedUnitCostCompCurr;
                }
            }
        }
        if (lowestCost !== null) {
            lowestValidUnitCostPerItem[item.id] = lowestCost;
        }
    }

    // 3. Determine shortest valid lead time (with fallback reference group)
    let shortestValidLeadTime: number | null = null;
    const refBids = validResults.length > 0
        ? bids.filter((b) => results[b.id]?.isValid && results[b.id]?.quotedItemCount > 0)
        : bids.filter((b) => results[b.id]?.quotedItemCount > 0);

    for (const bid of refBids) {
        if (bid.leadTimeDays > 0) {
            if (shortestValidLeadTime === null || bid.leadTimeDays < shortestValidLeadTime) {
                shortestValidLeadTime = bid.leadTimeDays;
            }
        }
    }

    // 4. Calculate Scores for Each Supplier
    const wP = project.scoringWeightPricePct || 50;
    const wQ = project.scoringWeightQualityPct || 35;
    const wL = project.scoringWeightLeadTimePct || 15;
    const totalWeights = wP + wQ + wL;

    for (const bid of bids) {
        const res = results[bid.id];

        // Price Score (P)
        let priceScoreSum = 0;
        if (items.length > 0) {
            for (const item of items) {
                const lowest = lowestValidUnitCostPerItem[item.id];
                const itemBreakdown = res.items[item.id];
                if (lowest && itemBreakdown && itemBreakdown.hasQuote && itemBreakdown.landedUnitCostCompCurr > 0) {
                    priceScoreSum += Math.min(1, lowest / itemBreakdown.landedUnitCostCompCurr);
                } else {
                    // Unquoted item scores 0
                    priceScoreSum += 0;
                }
            }
            res.priceScore = Number(((priceScoreSum / items.length) * 100).toFixed(2));
        }

        // Lead Time Score (L)
        if (shortestValidLeadTime !== null && bid.leadTimeDays > 0) {
            res.leadTimeScore = Number(((shortestValidLeadTime / bid.leadTimeDays) * 100).toFixed(2));
        } else {
            res.leadTimeScore = 0;
        }

        // Overall Score (calculated transparently; unquoted suppliers score 0)
        if (totalWeights > 0 && res.quotedItemCount > 0) {
            const overall = (wP * res.priceScore + wQ * res.qualityScore + wL * res.leadTimeScore) / totalWeights;
            res.overallScore = Number(overall.toFixed(2));
        } else {
            res.overallScore = 0;
        }
    }

    // 5. Rank Valid Suppliers (disqualified/expired can be viewed transparently but are not recommended)
    const sortedValidSuppliers = Object.values(results)
        .filter((r) => r.isValid)
        .sort((a, b) => b.overallScore - a.overallScore);

    sortedValidSuppliers.forEach((s, idx) => {
        results[s.bidId].ranking = idx + 1;
    });

    // 6. Badges & Highlights
    // RECOMMENDED: Highest overall score among valid full bids
    const validFullBids = sortedValidSuppliers.filter((s) => s.isFullBid);
    let recommendedBidId: string | null = null;
    if (validFullBids.length > 0) {
        recommendedBidId = validFullBids[0].bidId;
        results[recommendedBidId].isRecommended = true;
    }

    // LOWEST: Lowest total among valid full bids
    let lowestSingleBidId: string | null = null;
    let lowestSingleTotalCompCurr: number | null = null;
    if (validFullBids.length > 0) {
        const sortedByTotal = [...validFullBids].sort(
            (a, b) => a.totalLandedCostCompCurr - b.totalLandedCostCompCurr
        );
        lowestSingleBidId = sortedByTotal[0].bidId;
        lowestSingleTotalCompCurr = sortedByTotal[0].totalLandedCostCompCurr;
        results[lowestSingleBidId].isLowest = true;
    }

    // Average total among valid full bids (for % below average)
    let lowestSingleVsAveragePct: number | null = null;
    if (validFullBids.length > 0 && lowestSingleTotalCompCurr !== null) {
        const sumTotals = validFullBids.reduce((acc, curr) => acc + curr.totalLandedCostCompCurr, 0);
        const avgTotal = sumTotals / validFullBids.length;
        if (avgTotal > 0) {
            lowestSingleVsAveragePct = Number(
                (((avgTotal - lowestSingleTotalCompCurr) / avgTotal) * 100).toFixed(1)
            );
        }
    }

    // TOP QUALITY: Highest quality score among suppliers not disqualified
    const notDisqualified = Object.values(results).filter((r) => !r.isDisqualified);
    if (notDisqualified.length > 0) {
        const sortedByQuality = [...notDisqualified].sort((a, b) => b.qualityScore - a.qualityScore);
        if (sortedByQuality[0].qualityScore > 0) {
            results[sortedByQuality[0].bidId].isTopQuality = true;
        }
    }

    // FASTEST: Shortest lead time among valid suppliers
    if (sortedValidSuppliers.length > 0 && shortestValidLeadTime !== null) {
        const fastest = sortedValidSuppliers.find((s) => {
            const b = bids.find((bid) => bid.id === s.bidId);
            return b && b.leadTimeDays === shortestValidLeadTime;
        });
        if (fastest) {
            results[fastest.bidId].isFastest = true;
        }
    }

    // Best Local vs Best International
    let bestLocalBidId: string | null = null;
    let bestLocalTotalCompCurr: number | null = null;
    let bestInternationalBidId: string | null = null;
    let bestInternationalTotalCompCurr: number | null = null;

    for (const s of validFullBids) {
        const b = bids.find((bid) => bid.id === s.bidId);
        if (!b) continue;
        if (b.supplierType === "LOCAL") {
            if (bestLocalTotalCompCurr === null || s.totalLandedCostCompCurr < bestLocalTotalCompCurr) {
                bestLocalTotalCompCurr = s.totalLandedCostCompCurr;
                bestLocalBidId = s.bidId;
            }
        } else {
            if (
                bestInternationalTotalCompCurr === null ||
                s.totalLandedCostCompCurr < bestInternationalTotalCompCurr
            ) {
                bestInternationalTotalCompCurr = s.totalLandedCostCompCurr;
                bestInternationalBidId = s.bidId;
            }
        }
    }

    let bestLocalVsIntDifferenceCompCurr: number | null = null;
    let bestLocalVsIntPct: number | null = null;
    if (bestLocalTotalCompCurr !== null && bestInternationalTotalCompCurr !== null) {
        bestLocalVsIntDifferenceCompCurr = Number(
            Math.abs(bestLocalTotalCompCurr - bestInternationalTotalCompCurr).toFixed(2)
        );
        const baseline = Math.min(bestLocalTotalCompCurr, bestInternationalTotalCompCurr);
        if (baseline > 0) {
            bestLocalVsIntPct = Number(
                ((bestLocalVsIntDifferenceCompCurr / baseline) * 100).toFixed(1)
            );
        }
    }

    // Budget Variance
    let budgetVarianceCompCurr: number | null = null;
    let isBudgetOver = false;
    if (project.budget && recommendedBidId) {
        const recTotal = results[recommendedBidId].totalLandedCostCompCurr;
        budgetVarianceCompCurr = Number((recTotal - project.budget).toFixed(2));
        isBudgetOver = budgetVarianceCompCurr > 0;
    }

    return {
        recommendedBidId,
        lowestSingleBidId,
        lowestSingleTotalCompCurr,
        lowestSingleVsAveragePct,
        optimizedAwardTotalCompCurr: null, // Computed by split-award optimizer
        optimizedAwardBidIds: [],
        bestLocalBidId,
        bestLocalTotalCompCurr,
        bestInternationalBidId,
        bestInternationalTotalCompCurr,
        bestLocalVsIntDifferenceCompCurr,
        bestLocalVsIntPct,
        budgetVarianceCompCurr,
        isBudgetOver,
        results,
    };
}
