"use client";

import React from "react";
import { Award, TrendingDown, Sparkles, Building2, Globe, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { optimizeSplitAward } from "../../engine/split-award-optimizer";

export const ComparisonKpiCards: React.FC = () => {
    const { currentProject } = useBidComparisonStore();

    const summary = React.useMemo(
        () => (currentProject ? evaluateAndCompareSuppliers(currentProject) : null),
        [currentProject]
    );
    const validBids = React.useMemo(() => {
        if (!currentProject || !summary) return [];
        return currentProject.bids.filter((b) => summary.results[b.id]?.isValid);
    }, [currentProject, summary]);
    const optimized = React.useMemo(() => {
        if (!currentProject) return null;
        return optimizeSplitAward(currentProject, validBids);
    }, [currentProject, validBids]);

    if (!currentProject || !summary) return null;

    const recBid = summary.recommendedBidId
        ? currentProject.bids.find((b) => b.id === summary.recommendedBidId)
        : null;
    const recResult = summary.recommendedBidId ? summary.results[summary.recommendedBidId] : null;

    const lowestBid = summary.lowestSingleBidId
        ? currentProject.bids.find((b) => b.id === summary.lowestSingleBidId)
        : null;
    const lowestResult = summary.lowestSingleBidId ? summary.results[summary.lowestSingleBidId] : null;

    const bestLocal = summary.bestLocalBidId
        ? currentProject.bids.find((b) => b.id === summary.bestLocalBidId)
        : null;
    const bestInt = summary.bestInternationalBidId
        ? currentProject.bids.find((b) => b.id === summary.bestInternationalBidId)
        : null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* 1. Recommended Supplier */}
            <Card className="shadow-xs border-primary/40 bg-primary/5">
                <CardContent className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                            <Award className="h-3.5 w-3.5" />
                            RECOMMENDED
                        </span>
                        {recResult && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground font-bold font-mono">
                                Score {recResult.overallScore}
                            </Badge>
                        )}
                    </div>
                    <span className="text-sm font-bold text-foreground truncate block">
                        {recBid ? recBid.supplierName : "No valid full bid"}
                    </span>
                    <div className="text-xs font-mono font-semibold text-foreground pt-0.5">
                        {recResult ? `₱${recResult.totalLandedCostCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "-"}
                    </div>
                    <span className="text-[10px] text-muted-foreground block truncate">
                        Highest overall price/quality score
                    </span>
                </CardContent>
            </Card>

            {/* 2. Lowest Single-Supplier Total */}
            <Card className="shadow-xs border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                <CardContent className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <TrendingDown className="h-3.5 w-3.5" />
                            LOWEST SINGLE BID
                        </span>
                        {summary.lowestSingleVsAveragePct !== null && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900 px-1 rounded">
                                -{summary.lowestSingleVsAveragePct}% avg
                            </span>
                        )}
                    </div>
                    <span className="text-sm font-bold text-foreground truncate block">
                        {lowestBid ? lowestBid.supplierName : "None"}
                    </span>
                    <div className="text-xs font-mono font-semibold text-foreground pt-0.5">
                        {lowestResult ? `₱${lowestResult.totalLandedCostCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "-"}
                    </div>
                    <span className="text-[10px] text-muted-foreground block truncate">
                        Cheapest single valid full quote
                    </span>
                </CardContent>
            </Card>

            {/* 3. Lowest Possible Total (Optimized Split Award) */}
            <Card className="shadow-xs border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5" />
                            OPTIMIZED SPLIT
                        </span>
                        {optimized && (
                            <span className="text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 rounded">
                                {optimized.participatingBidIds.length} suppliers
                            </span>
                        )}
                    </div>
                    <span className="text-sm font-bold text-foreground truncate block font-mono">
                        {optimized ? `₱${optimized.optimizedTotalCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "-"}
                    </span>
                    <div className="text-[10px] text-muted-foreground pt-0.5 truncate">
                        {optimized && lowestResult && lowestResult.totalLandedCostCompCurr > optimized.optimizedTotalCompCurr ? (
                            <span className="text-emerald-600 font-bold">
                                Saves ₱{(lowestResult.totalLandedCostCompCurr - optimized.optimizedTotalCompCurr).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} vs single
                            </span>
                        ) : (
                            "Best multi-supplier combination"
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground block truncate">
                        Fixed freight &amp; customs counted in full
                    </span>
                </CardContent>
            </Card>

            {/* 4. Best Local vs Best International */}
            <Card className="shadow-xs border-border/80">
                <CardContent className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" /> vs <Globe className="h-3.5 w-3.5" />
                        </span>
                        {summary.bestLocalVsIntPct !== null && (
                            <span className="text-[10px] font-bold text-foreground bg-muted px-1 rounded">
                                {summary.bestLocalVsIntPct}% delta
                            </span>
                        )}
                    </div>
                    <div className="text-xs truncate font-medium pt-0.5">
                        <span className="text-emerald-600 font-bold">{bestLocal?.supplierName || "No local"}</span>
                        {" vs "}
                        <span className="text-blue-600 font-bold">{bestInt?.supplierName || "No overseas"}</span>
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                        {summary.bestLocalVsIntDifferenceCompCurr !== null
                            ? `Diff: ₱${summary.bestLocalVsIntDifferenceCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
                            : "-"}
                    </div>
                    <span className="text-[10px] text-muted-foreground block truncate">
                        Domestic vs import price comparison
                    </span>
                </CardContent>
            </Card>

            {/* 5. Approved Budget */}
            <Card className="shadow-xs border-border/80">
                <CardContent className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            APPROVED BUDGET
                        </span>
                        {currentProject.budget && summary.budgetVarianceCompCurr !== null && (
                            <span
                                className={`text-[10px] font-bold px-1 rounded ${
                                    summary.isBudgetOver
                                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                }`}
                            >
                                {summary.isBudgetOver ? "OVER BUDGET" : "UNDER BUDGET"}
                            </span>
                        )}
                    </div>
                    <span className="text-sm font-bold text-foreground truncate block font-mono">
                        {currentProject.budget ? `₱${currentProject.budget.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "No budget set"}
                    </span>
                    <div className="text-xs font-mono pt-0.5">
                        {summary.budgetVarianceCompCurr !== null ? (
                            <span className={summary.isBudgetOver ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                                {summary.isBudgetOver ? "+" : "-"}₱{Math.abs(summary.budgetVarianceCompCurr).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                            </span>
                        ) : (
                            <span className="text-muted-foreground text-[10px]">Set in Step 1</span>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground block truncate">
                        Variance against Recommended bid
                    </span>
                </CardContent>
            </Card>
        </div>
    );
};
