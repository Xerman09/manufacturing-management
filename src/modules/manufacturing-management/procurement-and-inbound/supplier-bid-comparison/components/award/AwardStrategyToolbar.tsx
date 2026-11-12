"use client";

import React from "react";
import { Award, Sparkles, DollarSign, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { optimizeSplitAward } from "../../engine/split-award-optimizer";
import { ItemAward } from "../../types";
import { toast } from "sonner";

export const AwardStrategyToolbar: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const items = currentProject.items || [];
    const summary = evaluateAndCompareSuppliers(currentProject);
    const validBids = currentProject.bids.filter((b) => summary.results[b.id]?.isValid);
    const recBid = summary.recommendedBidId
        ? currentProject.bids.find((b) => b.id === summary.recommendedBidId)
        : null;
    const recSupplierSuffix = recBid?.supplierName ? ` (${recBid.supplierName})` : "";

    const isLocked = currentProject.status === "Submitted" || currentProject.status === "Approved";

    // 1. Award All to Recommended
    const handleAwardRecommended = () => {
        if (!summary.recommendedBidId) {
            toast.error("No valid recommended supplier available.");
            return;
        }

        const recBidId = summary.recommendedBidId;
        const res = summary.results[recBidId];
        const bid = currentProject.bids.find((b) => b.id === recBidId);

        const newAwards: ItemAward[] = items.map((item) => {
            const breakdown = res.items[item.id];
            return {
                id: "award-" + item.id,
                rfqItemId: item.id,
                rfqBidId: recBidId,
                awardedSupplierId: bid?.supplierId || null,
                awardedLandedUnitCost: breakdown?.landedUnitCostCompCurr || 0,
                awardedLandedTotal: breakdown?.totalLandedCompCurr || 0,
            };
        });

        updateProject((prev) => ({
            ...prev,
            awards: newAwards,
        }));
        toast.success(`Awarded all items to ${bid?.supplierName}`);
    };

    // 2. Lowest Total (Optimized Split Award)
    const handleAwardOptimized = () => {
        const opt = optimizeSplitAward(currentProject, validBids);
        if (!opt) {
            toast.error("Unable to calculate split award optimization.");
            return;
        }

        const newAwards: ItemAward[] = items.map((item) => {
            const bidId = opt.supplierAwardMap[item.id];
            const bid = currentProject.bids.find((b) => b.id === bidId);
            const res = summary.results[bidId];
            const breakdown = res?.items[item.id];

            return {
                id: "award-" + item.id,
                rfqItemId: item.id,
                rfqBidId: bidId,
                awardedSupplierId: bid?.supplierId || null,
                awardedLandedUnitCost: breakdown?.landedUnitCostCompCurr || 0,
                awardedLandedTotal: breakdown?.totalLandedCompCurr || 0,
            };
        });

        updateProject((prev) => ({
            ...prev,
            awards: newAwards,
        }));
        toast.success(`Optimized award applied across ${opt.participatingBidIds.length} suppliers`);
    };

    // 3. Cheapest per Item
    const handleAwardCheapestPerItem = () => {
        const newAwards: ItemAward[] = [];

        for (const item of items) {
            let lowestCost = Infinity;
            let lowestBidId: string | null = null;

            for (const bid of validBids) {
                const res = summary.results[bid.id];
                const breakdown = res?.items[item.id];
                if (breakdown && breakdown.hasQuote && breakdown.landedUnitCostCompCurr > 0) {
                    if (breakdown.landedUnitCostCompCurr < lowestCost) {
                        lowestCost = breakdown.landedUnitCostCompCurr;
                        lowestBidId = bid.id;
                    }
                }
            }

            if (lowestBidId) {
                const bid = currentProject.bids.find((b) => b.id === lowestBidId);
                const res = summary.results[lowestBidId];
                const breakdown = res?.items[item.id];
                newAwards.push({
                    id: "award-" + item.id,
                    rfqItemId: item.id,
                    rfqBidId: lowestBidId,
                    awardedSupplierId: bid?.supplierId || null,
                    awardedLandedUnitCost: breakdown?.landedUnitCostCompCurr || 0,
                    awardedLandedTotal: breakdown?.totalLandedCompCurr || 0,
                });
            }
        }

        updateProject((prev) => ({
            ...prev,
            awards: newAwards,
        }));
        toast.success("Awarded each item to its cheapest individual quote");
    };

    // 4. Clear Awards
    const handleClearAwards = () => {
        updateProject((prev) => ({
            ...prev,
            awards: [],
        }));
        toast.info("Cleared all awards");
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-card border rounded-lg shadow-xs">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Award Automation Strategies:
            </span>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAwardRecommended}
                    disabled={isLocked || !summary.recommendedBidId}
                    className="h-8 text-xs gap-1.5 font-medium"
                >
                    <Award className="h-3.5 w-3.5 text-primary" />
                    Award All to Recommended{recSupplierSuffix}
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAwardOptimized}
                    disabled={isLocked || validBids.length === 0}
                    className="h-8 text-xs gap-1.5"
                >
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                    Lowest Total (Optimized Split)
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAwardCheapestPerItem}
                    disabled={isLocked || validBids.length === 0}
                    className="h-8 text-xs gap-1.5"
                >
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                    Cheapest Per Item
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClearAwards}
                    disabled={isLocked || currentProject.awards?.length === 0}
                    className="h-8 text-xs gap-1 text-muted-foreground hover:text-destructive"
                >
                    <RotateCcw className="h-3 w-3" />
                    Clear
                </Button>
            </div>
        </div>
    );
};
