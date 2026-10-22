// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/components/AuditReservationConsolidationPanels.tsx

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
    Boxes,
    PackageCheck,
    AlertTriangle,
    Clock,
    User,
    Calendar,
    ArrowRightLeft,
    CheckCircle2,
} from "lucide-react";
import { formatDateTime } from "../utils/dateformat";
import { LotReservationRef, ConsolidationBatchRef } from "../types";

interface AuditReservationConsolidationPanelsProps {
    reservations: LotReservationRef[];
    consolidationBatches: ConsolidationBatchRef[];
    uom: string;
    orderedQuantity: number;
}

export const AuditReservationConsolidationPanels: React.FC<AuditReservationConsolidationPanelsProps> = ({
    reservations,
    consolidationBatches,
    uom,
    orderedQuantity,
}) => {
    const [activeTab, setActiveTab] = useState<"reservations" | "consolidation">("reservations");

    // Filter strictly to lots planned during Consolidation Planning (excludes lots added dynamically during floor picking)
    const plannedReservations = reservations.filter((r) => !r.is_added_lot);

    return (
        <div className="bg-muted/30 border rounded-lg p-3 space-y-3">
            {/* Tab Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveTab("reservations")}
                        title="Stock reserved during Consolidation Planning (Step 2)"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === "reservations"
                                ? "bg-background text-primary shadow-xs border"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <Boxes className="w-3.5 h-3.5" />
                        <span>Planned Lot Allocations ({plannedReservations.length})</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("consolidation")}
                        title="Actual physical picks executed during Consolidation Picking (Step 3)"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${activeTab === "consolidation"
                                ? "bg-background text-indigo-600 shadow-xs border"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Consolidation Batches &amp; Physical Picks ({reservations.length})</span>
                    </button>
                </div>


            </div>

            {/* Panel Content with Motion */}
            <AnimatePresence mode="wait">
                {activeTab === "reservations" && (
                    <motion.div
                        key="tab-reservations"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-2"
                    >
                        {plannedReservations.length === 0 ? (
                            <div className="py-4 text-center text-xs text-muted-foreground italic">
                                No planned lot reservations recorded for this item line.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b text-muted-foreground text-[11px]">
                                            <th className="py-2 px-3 font-semibold text-left" title="Assigned Inventory Lot Number">Lot</th>
                                            <th className="py-2 px-3 font-semibold text-left" title="Manufacturer / Production Batch Number">Batch No</th>
                                            <th className="py-2 px-3 font-semibold text-left" title="Lot Expiration Date (First Expired, First Out)">Expiry (FEFO)</th>
                                            <th className="py-2 px-3 font-semibold text-left" title="Total Sales Order Ordered Quantity for this line item">Ordered</th>
                                            <th className="py-2 px-3 font-semibold text-left" title="Quantity reserved during Consolidation Planning (Step 2)">Planned Reserved</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {plannedReservations.map((r) => (
                                            <tr key={r.reservation_id} className="hover:bg-muted/50 transition-colors">
                                                <td className="py-2 px-3 text-left font-semibold" title={`Lot Number: ${r.lot_number || "-"}`}>
                                                    {r.lot_number || "-"}
                                                </td>
                                                <td className="py-2 px-3 text-left text-muted-foreground font-mono text-[11px]" title={`Batch No: ${r.batch_no || "-"}`}>
                                                    {r.batch_no || "-"}
                                                </td>
                                                <td className="py-2 px-3 text-left" title={`Expiry Date: ${r.expiry_date ? new Date(r.expiry_date).toLocaleDateString() : "N/A"}`}>
                                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                        <Calendar className="w-3 h-3" />
                                                        <span>
                                                            {r.expiry_date
                                                                ? new Date(r.expiry_date).toLocaleDateString()
                                                                : "-"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-2 px-3 text-left font-medium text-foreground" title={`Line Ordered Quantity: ${orderedQuantity.toLocaleString()} ${uom}`}>
                                                    {orderedQuantity.toLocaleString()} {uom}
                                                </td>
                                                <td className="py-2 px-3 text-left font-medium text-blue-700 dark:text-blue-300" title={`Planned Reserved: ${r.reserved_quantity.toLocaleString()} ${uom}`}>
                                                    {r.reserved_quantity.toLocaleString()} {uom}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>
                )}

                {activeTab === "consolidation" && (
                    <motion.div
                        key="tab-consolidation"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                    >
                        {/* 1. Consolidation Batches Table */}
                        <div className="space-y-1.5">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Consolidation Batches ({consolidationBatches.length})
                            </div>
                            {consolidationBatches.length === 0 ? (
                                <div className="py-3 text-xs text-muted-foreground italic">
                                    No consolidation batch assignments found for this item line.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b text-muted-foreground text-[11px]">
                                                <th className="py-2 px-3 font-semibold text-left" title="Consolidation Document / Batch Identifier">Consolidator No</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Current approval status of this consolidation batch">Batch Status</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Quantity planned in this consolidation batch">Planned Quantity</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Physical quantity picked on floor for this batch">Picked Quantity</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Warehouse operator who executed physical picking">Picked By</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Timestamp when physical picking was completed">Picked At</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60">
                                            {consolidationBatches.map((b) => (
                                                <tr key={b.id} className="hover:bg-muted/50 transition-colors">
                                                    <td className="py-2 px-3 text-left font-semibold text-indigo-700 dark:text-indigo-300" title={`Consolidator Document: ${b.consolidator_no || "-"}`}>
                                                        {b.consolidator_no || "-"}
                                                    </td>
                                                    <td className="py-2 px-3 text-left" title={`Batch Status: ${b.batch_status || "-"}`}>
                                                        <Badge variant="outline" className="text-[10px]" title={`Status: ${b.batch_status || "-"}`}>
                                                            {b.batch_status || "-"}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-2 px-3 text-left font-medium text-purple-700 dark:text-purple-300" title={`Applied Quantity: ${b.applied_quantity.toLocaleString()} ${uom}`}>
                                                        {b.applied_quantity.toLocaleString()} {uom}
                                                    </td>
                                                    <td className="py-2 px-3 text-left font-bold text-emerald-700 dark:text-emerald-300" title={`Picked Quantity: ${b.picked_quantity.toLocaleString()} ${uom}`}>
                                                        {b.picked_quantity.toLocaleString()} {uom}
                                                    </td>
                                                    <td className="py-2 px-3 text-left" title={`Picked By: ${b.picked_by_name || "-"}`}>
                                                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                            <User className="w-3 h-3" />
                                                            <span>{b.picked_by_name || "-"}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-3 text-left" title={`Picked At: ${formatDateTime(b.picked_at) || "-"}`}>
                                                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                            <Clock className="w-3 h-3" />
                                                            <span>
                                                                {formatDateTime(b.picked_at) || "-"}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* 2. Warehouse Floor Lot Picks Breakdown */}
                        <div className="space-y-1.5 pt-3 border-t">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Warehouse Floor Lot Picks ({reservations.length})
                            </div>
                            {reservations.length === 0 ? (
                                <div className="py-3 text-xs text-muted-foreground italic">
                                    No physical lot picks recorded for this item line.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b text-muted-foreground text-[11px]">
                                                <th className="py-2 px-3 font-semibold text-left" title="Inventory Lot Number picked on warehouse floor">Lot</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Production Batch Number">Batch No</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Lot Expiration Date (First Expired, First Out)">Expiry (FEFO)</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Planned reservation quantity for this lot">Planned Reserved</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Actual physical quantity picked from this lot">Actual Picked</th>
                                                <th className="py-2 px-3 font-semibold text-left" title="Nature of lot allocation: Planned Lot, Added Lot, Substituted Lot, etc.">Allocation Nature</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60">
                                            {reservations.map((r) => {
                                                const isSubstituted = r.is_substituted_lot || (r.reserved_quantity === 0 && r.picked_quantity > 0);
                                                const isUnpickedPlan = r.reserved_quantity > 0 && r.picked_quantity === 0;
                                                const isPlannedAndPicked = r.reserved_quantity > 0 && r.picked_quantity > 0;

                                                return (
                                                    <tr key={r.reservation_id} className="hover:bg-muted/50 transition-colors">
                                                        <td className="py-2 px-3 text-left font-semibold" title={`Lot Number: ${r.lot_number || "-"}`}>
                                                            {r.lot_number || "-"}
                                                        </td>
                                                        <td className="py-2 px-3 text-left text-muted-foreground font-mono text-[11px]" title={`Batch No: ${r.batch_no || "-"}`}>
                                                            {r.batch_no || "-"}
                                                        </td>
                                                        <td className="py-2 px-3 text-left" title={`Expiry Date: ${r.expiry_date ? new Date(r.expiry_date).toLocaleDateString() : "N/A"}`}>
                                                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                <Calendar className="w-3 h-3" />
                                                                <span>
                                                                    {r.expiry_date
                                                                        ? new Date(r.expiry_date).toLocaleDateString()
                                                                        : "-"}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-3 text-left font-medium" title={`Planned Reserved: ${r.reserved_quantity.toLocaleString()} ${uom}`}>
                                                            {r.reserved_quantity.toLocaleString()} {uom}
                                                        </td>
                                                        <td className="py-2 px-3 text-left font-bold text-emerald-700 dark:text-emerald-300" title={`Actual Picked: ${r.picked_quantity.toLocaleString()} ${uom}`}>
                                                            {r.picked_quantity.toLocaleString()} {uom}
                                                        </td>
                                                        <td className="py-2 px-3 text-left">
                                                            {r.is_added_lot ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[9px] bg-sky-50 text-sky-700 border-sky-300 font-semibold flex items-center gap-1 w-fit"
                                                                    title="Additional lot added dynamically during warehouse floor picking"
                                                                >
                                                                    <ArrowRightLeft className="w-2.5 h-2.5" /> Added Lot
                                                                </Badge>
                                                            ) : isSubstituted ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[9px] bg-sky-50 text-sky-700 border-sky-300 font-semibold flex items-center gap-1 w-fit"
                                                                    title="Warehouse staff picked from an alternative lot during picking"
                                                                >
                                                                    <ArrowRightLeft className="w-2.5 h-2.5" /> Substituted Lot
                                                                </Badge>
                                                            ) : r.is_pick_exceeds_reserve ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[9px] bg-red-50 text-red-700 border-red-300 font-bold flex items-center gap-1 w-fit"
                                                                    title="Physical picked quantity exceeds planned reserved quantity"
                                                                >
                                                                    <AlertTriangle className="w-2.5 h-2.5" /> Pick &gt; Reserved
                                                                </Badge>
                                                            ) : isUnpickedPlan ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[9px] bg-slate-50 text-slate-600 border-slate-300 font-medium flex items-center gap-1 w-fit"
                                                                    title="Planned lot reservation that has not been picked yet"
                                                                >
                                                                    Unpicked Plan
                                                                </Badge>
                                                            ) : isPlannedAndPicked ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold flex items-center gap-1 w-fit"
                                                                    title="Original lot reserved during Consolidation Planning and picked on floor"
                                                                >
                                                                    <CheckCircle2 className="w-2.5 h-2.5" /> Planned Lot
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-[10px] text-muted-foreground" title="Original lot reserved during Consolidation Planning">Planned Lot</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
