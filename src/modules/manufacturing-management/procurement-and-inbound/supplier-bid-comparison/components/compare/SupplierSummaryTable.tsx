"use client";

import React from "react";
import { Award, TrendingDown, Star, Zap, Globe, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";

interface SupplierSummaryTableProps {
    supplierFilter: "ALL" | "LOCAL" | "INTERNATIONAL";
}

export const SupplierSummaryTable: React.FC<SupplierSummaryTableProps> = ({ supplierFilter }) => {
    const { currentProject } = useBidComparisonStore();

    const summary = React.useMemo(
        () => (currentProject ? evaluateAndCompareSuppliers(currentProject) : null),
        [currentProject]
    );

    // Filter and sort by overall score descending
    const filteredBids = React.useMemo(() => {
        if (!currentProject || !summary) return [];
        return currentProject.bids
            .filter((b) => {
                if (supplierFilter === "LOCAL") return b.supplierType === "LOCAL";
                if (supplierFilter === "INTERNATIONAL") return b.supplierType === "INTERNATIONAL";
                return true;
            })
            .sort((a, b) => {
                const scoreA = summary.results[a.id]?.overallScore || 0;
                const scoreB = summary.results[b.id]?.overallScore || 0;
                return scoreB - scoreA;
            });
    }, [currentProject, supplierFilter, summary]);

    if (!currentProject || !summary) return null;

    const compCurr = currentProject.comparisonCurrency || "PHP";

    const lowestFullBidTotal = summary.lowestSingleTotalCompCurr || 0;

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold">
                    3.3 Comprehensive Supplier Summary &amp; Rankings
                </CardTitle>
                <CardDescription className="text-xs">
                    Ranked by weighted overall score. Cost components broken down in {compCurr}.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                        <tr>
                            <th className="py-2.5 px-3 w-8 text-center">Rank</th>
                            <th className="py-2.5 px-3 min-w-[200px]">Supplier &amp; Badges</th>
                            <th className="py-2.5 px-3 min-w-[120px]">Terms</th>
                            <th className="py-2.5 px-3 text-right">Goods</th>
                            <th className="py-2.5 px-3 text-right">Discount</th>
                            <th className="py-2.5 px-3 text-right">Freight+Ins</th>
                            <th className="py-2.5 px-3 text-right">Duty</th>
                            <th className="py-2.5 px-3 text-right">VAT</th>
                            <th className="py-2.5 px-3 text-right">Fees+Inland</th>
                            <th className="py-2.5 px-3 text-right">FX+Terms</th>
                            <th className="py-2.5 px-3 text-right font-bold text-foreground bg-primary/5">
                                Total Landed
                            </th>
                            <th className="py-2.5 px-3 text-center">Lead</th>
                            <th className="py-2.5 px-3 text-center">Quality</th>
                            <th className="py-2.5 px-3 text-center">Valid</th>
                            <th className="py-2.5 px-3 text-right font-bold text-primary">Score</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {filteredBids.length === 0 ? (
                            <tr>
                                <td colSpan={15} className="py-8 text-center text-muted-foreground">
                                    No suppliers matching filter.
                                </td>
                            </tr>
                        ) : (
                            filteredBids.map((bid) => {
                                const res = summary.results[bid.id];
                                if (!res) return null;

                                const isLocal = bid.supplierType === "LOCAL";
                                const feesAndInland =
                                    res.customsAndPortTotalCompCurr +
                                    res.inlandTruckingCompCurr +
                                    res.bankFeesCompCurr;
                                const fxAndTerms =
                                    res.fxBufferCompCurr +
                                    res.paymentTermsCostCompCurr -
                                    res.earlyPayDiscountAmountCompCurr;

                                const pctAboveLowest =
                                    lowestFullBidTotal > 0 && res.totalLandedCostCompCurr > lowestFullBidTotal
                                        ? (
                                            ((res.totalLandedCostCompCurr - lowestFullBidTotal) /
                                                lowestFullBidTotal) *
                                            100
                                        ).toFixed(1)
                                        : null;

                                return (
                                    <tr key={bid.id} className="hover:bg-muted/15 transition-colors">
                                        <td className="py-3 px-3 text-center font-mono font-bold text-muted-foreground">
                                            {res.ranking > 0 ? `#${res.ranking}` : "-"}
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                                {isLocal ? (
                                                    <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                                ) : (
                                                    <Globe className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                                )}
                                                <span className="truncate">{bid.supplierName}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1 mt-1">
                                                <span className="text-[10px] text-muted-foreground">
                                                    {bid.country} · {bid.quoteCurrency}
                                                </span>
                                                {res.isRecommended && (
                                                    <Badge className="text-[9px] px-1 py-0 bg-primary font-bold">
                                                        <Award className="h-2.5 w-2.5 mr-0.5 inline" /> REC
                                                    </Badge>
                                                )}
                                                {res.isLowest && (
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-emerald-700 dark:text-emerald-400 border-emerald-400 font-bold">
                                                        <TrendingDown className="h-2.5 w-2.5 mr-0.5 inline" /> LOWEST
                                                    </Badge>
                                                )}
                                                {res.isTopQuality && (
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-700 dark:text-amber-400 border-amber-400 font-bold">
                                                        <Star className="h-2.5 w-2.5 mr-0.5 inline" /> TOP QUALITY
                                                    </Badge>
                                                )}
                                                {res.isFastest && (
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-700 dark:text-blue-400 border-blue-400 font-bold">
                                                        <Zap className="h-2.5 w-2.5 mr-0.5 inline" /> FASTEST
                                                    </Badge>
                                                )}
                                                {res.isDisqualified && (
                                                    <Badge variant="destructive" className="text-[9px] px-1 py-0 font-bold">
                                                        DISQUALIFIED
                                                    </Badge>
                                                )}
                                                {res.isExpired && !res.isDisqualified && (
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-rose-600 border-rose-300 font-bold">
                                                        EXPIRED
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-3 font-mono text-[11px]">
                                            <span className="font-semibold block">{bid.incoterm}</span>
                                            <span className="text-[10px] text-muted-foreground block truncate">
                                                {bid.downPaymentPct > 0 ? `${bid.downPaymentPct}% down` : "Net"} · {bid.balanceDueDays}d
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono">
                                            ₱{res.goodsAfterDiscountCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono">
                                            {res.discountTotalCompCurr > 0 ? (
                                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                                    -₱{res.discountTotalCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono">
                                            ₱{(res.freightCompCurr + res.insuranceCompCurr).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono">
                                            ₱{res.dutyCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono">
                                            ₱{res.vatCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono">
                                            ₱{feesAndInland.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono">
                                            ₱{fxAndTerms.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono bg-primary/5">
                                            <span className="font-bold text-xs block text-foreground">
                                                ₱{res.totalLandedCostCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                            </span>
                                            {pctAboveLowest && (
                                                <span className="text-[9px] text-muted-foreground block">
                                                    +{pctAboveLowest}%
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-center font-mono">
                                            {bid.leadTimeDays}d
                                        </td>
                                        <td className="py-3 px-3 text-center font-mono font-bold">
                                            {res.isDisqualified ? (
                                                <span className="text-rose-600">DQ</span>
                                            ) : (
                                                res.qualityScore
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-center font-mono text-[11px]">
                                            {res.isExpired ? (
                                                <span className="text-rose-600 font-bold">Expired</span>
                                            ) : res.expiresInDays <= 7 ? (
                                                <span className="text-amber-600 font-bold">{res.expiresInDays}d left</span>
                                            ) : (
                                                <span className="text-muted-foreground">{res.expiresInDays}d</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-right font-mono font-bold text-xs">
                                            {res.overallScore > 0 ? (
                                                <span className={res.isValid ? "text-primary" : "text-muted-foreground line-through"} title={!res.isValid ? "Disqualified or Expired" : undefined}>
                                                    {res.overallScore}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </CardContent>
        </Card>
    );
};
