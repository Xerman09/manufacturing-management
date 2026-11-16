"use client";

import React from "react";
import { Check  } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
 
import { cn } from "@/lib/utils";

interface LandedCostMatrixTableProps {
    supplierFilter: "ALL" | "LOCAL" | "INTERNATIONAL";
}

export const LandedCostMatrixTable: React.FC<LandedCostMatrixTableProps> = ({ supplierFilter }) => {
    const { currentProject } = useBidComparisonStore();

    const summary = React.useMemo(
        () => (currentProject ? evaluateAndCompareSuppliers(currentProject) : null),
        [currentProject]
    );

    // Apply supplier filter
    const bids = React.useMemo(() => {
        if (!currentProject) return [];
        return currentProject.bids.filter((b) => {
            if (supplierFilter === "LOCAL") return b.supplierType === "LOCAL";
            if (supplierFilter === "INTERNATIONAL") return b.supplierType === "INTERNATIONAL";
            return true;
        });
    }, [currentProject, supplierFilter]);

    // Find cheapest valid landed unit cost for each item
    const cheapestValidUnitCost = React.useMemo(() => {
        if (!currentProject || !summary) return {};
        const itemsList = currentProject.items || [];
        const costMap: Record<string, number> = {};
        for (const item of itemsList) {
            let minCost: number | null = null;
            for (const bid of currentProject.bids) {
                const res = summary.results[bid.id];
                if (!res || !res.isValid) continue;
                const b = res.items[item.id];
                if (b && b.hasQuote && b.landedUnitCostCompCurr > 0) {
                    if (minCost === null || b.landedUnitCostCompCurr < minCost) {
                        minCost = b.landedUnitCostCompCurr;
                    }
                }
            }
            if (minCost !== null) {
                costMap[item.id] = minCost;
            }
        }
        return costMap;
    }, [currentProject, summary]);

    if (!currentProject || !summary) return null;

    const items = currentProject.items || [];
    const compCurr = currentProject.comparisonCurrency || "PHP";

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold">
                    3.1 Landed Cost Per Unit by Item ({compCurr})
                </CardTitle>
                <CardDescription className="text-xs">
                    Compares unit landed cost across all bidders. Lowest valid cost per item highlighted in green.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                        <tr>
                            <th className="py-2.5 px-3 w-8 text-center">#</th>
                            <th className="py-2.5 px-3 min-w-[180px]">Requested Item</th>
                            <th className="py-2.5 px-3 w-24">Order Qty</th>
                            <th className="py-2.5 px-3 w-28 text-right">Target Unit ({compCurr})</th>
                            {bids.map((bid) => {
                                const res = summary.results[bid.id];
                                return (
                                    <th key={bid.id} className="py-2.5 px-3 min-w-[150px] text-right font-semibold">
                                        <div className="flex flex-col items-end">
                                            <span className="truncate max-w-[140px] font-bold text-foreground">
                                                {bid.supplierName}
                                            </span>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                    {bid.incoterm} · {bid.quoteCurrency}
                                                </span>
                                                {res?.isDisqualified ? (
                                                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                                                        DQ
                                                    </Badge>
                                                ) : res?.isExpired ? (
                                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-amber-100 text-amber-800">
                                                        EXPIRED
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={4 + bids.length} className="py-8 text-center text-muted-foreground">
                                    No items listed. Add items in Setup to view matrix.
                                </td>
                            </tr>
                        ) : (
                            items.map((item, idx) => (
                                <tr key={item.id} className="hover:bg-muted/15 transition-colors">
                                    <td className="py-2.5 px-3 text-center text-muted-foreground font-mono">
                                        {idx + 1}
                                    </td>
                                    <td className="py-2.5 px-3">
                                        <span className="font-semibold block">{item.itemName}</span>
                                        {item.specifications && (
                                            <span className="text-[10px] text-muted-foreground block truncate max-w-xs">
                                                {item.specifications}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono">
                                        {item.quantity.toLocaleString()} {item.uom}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono text-right font-medium text-foreground">
                                        ₱{item.targetUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                    </td>

                                    {bids.map((bid) => {
                                        const res = summary.results[bid.id];
                                        const breakdown = res?.items[item.id];
                                        const isCheapest =
                                            res?.isValid &&
                                            breakdown &&
                                            breakdown.hasQuote &&
                                            breakdown.landedUnitCostCompCurr === cheapestValidUnitCost[item.id];

                                        const isOverTarget =
                                            breakdown &&
                                            breakdown.hasQuote &&
                                            item.targetUnitPrice > 0 &&
                                            breakdown.landedUnitCostCompCurr > item.targetUnitPrice;

                                        return (
                                            <td
                                                key={bid.id}
                                                className={cn(
                                                    "py-2.5 px-3 text-right font-mono transition-colors",
                                                    isCheapest && "bg-emerald-500/10 font-bold text-emerald-800 dark:text-emerald-300"
                                                )}
                                            >
                                                {breakdown && breakdown.hasQuote ? (
                                                    <div>
                                                        <div className="flex items-center justify-end gap-1">
                                                            {isCheapest && <Check className="h-3.5 w-3.5 text-emerald-600 inline" />}
                                                            <span className={cn("text-xs font-semibold", isOverTarget ? "text-rose-600" : "text-foreground")}>
                                                                ₱{breakdown.landedUnitCostCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground block">
                                                            {bid.quoteCurrency} {breakdown.appliedUnitPriceForeign.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}{" "}
                                                            {breakdown.discountPct > 0 ? `(-${breakdown.discountPct}%)` : ""}
                                                        </span>
                                                        {isOverTarget && (
                                                            <span className="text-[9px] text-rose-500 block">
                                                                +{breakdown.varianceVsTargetPct}% vs target
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}

                        {/* Total Landed Cost Row */}
                        <tr className="bg-muted/30 font-bold border-t-2 border-border text-xs">
                            <td colSpan={3} className="py-3 px-3 uppercase tracking-wider text-foreground">
                                Total Landed Cost
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                                ₱{items.reduce((s, it) => s + (it.quantity * it.targetUnitPrice), 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                            </td>
                            {bids.map((bid) => {
                                const res = summary.results[bid.id];
                                return (
                                    <td key={bid.id} className="py-3 px-3 text-right font-mono">
                                        {res && res.totalLandedCostCompCurr > 0 ? (
                                            <div>
                                                <span className="text-xs font-bold block text-foreground">
                                                    ₱{res.totalLandedCostCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                </span>
                                                {!res.isFullBid && (
                                                    <span className="text-[10px] text-amber-600 block font-normal">
                                                        ({res.quotedItemCount}/{res.totalItemCount} items)
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </CardContent>
        </Card>
    );
};
