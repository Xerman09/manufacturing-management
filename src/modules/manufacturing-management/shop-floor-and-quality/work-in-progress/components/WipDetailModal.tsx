"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Activity,
    AlertTriangle,
    Boxes,
    Flame,
    Layers
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WipMaterialItem } from "../types";
import { formatQty, sortLotsByInventoryStrategy } from "../utils/wip-calculations";

interface WipDetailModalProps {
    open: boolean;
    onClose: () => void;
    item: WipMaterialItem | null;
    activeTab: "lots" | "consumptions" | "movements";
    onTabChange: (tab: "lots" | "consumptions" | "movements") => void;
}

export default function WipDetailModal({
    open,
    onClose,
    item,
    activeTab,
    onTabChange,
}: WipDetailModalProps) {
    const sortedLots = useMemo(() => {
        if (!item) return [];
        return sortLotsByInventoryStrategy(item.lots, item.isPackaging);
    }, [item]);

    if (!item) return null;

    const isNegative = item.remainingWipQuantity < 0;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent
                className="max-w-4xl min-w-[80vw] max-h-[90vh] flex flex-col p-0 overflow-hidden border shadow-2xl bg-background"
                aria-describedby="wip-detail-description"
            >
                {/* Header */}
                <DialogHeader className="p-4 sm:p-5 border-b bg-muted/30">
                    <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                    <Layers className="h-4 w-4" />
                                </span>
                                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                                    WIP Material Audit: {item.materialName || "-"}
                                </DialogTitle>
                            </div>
                            <p id="wip-detail-description" className="text-xs text-muted-foreground mt-1">
                                Job Order: <span className="font-semibold text-foreground">{item.jobOrderNo || "-"}</span> |
                                Target: <span className="font-semibold text-foreground">{item.targetProductDescription || item.targetProductName || "-"}</span> |
                                Branch: <span className="font-semibold text-foreground">{item.branchName || "-"}</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isNegative && (
                                <Badge variant="destructive" className="gap-1 py-1 text-xs">
                                    <AlertTriangle className="h-3 w-3" />
                                    Negative WIP ({formatQty(item.remainingWipQuantity)} {item.uomShortcut})
                                </Badge>
                            )}
 
                        </div>
                    </div>

                    {/* Summary metrics strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-3 mt-3 border-t text-xs">
                        <div className="rounded-lg bg-background p-2 border">
                            <span className="text-[10px] text-muted-foreground uppercase">Allocated</span>
                            <div className="font-mono font-medium text-foreground">{formatQty(item.allocatedQuantity)}</div>
                        </div>
                        <div className="rounded-lg bg-background p-2 border">
                            <span className="text-[10px] text-muted-foreground uppercase">Reserved</span>
                            <div className="font-mono font-medium text-amber-600 dark:text-amber-400">{formatQty(item.reservedQuantity)}</div>
                        </div>
                        <div className="rounded-lg bg-background p-2 border">
                            <span className="text-[10px] text-muted-foreground uppercase">Issued to WIP</span>
                            <div className="font-mono font-medium text-indigo-600 dark:text-indigo-400">{formatQty(item.issuedQuantity)}</div>
                        </div>
                        <div className="rounded-lg bg-background p-2 border">
                            <span className="text-[10px] text-muted-foreground uppercase">Consumed</span>
                            <div className="font-mono font-medium text-foreground">{formatQty(item.consumedQuantity)}</div>
                        </div>
                        <div className="rounded-lg bg-background p-2 border">
                            <span className="text-[10px] text-muted-foreground uppercase">Returned</span>
                            <div className="font-mono font-medium text-muted-foreground">{formatQty(item.returnedQuantity)}</div>
                        </div>
                        <div className={`rounded-lg bg-background p-2 border ${isNegative ? "border-rose-500/40 bg-rose-500/5" : ""}`}>
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Remaining WIP</span>
                            <div className={`font-mono font-bold ${isNegative ? "text-rose-600 dark:text-rose-400" : "text-cyan-600 dark:text-cyan-400"}`}>
                                {formatQty(item.remainingWipQuantity)} {item.uomShortcut}
                            </div>
                        </div>
                    </div>

                    {/* Discrepancy Alert Banner */}
                    {(item.hasDiscrepancy || isNegative) && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 mt-3 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                            <div className="space-y-0.5">
                                <span className="font-semibold text-rose-700 dark:text-rose-300">
                                    Negative Floor WIP / Material Discrepancy
                                </span>
                                <p className="text-[11px] leading-relaxed text-rose-800 dark:text-rose-300/90">
                                    {item.discrepancyNote ||
                                        `Consumed quantity (${formatQty(item.consumedQuantity)} ${item.uomShortcut}) exceeds issued quantity (${formatQty(item.issuedQuantity)} ${item.uomShortcut}).`}
                                    {item.issuedQuantity === 0 && (
                                        <span className="block mt-1 font-medium text-rose-700 dark:text-rose-400">
                                            No warehouse issue or staging transaction was recorded before consumption occurred on the shop floor.
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="flex items-center gap-2 pt-3 border-t">
                        <button
                            type="button"
                            onClick={() => onTabChange("lots")}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                                activeTab === "lots"
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                            <Boxes className="h-3.5 w-3.5" />
                            Batch Lots &amp; Reservations ({item.lots.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => onTabChange("consumptions")}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                                activeTab === "consumptions"
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                            <Flame className="h-3.5 w-3.5" />
                            Shift Consumptions ({item.consumptions.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => onTabChange("movements")}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                                activeTab === "movements"
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                            <Activity className="h-3.5 w-3.5" />
                            Stock Movements ({item.movements.length})
                        </button>
                    </div>
                </DialogHeader>

                {/* Tab Content Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                    <AnimatePresence mode="wait">
                        {activeTab === "lots" && (
                            <motion.div
                                key="tab-lots"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-3"
                            >
                                <div className="text-xs text-muted-foreground flex items-center justify-between">
                                    <span>
                                        Authoritative batch lots ordered by{" "}
                                        <span className="font-semibold text-foreground">
                                            {item.isPackaging ? "FIFO (First In, First Out)" : "FEFO (First Expired, First Out)"}
                                        </span>
                                    </span>
                                    <span>{sortedLots.length} lot allocations</span>
                                </div>

                                {sortedLots.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                                        No individual batch reservations found for this material.
                                    </div>
                                ) : (
                                    <div className="rounded-lg border bg-card overflow-hidden">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground border-b uppercase">
                                                <tr>
                                                    <th className="py-2.5 px-3">Batch / Lot No</th>
                                                    <th className="py-2.5 px-3">Bin</th>
                                                    <th className="py-2.5 px-3">Expiry Date</th>
                                                    <th className="py-2.5 px-2 text-right">Reserved</th>
                                                    <th className="py-2.5 px-2 text-right">Issued to WIP</th>
                                                    <th className="py-2.5 px-2 text-right">Consumed</th>
                                                    <th className="py-2.5 px-2 text-right">Returned</th>
                                                    <th className="py-2.5 px-3 text-right">Remaining WIP</th>
                                                    <th className="py-2.5 px-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {sortedLots.map((lot, idx) => {
                                                    const lotRemaining = lot.remainingWipQuantity;
                                                    const isExpired = Boolean(lot.isExpired && lotRemaining > 0);
                                                    const status = (lot.reservationStatus || "ALLOCATED").toUpperCase();

                                                    return (
                                                        <tr key={lot.reservationId || idx} className="hover:bg-muted/30">
                                                            <td className="py-2.5 px-3">
                                                                <div className="font-semibold text-foreground font-mono">
                                                                    {lot.batchNo || lot.lotNo || "-"}
                                                                </div>
                                                                {(lot.lotNo || lot.productDescription || (lot.productName && lot.productName !== "-")) && (
                                                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5 font-sans">
                                                                        {lot.lotNo && lot.lotNo !== lot.batchNo && (
                                                                            <span className="font-mono font-medium text-foreground/80">
                                                                                Lot: {lot.lotNo}
                                                                            </span>
                                                                        )}
                                                                        {lot.lotNo && lot.lotNo !== lot.batchNo && (lot.productDescription || lot.productName) && (
                                                                            <span>•</span>
                                                                        )}
                                                                        {lot.productDescription && lot.productDescription !== "-" ? (
                                                                            <span className="truncate max-w-[220px]" title={lot.productDescription}>
                                                                                {lot.productDescription}
                                                                            </span>
                                                                        ) : lot.productName && lot.productName !== "-" ? (
                                                                            <span className="truncate max-w-[220px]" title={lot.productName}>
                                                                                {lot.productName}
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-2.5 px-3">
                                                                {lot.stagingBin ? (
                                                                    <div>
                                                                        <div className="font-medium text-foreground">
                                                                            {lot.stagingBin}
                                                                        </div>
                                                                        {lot.stagingBinCode && lot.stagingBinCode !== lot.stagingBin && (
                                                                            <div className="text-[10px] text-muted-foreground font-mono">
                                                                                {lot.stagingBinCode}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground">-</span>
                                                                )}
                                                            </td>
                                                            <td className="py-2.5 px-3">
                                                                {lot.expiryDate ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <span className={`font-mono ${isExpired ? "text-rose-500 font-semibold" : "text-muted-foreground"}`}>
                                                                            {lot.expiryDate}
                                                                        </span>
                                                                        {isExpired && (
                                                                            <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                                                                Expired
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground">-</span>
                                                                )}
                                                            </td>
                                                            <td className="py-2.5 px-2 text-right font-mono text-amber-600 dark:text-amber-400">
                                                                {formatQty(lot.reservedQuantity)}
                                                            </td>
                                                            <td className="py-2.5 px-2 text-right font-mono font-medium text-indigo-600 dark:text-indigo-400">
                                                                {formatQty(lot.issuedToWipQuantity)}
                                                            </td>
                                                            <td className="py-2.5 px-2 text-right font-mono text-foreground">
                                                                {formatQty(lot.actualUsedQuantity)}
                                                            </td>
                                                            <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">
                                                                {formatQty(lot.returnedQuantity)}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-mono font-bold">
                                                                <span
                                                                    className={`px-1.5 py-0.5 rounded ${
                                                                        lotRemaining < 0
                                                                            ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
                                                                            : lotRemaining > 0
                                                                            ? "text-cyan-600 dark:text-cyan-400"
                                                                            : "text-muted-foreground"
                                                                    }`}
                                                                >
                                                                    {formatQty(lotRemaining)}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center">
                                                                {status === "CONSUMED" ? (
                                                                    <Badge variant="secondary" className="text-[10px] py-0 text-muted-foreground bg-muted/60">
                                                                        CONSUMED
                                                                    </Badge>
                                                                ) : status === "RETURNED" ? (
                                                                    <Badge variant="outline" className="text-[10px] py-0 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10">
                                                                        RETURNED
                                                                    </Badge>
                                                                ) : status === "WIP" || status === "IN WIP" ? (
                                                                    <Badge variant="outline" className="text-[10px] py-0 border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10">
                                                                        WIP
                                                                    </Badge>
                                                                ) : status === "DEFICIT" ? (
                                                                    <Badge variant="destructive" className="text-[10px] py-0">
                                                                        DEFICIT
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-[10px] py-0 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                                                                        {lot.reservationStatus || "ALLOCATED"}
                                                                    </Badge>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === "consumptions" && (
                            <motion.div
                                key="tab-consumptions"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-3"
                            >
                                <div className="text-xs text-muted-foreground">
                                    Actual usage recorded during production shift execution runs:
                                </div>

                                {item.consumptions.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                                        No shift consumption logs recorded yet for this material.
                                    </div>
                                ) : (
                                    <div className="rounded-lg border bg-card overflow-hidden">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground border-b uppercase">
                                                <tr>
                                                    <th className="py-2.5 px-3">Shift Run</th>
                                                    <th className="py-2.5 px-3">Batch Reference</th>
                                                    <th className="py-2.5 px-3 text-right">Actual Consumed</th>
                                                    <th className="py-2.5 px-3 text-right">Theoretical Qty</th>
                                                    <th className="py-2.5 px-3 text-right">Variance</th>
                                                    <th className="py-2.5 px-3">Logged Date</th>
                                                    <th className="py-2.5 px-3">Variance Note</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {item.consumptions.map((c, idx) => (
                                                    <tr key={c.consumageId || idx} className="hover:bg-muted/30">
                                                        <td className="py-2.5 px-3 font-semibold text-foreground">
                                                            {c.shiftName && c.shiftName !== "-" ? c.shiftName : (c.ledgerId ? `Ledger #${c.ledgerId}` : "-")}
                                                        </td>
                                                        <td className="py-2.5 px-3 font-mono text-muted-foreground">
                                                            {c.batchNo || "-"}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground">
                                                            {formatQty(c.quantityConsumed)} {c.uomShortcut}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                                                            {formatQty(c.theoreticalQuantity)}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-mono">
                                                            <span className={c.varianceQuantity > 0 ? "text-rose-500 font-medium" : "text-muted-foreground"}>
                                                                {c.varianceQuantity ? formatQty(c.varianceQuantity) : "-"}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-muted-foreground">
                                                            {c.loggedAt ? new Date(c.loggedAt).toLocaleString("en-US") : "-"}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-muted-foreground italic truncate max-w-[200px]">
                                                            {c.varianceReason || "-"}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === "movements" && (
                            <motion.div
                                key="tab-movements"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-3"
                            >
                                <div className="text-xs text-muted-foreground">
                                    Live stock ledger transactions verified through Spring Boot inventory movements:
                                </div>

                                {item.movements.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                                        No posted warehouse movements currently linked to this Job Order reference.
                                    </div>
                                ) : (
                                    <div className="rounded-lg border bg-card overflow-hidden">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground border-b uppercase">
                                                <tr>
                                                    <th className="py-2.5 px-3">Transaction Type</th>
                                                    <th className="py-2.5 px-3">Direction</th>
                                                    <th className="py-2.5 px-3">Batch No</th>
                                                    <th className="py-2.5 px-3 text-right">Qty In</th>
                                                    <th className="py-2.5 px-3 text-right">Qty Out</th>
                                                    <th className="py-2.5 px-3">Transaction Date</th>
                                                    <th className="py-2.5 px-3">Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {item.movements.map((m, idx) => (
                                                    <tr key={m.movementKey || idx} className="hover:bg-muted/30">
                                                        <td className="py-2.5 px-3 font-medium text-foreground">
                                                            {m.transactionType || "-"}
                                                        </td>
                                                        <td className="py-2.5 px-3">
                                                            <Badge variant={m.movementDirection === "IN" ? "outline" : "secondary"} className="text-[10px] py-0">
                                                                {m.movementDirection || "-"}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-2.5 px-3 font-mono text-muted-foreground">
                                                            {m.batchNo || "-"}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                                            {m.quantityIn ? formatQty(m.quantityIn) : "-"}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                                                            {m.quantityOut ? formatQty(m.quantityOut) : "-"}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-muted-foreground">
                                                            {m.transactionDate ? new Date(m.transactionDate).toLocaleString("en-US") : "-"}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[200px]" title={m.remarks || ""}>
                                                            {m.remarks || "-"}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="p-3 sm:p-4 border-t bg-muted/20 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                        Non-posting audit trail view. Values reflect authoritative warehouse reservations and recorded production runs.
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
