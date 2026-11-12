"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { ItemAward } from "../../types";
import { cn } from "@/lib/utils";

export const ItemAwardSelectionTable: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const items = currentProject.items || [];
    const compCurr = currentProject.comparisonCurrency || "PHP";
    const summary = React.useMemo(() => evaluateAndCompareSuppliers(currentProject), [currentProject]);
    const isLocked = currentProject.status === "Submitted" || currentProject.status === "Approved";

    const awards = currentProject.awards || [];
    const totalAwardedLanded = awards.reduce((sum, a) => sum + (a.awardedLandedTotal || 0), 0);
    const totalTargetPrice = items.reduce((sum, it) => sum + (it.quantity * it.targetUnitPrice), 0);
    const budget = currentProject.budget || 0;
    const budgetVariance = budget > 0 ? totalAwardedLanded - budget : null;
    const targetVariance = totalAwardedLanded > 0 ? totalAwardedLanded - totalTargetPrice : 0;
    const awardedItemsCount = awards.filter((a) => a.rfqBidId && a.rfqBidId !== "UNAWARDED").length;

    const handleSelectWinningBid = (itemId: string, chosenBidId: string) => {
        const item = items.find((i) => i.id === itemId);
        if (!item) return;

        if (chosenBidId === "UNAWARDED") {
            updateProject((prev) => ({
                ...prev,
                awards: prev.awards.filter((a) => a.rfqItemId !== itemId),
            }));
            return;
        }

        const bid = currentProject.bids.find((b) => b.id === chosenBidId);
        const res = summary.results[chosenBidId];
        const breakdown = res?.items[itemId];

        const newAward: ItemAward = {
            id: "award-" + itemId,
            rfqItemId: itemId,
            rfqBidId: chosenBidId,
            awardedSupplierId: bid?.supplierId || null,
            awardedLandedUnitCost: breakdown?.landedUnitCostCompCurr || 0,
            awardedLandedTotal: breakdown?.totalLandedCompCurr || 0,
        };

        updateProject((prev) => ({
            ...prev,
            awards: [...prev.awards.filter((a) => a.rfqItemId !== itemId), newAward],
        }));
    };

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold">
                    4.1 Item-by-Item Award Allocations
                </CardTitle>
                <CardDescription className="text-xs">
                    Assign each item to a supplier. Quoted bidders are listed in order from lowest landed unit cost.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                        <tr>
                            <th className="py-2.5 px-3 w-8 text-center">#</th>
                            <th className="py-2.5 px-3 min-w-[200px]">Requested Item &amp; Target</th>
                            <th className="py-2.5 px-3 w-28">Order Qty</th>
                            <th className="py-2.5 px-3 min-w-[240px]">Awarded Supplier</th>
                            <th className="py-2.5 px-3 w-32 text-right">Landed Unit Cost</th>
                            <th className="py-2.5 px-3 w-36 text-right font-bold text-foreground">
                                Awarded Total ({compCurr})
                            </th>
                            <th className="py-2.5 px-3 w-28 text-right">Target Variance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                                    No items listed. Add items in Setup to assign awards.
                                </td>
                            </tr>
                        ) : (
                            items.map((item, idx) => {
                                const currentAward = currentProject.awards?.find((a) => a.rfqItemId === item.id);
                                const currentBidId = currentAward?.rfqBidId || "UNAWARDED";

                                // Find all suppliers who quoted this item, sorted by landed unit cost
                                const biddersForThisItem = currentProject.bids
                                    .filter((b) => {
                                        const res = summary.results[b.id];
                                        return res?.items[item.id]?.hasQuote;
                                    })
                                    .sort((a, b) => {
                                        const costA = summary.results[a.id]?.items[item.id]?.landedUnitCostCompCurr || Infinity;
                                        const costB = summary.results[b.id]?.items[item.id]?.landedUnitCostCompCurr || Infinity;
                                        return costA - costB;
                                    });

                                const landedUnit = currentAward?.awardedLandedUnitCost || 0;
                                const landedTotal = currentAward?.awardedLandedTotal || 0;
                                const targetTotal = item.quantity * item.targetUnitPrice;
                                const variance = landedTotal > 0 ? landedTotal - targetTotal : 0;

                                return (
                                    <tr key={item.id} className="hover:bg-muted/15 transition-colors">
                                        <td className="py-2.5 px-3 text-center text-muted-foreground font-mono">
                                            {idx + 1}
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <span className="font-semibold block">{item.itemName}</span>
                                            <span className="text-[10px] text-muted-foreground block truncate">
                                                Target: {compCurr} {item.targetUnitPrice.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-medium">
                                            {item.quantity.toLocaleString()} {item.uom}
                                        </td>

                                        {/* Award Dropdown */}
                                        <td className="py-2 px-3">
                                            <Select
                                                value={currentBidId}
                                                onValueChange={(val) => handleSelectWinningBid(item.id, val)}
                                                disabled={isLocked}
                                            >
                                                <SelectTrigger
                                                    className={cn(
                                                        "h-8 text-xs font-medium w-full",
                                                        currentBidId === "UNAWARDED" && "text-muted-foreground border-dashed"
                                                    )}
                                                >
                                                    <SelectValue placeholder="Select winning supplier..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="UNAWARDED" className="text-xs text-muted-foreground">
                                                        -- Not Awarded --
                                                    </SelectItem>
                                                    {biddersForThisItem.map((bid) => {
                                                        const res = summary.results[bid.id];
                                                        const breakdown = res?.items[item.id];
                                                        const cost = breakdown?.landedUnitCostCompCurr || 0;
                                                        const isDq = res?.isDisqualified;
                                                        const isExp = res?.isExpired;

                                                        return (
                                                            <SelectItem
                                                                key={bid.id}
                                                                value={bid.id}
                                                                disabled={isDq || isExp}
                                                                className="text-xs"
                                                            >
                                                                <div className="flex items-center justify-between gap-4 w-full">
                                                                    <span className={cn("font-medium", (isDq || isExp) && "text-muted-foreground line-through")}>
                                                                        {bid.supplierName} ({bid.incoterm})
                                                                        {isDq ? " [DQ]" : isExp ? " [Expired]" : ""}
                                                                    </span>
                                                                    <span className="font-mono text-muted-foreground">
                                                                        ₱{cost.toLocaleString()} / {item.uom}
                                                                    </span>
                                                                </div>
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        </td>

                                        {/* Landed Unit Cost */}
                                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                                            {landedUnit > 0 ? `₱${landedUnit.toLocaleString()}` : "-"}
                                        </td>

                                        {/* Landed Total */}
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                                            {landedTotal > 0 ? `₱${landedTotal.toLocaleString()}` : "-"}
                                        </td>

                                        {/* Target Variance */}
                                        <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                                            {landedTotal > 0 ? (
                                                <span className={variance <= 0 ? "text-emerald-600" : "text-rose-600"}>
                                                    {variance <= 0 ? "-" : "+"}₱{Math.abs(variance).toLocaleString()}
                                                </span>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>

                    {/* Table Footer: Landed Total KPI */}
                    <tfoot className="border-t-2 border-border bg-muted/30 font-bold text-xs">
                        <tr>
                            <td colSpan={5} className="py-3 px-3 uppercase tracking-wider text-foreground">
                                Award Total (Landed)
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-foreground text-sm font-bold bg-primary/5">
                                ₱{totalAwardedLanded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs">
                                {totalAwardedLanded > 0 ? (
                                    <span className={targetVariance <= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                                        {targetVariance <= 0 ? "-" : "+"}₱{Math.abs(targetVariance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                ) : (
                                    "-"
                                )}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </CardContent>

            {/* Footer KPI bar: Budget comparison & completion status */}
            <CardFooter className="py-3 px-4 border-t bg-muted/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                    <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Awarded Items</span>
                        <span className="font-semibold text-foreground">
                            {awardedItemsCount} of {items.length} items ({items.length > 0 ? Math.round((awardedItemsCount / items.length) * 100) : 0}%)
                        </span>
                    </div>
                    <div className="border-l border-border pl-4">
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Target Price</span>
                        <span className="font-mono font-medium text-foreground">
                            ₱{totalTargetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    {budget > 0 && (
                        <div className="border-l border-border pl-4">
                            <span className="text-muted-foreground block text-[10px] uppercase font-bold">Approved Budget</span>
                            <span className="font-mono font-medium text-foreground">
                                ₱{budget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">Status vs Budget:</span>
                    {budget > 0 && budgetVariance !== null ? (
                        <Badge
                            variant="outline"
                            className={cn(
                                "text-xs px-2.5 py-0.5 font-bold font-mono",
                                budgetVariance <= 0
                                    ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300"
                                    : "text-rose-700 bg-rose-50 dark:bg-rose-950/40 border-rose-300"
                            )}
                        >
                            {budgetVariance <= 0
                                ? `Under Budget by ₱${Math.abs(budgetVariance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : `Over Budget by ₱${Math.abs(budgetVariance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="text-xs">No budget defined</Badge>
                    )}
                </div>
            </CardFooter>
        </Card>
    );
};
