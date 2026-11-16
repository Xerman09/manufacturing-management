"use client";

import React from "react";
import { CheckCircle2, DollarSign, TrendingDown, Layers, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { optimizeSplitAward } from "../../engine/split-award-optimizer";

export const AwardSummaryMetrics: React.FC = () => {
    const { currentProject } = useBidComparisonStore();

    const summary = React.useMemo(
        () => (currentProject ? evaluateAndCompareSuppliers(currentProject) : null),
        [currentProject]
    );

    if (!currentProject || !summary) return null;

    const items = currentProject.items || [];
    const awards = currentProject.awards || [];
    const compCurr = currentProject.comparisonCurrency || "PHP";

    // Calculate total landed cost of current award
    const winningSupplierIds = new Set(awards.map((a) => a.rfqBidId));
    const awardTotalLanded = awards.reduce((sum, a) => sum + (a.awardedLandedTotal || 0), 0);

    // Total target price
    const totalTarget = items.reduce((sum, it) => sum + it.quantity * it.targetUnitPrice, 0);
    const varianceVsTarget = awardTotalLanded - totalTarget;

    // Compare with average market quotes for awarded items (matching prototype awardCalc)
    let avgSum = 0;
    let hasValidQuotes = false;

    for (const award of awards) {
        const itemLandedQuotes: number[] = [];
        for (const bid of currentProject.bids) {
            const res = summary.results[bid.id];
            if (!res?.isValid) continue;
            const itemCost = res.items[award.rfqItemId]?.totalLandedCompCurr;
            if (typeof itemCost === "number" && itemCost > 0) {
                itemLandedQuotes.push(itemCost);
            }
        }
        if (itemLandedQuotes.length > 0) {
            hasValidQuotes = true;
            const avg = itemLandedQuotes.reduce((a, b) => a + b, 0) / itemLandedQuotes.length;
            avgSum += avg;
        }
    }

    const savingsVsAverage = hasValidQuotes ? avgSum - awardTotalLanded : null;


    // Budget variance
    const budgetVariance = currentProject.budget ? awardTotalLanded - currentProject.budget : null;
    const isOverBudget = budgetVariance !== null && budgetVariance > 0;

    // Optimized check
    const validBids = currentProject.bids.filter((b) => summary.results[b.id]?.isValid);
    const opt = optimizeSplitAward(currentProject, validBids);
    const canSaveMore = opt && opt.optimizedTotalCompCurr < awardTotalLanded - 1;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Award Total */}
                <Card className="shadow-xs border-primary/30 bg-primary/5">
                    <CardContent className="p-3.5 space-y-1">
                        <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            AWARDED TOTAL (LANDED)
                        </span>
                        <div className="text-base font-bold font-mono text-foreground">
                            {compCurr} {awardTotalLanded.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </div>
                        <span className="text-[10px] text-muted-foreground block truncate">
                            Allocated across {winningSupplierIds.size} supplier(s) · {awards.length}/{items.length} items
                        </span>
                    </CardContent>
                </Card>

                {/* 2. vs Average Valid Bid */}
                <Card className="shadow-xs border-border/80">
                    <CardContent className="p-3.5 space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
                            VS AVERAGE BID
                        </span>
                        <div className="text-base font-bold font-mono">
                            {savingsVsAverage !== null ? (
                                <span className={savingsVsAverage >= 0 ? "text-emerald-600" : "text-rose-600"}>
                                    {savingsVsAverage >= 0 ? "Saves " : "Over by "}
                                    ₱{Math.abs(savingsVsAverage).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                </span>
                            ) : (
                                "-"
                            )}
                        </div>
                        <span className="text-[10px] text-muted-foreground block truncate">
                            Against average valid market quotations
                        </span>
                    </CardContent>
                </Card>

                {/* 3. vs Target Price Ceiling */}
                <Card className="shadow-xs border-border/80">
                    <CardContent className="p-3.5 space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            VS TARGET CEILING
                        </span>
                        <div className="text-base font-bold font-mono">
                            {totalTarget > 0 ? (
                                <span className={varianceVsTarget <= 0 ? "text-emerald-600" : "text-rose-600"}>
                                    {varianceVsTarget <= 0 ? "-" : "+"}₱{Math.abs(varianceVsTarget).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                </span>
                            ) : (
                                "-"
                            )}
                        </div>
                        <span className="text-[10px] text-muted-foreground block truncate">
                            Ceiling: ₱{totalTarget.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </span>
                    </CardContent>
                </Card>

                {/* 4. vs Approved Budget */}
                <Card className="shadow-xs border-border/80">
                    <CardContent className="p-3.5 space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <Layers className="h-3.5 w-3.5" />
                            VS APPROVED BUDGET
                        </span>
                        <div className="text-base font-bold font-mono">
                            {budgetVariance !== null ? (
                                <span className={isOverBudget ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                                    {isOverBudget ? "Over by " : "Under by "}
                                    ₱{Math.abs(budgetVariance).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                </span>
                            ) : (
                                <span className="text-muted-foreground text-xs">No budget set</span>
                            )}
                        </div>
                        <span className="text-[10px] text-muted-foreground block truncate">
                            Budget: {currentProject.budget ? `₱${currentProject.budget.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "-"}
                        </span>
                    </CardContent>
                </Card>
            </div>

            {/* Optimization Opportunity Hint */}
            {canSaveMore && opt && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-blue-600 shrink-0" />
                        <span>
                            <strong>Cheaper combination available:</strong> The optimized split award across {opt.participatingBidIds.length} suppliers achieves <strong>₱{opt.optimizedTotalCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</strong>, saving an additional <strong>₱{(awardTotalLanded - opt.optimizedTotalCompCurr).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</strong>.
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
