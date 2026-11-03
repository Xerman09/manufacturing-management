"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
    Boxes,
    Package,
    FolderKanban,
    RotateCcw,
    Calendar,
    Clock,
    AlertCircle,
    CheckCircle2,
    ShieldAlert,
    HelpCircle,
    Warehouse,
    Info
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { FeasibilityComponentResult, MaterialClassification } from "../types";

export interface LotBreakdownItem {
    batchNo: string;
    storageLotName: string | null;
    mmLotId: number | null;
    inventoryLotId: number | null;
    purchaseOrderReceivingId: number | null;
    available: number;
    physicalQuantity?: number;
    expiryDate?: string | null;
    manufacturingDate?: string | null;
    qaStatus?: string | null;
    isConvertiblePackaging?: boolean;
    packagingProductName?: string;
    packagingProductCode?: string;
    originalQuantity?: number;
    originalUomName?: string;
    conversionRatio?: number;
    packagingNote?: string;
}

interface StockBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    component: FeasibilityComponentResult | null;
    branchId: number | null;
    branchName?: string;
    batchSize?: number;
    fgUomName?: string;
}

export const StockBreakdownModal: React.FC<StockBreakdownModalProps> = ({
    isOpen,
    onClose,
    component,
    branchId,
    branchName,
    batchSize,
    fgUomName = "units"
}) => {
    const [lots, setLots] = useState<LotBreakdownItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const isPackaging = component?.classification === "PACKAGING";
    const ruleLabel = isPackaging ? "FIFO (First-In, First-Out)" : "FEFO (First-Expired, First-Out)";

    const fetchLots = useCallback(async () => {
        if (!component?.productId || !branchId) return;

        setIsLoading(true);
        setFetchError(null);

        try {
            const url = `/api/manufacturing/overview-and-planning/raw-materials-to-finished-goods-projection?action=lot-breakdown&productId=${component.productId}&branchId=${branchId}`;
            const res = await fetch(url, { cache: "no-store" });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                const errMsg = data?.error || `Failed to fetch lots (${res.status})`;
                setFetchError(errMsg);
                toast.error("Lot Breakdown Error", {
                    description: errMsg
                });
                return;
            }

            const rawLots: LotBreakdownItem[] = Array.isArray(data.lots) ? data.lots : [];

            // Sort lots based on manufacturing inventory rules:
            // Packaging follows FIFO (by manufacturing/receipt date or id ascending)
            // Raw materials & Ingredients follow FEFO (by expiryDate ascending, nearest expiry first)
            const sorted = [...rawLots].sort((a, b) => {
                if (isPackaging) {
                    const dateA = a.manufacturingDate ? new Date(a.manufacturingDate).getTime() : 0;
                    const dateB = b.manufacturingDate ? new Date(b.manufacturingDate).getTime() : 0;
                    if (dateA !== dateB) return dateA - dateB;
                    return (a.purchaseOrderReceivingId || 0) - (b.purchaseOrderReceivingId || 0);
                } else {
                    // FEFO
                    if (!a.expiryDate && !b.expiryDate) return 0;
                    if (!a.expiryDate) return 1;
                    if (!b.expiryDate) return -1;
                    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
                }
            });

            setLots(sorted);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setFetchError(msg);
            toast.error("Network Error", {
                description: `Unable to load inventory lots: ${msg}`
            });
        } finally {
            setIsLoading(false);
        }
    }, [component?.productId, branchId, isPackaging]);

    useEffect(() => {
        if (isOpen && component?.productId && branchId) {
            fetchLots();
        } else if (!isOpen) {
            setLots([]);
            setFetchError(null);
        }
    }, [isOpen, component?.productId, branchId, fetchLots]);

    const getClassificationIcon = (cls?: MaterialClassification) => {
        switch (cls) {
            case "RAW_MATERIAL":
                return <Boxes className="h-4 w-4 text-blue-500" />;
            case "PACKAGING":
                return <Package className="h-4 w-4 text-purple-500" />;
            case "SUB_ASSEMBLY":
                return <FolderKanban className="h-4 w-4 text-amber-500" />;
            default:
                return <Warehouse className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const getQaBadge = (status?: string | null) => {
        if (!status) {
            return (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Unknown
                </Badge>
            );
        }
        const s = status.toUpperCase();
        if (s.includes("APPROV") || s.includes("PASS") || s.includes("RELEASE") || s === "GOOD") {
            return (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> {status}
                </Badge>
            );
        }
        if (s.includes("REJECT") || s.includes("HOLD") || s.includes("QUARANTINE")) {
            return (
                <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
                    <ShieldAlert className="h-3 w-3 mr-1" /> {status}
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                <HelpCircle className="h-3 w-3 mr-1" /> {status}
            </Badge>
        );
    };

    const reqPerNetFgUnit = Number(component?.requiredPerNetFgUnit) || 0;
    const effectiveBatchSize = Number(batchSize) || 1;
    const reqPerBatch = reqPerNetFgUnit * effectiveBatchSize;

    // Calculate aggregated totals from loaded lots
    const totalPhysical = lots.reduce((sum, l) => sum + (Number(l.physicalQuantity ?? l.available) || 0), 0);
    const totalAvailable = lots.reduce((sum, l) => sum + (Number(l.available) || 0), 0);
    const totalReserved = Math.max(0, totalPhysical - totalAvailable);
    const packagingAvailable = lots.filter((l) => l.isConvertiblePackaging).reduce((sum, l) => sum + (Number(l.available) || 0), 0);
    const totalFgUnits = reqPerNetFgUnit > 0 ? Math.floor(totalAvailable / reqPerNetFgUnit) : 0;
    const totalFullBatches = effectiveBatchSize > 0 ? Math.floor(totalFgUnits / effectiveBatchSize) : 0;
    const totalBatchDecimal = reqPerBatch > 0 ? (totalAvailable / reqPerBatch) : 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[95vw] sm:max-w-5xl md:max-w-6xl lg:max-w-7xl h-[88vh] max-h-[92vh] flex flex-col p-0 overflow-hidden">
                {/* Header */}
                <DialogHeader className="p-5 pb-4 border-b border-border/80">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                {getClassificationIcon(component?.classification)}
                                <DialogTitle className="text-base font-semibold text-foreground">
                                    {component?.productName || "Component Stock Breakdown"}
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                                <span>Code: <span className="font-mono text-foreground font-medium">{component?.productCode || "-"}</span></span>
                                <span>•</span>
                                <span>Branch: <span className="text-foreground font-medium">{branchName || `#${branchId || "-"}`}</span></span>
                                <span>•</span>
                                <Badge variant="secondary" className="text-[10px] py-0 px-2 font-medium">
                                    {ruleLabel}
                                </Badge>
                            </DialogDescription>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={fetchLots}
                                disabled={isLoading}
                                className="h-8 text-xs gap-1.5"
                                title="Revalidate lot inventory"
                            >
                                <RotateCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                                Revalidate
                            </Button>
                        </div>
                    </div>

                    {/* Summary Metric Ribbon */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                        <div className="bg-muted/40 rounded-md p-2.5 border border-border/40">
                            <span className="text-[10px] text-muted-foreground font-medium">Physical Stock On-Hand</span>
                            <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                                {Number.isFinite(totalPhysical) ? totalPhysical.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "-"} {component?.stockUomName}
                            </div>
                        </div>
                        <div className="bg-muted/40 rounded-md p-2.5 border border-border/40">
                            <span className="text-[10px] text-muted-foreground font-medium">Reserved Stock</span>
                            <div className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                                {Number.isFinite(totalReserved) ? totalReserved.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "-"} {component?.stockUomName}
                            </div>
                        </div>
                        <div className="bg-muted/40 rounded-md p-2.5 border border-border/40">
                            <span className="text-[10px] text-muted-foreground font-medium">Available to Use</span>
                            <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {Number.isFinite(totalAvailable) ? totalAvailable.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "-"} {component?.stockUomName}
                            </div>
                            {packagingAvailable > 0 && (
                                <span className="text-[10px] text-purple-600 dark:text-purple-400 block truncate">
                                    (+{packagingAvailable.toLocaleString(undefined, { maximumFractionDigits: 4 })} {component?.stockUomName} from convertible packaging)
                                </span>
                            )}
                        </div>
                        <div className="bg-primary/5 rounded-md p-2.5 border border-primary/20">
                            <span className="text-[10px] text-primary font-semibold">Projected Output</span>
                            <div className="text-sm font-bold font-mono text-primary mt-0.5">
                                {totalBatchDecimal > 0 ? `~${totalBatchDecimal.toLocaleString(undefined, { maximumFractionDigits: 2 })} Batches` : "0 Batches"}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {totalFgUnits.toLocaleString()} {fgUomName} ({totalFullBatches} full {totalFullBatches === 1 ? "batch" : "batches"})
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Content / Lots Table */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                    {isLoading ? (
                        <div className="space-y-3 py-2">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border/40">
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-5 w-24" />
                                    <Skeleton className="h-5 w-20" />
                                    <Skeleton className="h-5 w-28" />
                                </div>
                            ))}
                        </div>
                    ) : fetchError ? (
                        <div className="py-10 text-center space-y-2">
                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-1">
                                <AlertCircle className="h-5 w-5" />
                            </div>
                            <h4 className="text-sm font-semibold text-foreground">Failed to Load Lot Breakdown</h4>
                            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                {fetchError}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={fetchLots}
                                className="mt-2 text-xs"
                            >
                                Try Again
                            </Button>
                        </div>
                    ) : lots.length === 0 ? (
                        <div className="py-12 text-center space-y-2">
                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-1">
                                <Package className="h-5 w-5" />
                            </div>
                            <h4 className="text-sm font-semibold text-foreground">No Eligible Stock Lots Found</h4>
                            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                There are no active on-hand inventory lots recorded for this component at the selected branch.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-md border border-border/60 overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow className="text-[11px] font-semibold text-muted-foreground hover:bg-transparent">
                                        <TableHead
                                            className="pl-3 min-w-[170px] cursor-help"
                                            title="Unique manufacturing batch or lot identifier."
                                        >
                                            Lot / Batch #
                                        </TableHead>
                                        <TableHead
                                            className="min-w-[120px] cursor-help"
                                            title="Warehouse bin, shelf, or storage area where this lot is located."
                                        >
                                            Storage Location
                                        </TableHead>
                                        <TableHead
                                            className="min-w-[100px] cursor-help"
                                            title="Quality control inspection status (e.g., Approved, Good, On Hold, Rejected)."
                                        >
                                            QA Status
                                        </TableHead>
                                        <TableHead
                                            className="text-right min-w-[95px] cursor-help"
                                            title="Total physical count present in this lot."
                                        >
                                            Physical Qty
                                        </TableHead>
                                        <TableHead
                                            className="text-right min-w-[95px] cursor-help"
                                            title="Unreserved quantity in this lot ready to be issued to production."
                                        >
                                            Available Qty
                                        </TableHead>
                                        <TableHead
                                            className="text-right min-w-[140px] font-bold text-foreground cursor-help"
                                            title="Number of batches this individual lot alone can produce."
                                        >
                                            Batches Supported
                                        </TableHead>
                                        <TableHead
                                            className="text-right min-w-[130px] font-semibold text-foreground cursor-help"
                                            title="Finished units this individual lot alone can produce."
                                        >
                                            Projected Output ({fgUomName})
                                        </TableHead>
                                        <TableHead
                                            className="pr-3 min-w-[130px] cursor-help"
                                            title="FIFO tracking for packaging (oldest received first) or FEFO tracking for raw materials (earliest expiry first)."
                                        >
                                            {isPackaging ? "Date Received (FIFO)" : "Expiration Date (FEFO)"}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lots.map((lot, idx) => {
                                        const lotPhysical = Number(lot.physicalQuantity ?? lot.available) || 0;
                                        const lotAvailable = Number(lot.available) || 0;
                                        const s = (lot.qaStatus || "").toUpperCase();
                                        const isNonReservable = s.includes("REJECT") || s.includes("HOLD") || s.includes("QUARANTINE");
                                        const lotUnits = reqPerNetFgUnit > 0 && !isNonReservable ? Math.floor(lotAvailable / reqPerNetFgUnit) : 0;
                                        const lotFullBatches = effectiveBatchSize > 0 ? Math.floor(lotUnits / effectiveBatchSize) : 0;
                                        const lotBatchDecimal = reqPerBatch > 0 && !isNonReservable ? (lotAvailable / reqPerBatch) : 0;
                                        const dateDisplay = isPackaging
                                            ? lot.manufacturingDate || "-"
                                             : lot.expiryDate || "No Expiry";

                                        return (
                                            <TableRow
                                                key={`${lot.batchNo}-${idx}`}
                                                className="border-b transition-colors hover:bg-muted/30 text-xs"
                                            >
                                                <TableCell className="pl-3 py-2.5 font-mono font-medium text-foreground">
                                                    <div className="flex flex-col">
                                                        <span>{lot.batchNo || "-"}</span>
                                                        {lot.isConvertiblePackaging && (
                                                            <div className="flex flex-col gap-0.5 mt-0.5">
 
                                                                {lot.packagingNote && (
                                                                    <span className="text-[10px] text-muted-foreground font-sans">
                                                                        {lot.packagingNote}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2.5 text-muted-foreground">
                                                    {lot.storageLotName || "General Stock"}
                                                </TableCell>
                                                <TableCell className="py-2.5">
                                                    {getQaBadge(lot.qaStatus)}
                                                </TableCell>
                                                <TableCell className="text-right py-2.5 font-mono">
                                                    <div>
                                                        <span>{Number.isFinite(lotPhysical) ? lotPhysical.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "-"}</span>
                                                        <span className="text-[10px] text-muted-foreground ml-1">{component?.stockUomName}</span>
                                                    </div>
                                                    {lot.isConvertiblePackaging && lot.originalQuantity !== undefined && (
                                                        <span className="text-[10px] text-muted-foreground block font-sans">
                                                            from {lot.originalQuantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} {lot.originalUomName}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right py-2.5 font-mono font-semibold text-foreground">
                                                    <div>
                                                        <span>{Number.isFinite(lotAvailable) ? lotAvailable.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "-"}</span>
                                                        <span className="text-[10px] text-muted-foreground ml-1">{component?.stockUomName}</span>
                                                    </div>
                                                    {lot.isConvertiblePackaging && lot.originalQuantity !== undefined && (
                                                        <span className="text-[10px] text-muted-foreground block font-sans">
                                                            from {lot.originalQuantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} {lot.originalUomName}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right py-2.5 font-mono">
                                                    {isNonReservable ? (
                                                        <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/20 py-0 font-normal">
                                                            Ineligible
                                                        </Badge>
                                                    ) : lotAvailable <= 0 ? (
                                                        <span className="text-muted-foreground">0 Batches</span>
                                                    ) : (
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-bold text-foreground">
                                                                ~{lotBatchDecimal.toLocaleString(undefined, { maximumFractionDigits: 2 })} Batches
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {lotFullBatches} complete {lotFullBatches === 1 ? "batch" : "batches"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right py-2.5 font-mono font-medium">
                                                    {isNonReservable ? (
                                                        <span className="text-muted-foreground text-[11px]">-</span>
                                                    ) : lotAvailable <= 0 ? (
                                                        <span className="text-muted-foreground">0 {fgUomName}</span>
                                                    ) : (
                                                        <span className="font-semibold text-foreground">
                                                            {lotUnits.toLocaleString()} {fgUomName}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="pr-3 py-2.5 text-muted-foreground flex items-center gap-1.5">
                                                    {isPackaging ? (
                                                        <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                                    ) : (
                                                        <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                                                    )}
                                                    <span>{dateDisplay}</span>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 sm:p-4 bg-muted/20 border-t border-border/80 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Info className="h-3.5 w-3.5" />
                        <span>Lots are evaluated read-only. Reservations are unissued holds.</span>
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={onClose}
                        className="h-8 text-xs"
                    >
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
