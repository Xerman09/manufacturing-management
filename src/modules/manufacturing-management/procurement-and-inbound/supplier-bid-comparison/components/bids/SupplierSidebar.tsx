"use client";

import React from "react";
import { Plus, Globe, Building2, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { SupplierBid } from "../../types";
import { cn } from "@/lib/utils";

interface SupplierSidebarProps {
    onAddSupplier: (type: "LOCAL" | "INTERNATIONAL") => void;
}

export const SupplierSidebar: React.FC<SupplierSidebarProps> = ({ onAddSupplier }) => {
    const { currentProject, activeBidId, setActiveBidId } = useBidComparisonStore();
    if (!currentProject) return null;

    const bids = currentProject.bids || [];
    const summary = evaluateAndCompareSuppliers(currentProject);

    return (
        <div className="w-full lg:w-72 border-r bg-card flex flex-col shrink-0">
            {/* Header & Add Buttons */}
            <div className="p-3 border-b bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Suppliers ({bids.length})
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAddSupplier("LOCAL")}
                        className="h-7 text-xs gap-1.5 justify-center"
                    >
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        + Local
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAddSupplier("INTERNATIONAL")}
                        className="h-7 text-xs gap-1.5 justify-center"
                    >
                        <Plus className="h-3.5 w-3.5 text-blue-600" />
                        + Overseas
                    </Button>
                </div>
            </div>

            {/* Supplier List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {bids.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                        No suppliers added. Click &ldquo;+ Local&rdquo; or &ldquo;+ Overseas&rdquo; above.
                    </div>
                ) : (
                    bids.map((bid) => {
                        const isActive = activeBidId === bid.id;
                        const res = summary.results[bid.id];
                        const isLocal = bid.supplierType === "LOCAL";

                        return (
                            <button
                                key={bid.id}
                                onClick={() => setActiveBidId(bid.id)}
                                className={cn(
                                    "w-full text-left p-2.5 rounded-lg border transition-all relative overflow-hidden flex flex-col gap-1",
                                    isActive
                                        ? "bg-primary/10 border-primary text-foreground shadow-xs ring-1 ring-primary/20"
                                        : "bg-background border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <div className="flex items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        {isLocal ? (
                                            <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                        ) : (
                                            <Globe className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                        )}
                                        <span className={cn("text-xs font-semibold truncate", isActive && "text-primary")}>
                                            {bid.supplierName || "Unnamed Supplier"}
                                        </span>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono shrink-0">
                                        {bid.quoteCurrency}
                                    </Badge>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-0.5">
                                    <span className="truncate">
                                        {bid.country || (isLocal ? "Philippines" : "Overseas")} · {bid.incoterm}
                                    </span>
                                    {res && res.totalLandedCostCompCurr > 0 && (
                                        <span className="font-mono font-bold text-foreground">
                                            ₱{res.totalLandedCostCompCurr.toLocaleString()}
                                        </span>
                                    )}
                                </div>

                                {/* Status indicators */}
                                <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-border/40 text-[10px]">
                                    {res?.isDisqualified ? (
                                        <span className="text-rose-600 font-medium flex items-center gap-1">
                                            <XCircle className="h-3 w-3" /> DQ
                                        </span>
                                    ) : res?.isExpired ? (
                                        <span className="text-amber-600 font-medium flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" /> Expired
                                        </span>
                                    ) : (
                                        <span className="text-emerald-600 font-medium flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Valid
                                        </span>
                                    )}

                                    {res?.isRecommended && (
                                        <span className="bg-primary/20 text-primary px-1 rounded font-bold">
                                            REC
                                        </span>
                                    )}
                                    {res?.isLowest && (
                                        <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 px-1 rounded font-bold">
                                            LOWEST
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
};
