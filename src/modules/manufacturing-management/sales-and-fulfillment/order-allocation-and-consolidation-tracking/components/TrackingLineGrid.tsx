// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/components/TrackingLineGrid.tsx

import React, { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OrderTrackingLineItem } from "../types";
import { AuditReservationConsolidationPanels } from "./AuditReservationConsolidationPanels";

interface TrackingLineGridProps {
    lines: OrderTrackingLineItem[];
}

export const TrackingLineGrid: React.FC<TrackingLineGridProps> = ({ lines }) => {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    const toggleRow = (detailId: number) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(detailId)) {
                next.delete(detailId);
            } else {
                next.add(detailId);
            }
            return next;
        });
    };

    const getStageBadge = (stage: string) => {
        switch (stage) {
            case "Fully Picked":
                return (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 font-bold px-2 py-0.5" title="Fulfillment Stage: All ordered quantities physically picked">
                        Fully Picked
                    </Badge>
                );
            case "In Picking":
                return (
                    <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-300 font-semibold px-2 py-0.5" title="Fulfillment Stage: Partial physical picks recorded">
                        In Picking
                    </Badge>
                );
            case "Ready for Picking":
                return (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-300 font-semibold px-2 py-0.5" title="Fulfillment Stage: Consolidation batch created, awaiting warehouse picking">
                        Ready for Picking
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 font-semibold px-2 py-0.5" title="Fulfillment Stage: Pending lot allocation">
                        Awaiting Allocation
                    </Badge>
                );
        }
    };

    if (lines.length === 0) {
        return (
            <div className="py-8 text-center text-muted-foreground text-sm italic">
                No items found for this sales order.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto border rounded-lg bg-card">
            <table className="w-full text-left text-xs border-collapse">
                <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                        <th className="p-2.5 pl-3 w-8" title="Click arrow to inspect underlying lot reservations and consolidation batches"></th>
                        <th className="p-2.5 text-left font-semibold" title="Product Item Name and SKU Code">Product Item</th>
                        <th className="p-2.5 text-left font-semibold" title="Inventory Unit of Measure">UOM</th>
                        <th className="p-2.5 text-left font-semibold" title="Total Sales Order Quantity Requested">Ordered Qty</th>
                        <th className="p-2.5 text-left font-semibold" title="Total Quantity Reserved Across Inventory Lots">Allocated Qty</th>
                        <th className="p-2.5 text-left font-semibold" title="Remaining Quantity Needed to Fulfill (Ordered - Allocated)">Remaining Allocation</th>
                        <th className="p-2.5 text-left font-semibold" title="Physical Quantity Picked on Floor During Consolidation Picking">Physical (Pick)</th>
                        <th className="p-2.5 text-left font-semibold" title="Quantity Approved in Consolidation Batches">Approved Consolidation</th>
                        <th className="p-2.5 text-left font-semibold" title="Remaining Quantity to Physically Consolidate (Ordered - Physical Pick)">Remaining Consolidation</th>
                        <th className="p-2.5 text-left font-semibold" title="Total Quantity Invoiced across Sales Invoices">Invoiced Qty</th>
                        <th className="p-2.5 text-left font-semibold" title="Delivered or Served Quantity to Customer">Served Qty</th>
                        <th className="p-2.5 text-left font-semibold" title="Current Fulfillment Stage for this line item">Fulfillment Stage</th>
                        <th className="p-2.5 pr-3 text-left font-semibold" title="Operational alerts, lot substitutions, or picking discrepancies">Exceptions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {lines.map((line) => {
                        const isExpanded = expandedRows.has(line.detail_id);
                        const hasLineExceptions =
                            line.is_discrepancy ||
                            line.is_pick_exceeds_reserve ||
                            line.is_excess_allocation ||
                            line.is_excess_consolidation ||
                            line.is_missing_reservations ||
                            line.is_zero_quantity;

                        return (
                            <React.Fragment key={line.detail_id}>
                                <tr
                                    className={`hover:bg-muted/30 transition-colors cursor-pointer ${isExpanded ? "bg-muted/20" : ""
                                        }`}
                                    onClick={() => toggleRow(line.detail_id)}
                                    title={isExpanded ? "Click to collapse lot details" : "Click to expand lot details"}
                                >
                                    {/* Expand Arrow */}
                                    <td className="p-2.5 pl-3 text-muted-foreground" title={isExpanded ? "Collapse details" : "Expand details"}>
                                        {isExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-primary" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4" />
                                        )}
                                    </td>

                                    {/* Product */}
                                    <td className="p-2.5 text-left" title={`${line.product_name || ""} (${line.product_code || ""})`}>
                                        <div className="font-semibold text-foreground">{line.product_name || "-"}</div>
                                        <div className="text-[10px] text-muted-foreground">{line.product_code || "-"}</div>
                                    </td>

                                    {/* UOM */}
                                    <td className="p-2.5 text-left text-muted-foreground font-mono" title={`Unit of Measure: ${line.uom || "-"}`}>{line.uom || "-"}</td>

                                    {/* Ordered Qty */}
                                    <td className="p-2.5 text-left font-bold text-foreground" title={`Ordered: ${line.ordered_quantity.toLocaleString()} ${line.uom}`}>
                                        {line.ordered_quantity.toLocaleString()}
                                    </td>

                                    {/* Allocated Qty */}
                                    <td className="p-2.5 text-left font-bold text-blue-700 dark:text-blue-300" title={`Allocated: ${line.allocated_quantity.toLocaleString()} ${line.uom}`}>
                                        <div className="flex items-center justify-start gap-1">
                                            <span>{line.allocated_quantity.toLocaleString()}</span>
                                            {line.is_discrepancy && (
                                                <span title={`Discrepancy: Stored line allocated quantity (${line.stored_allocated_quantity}) differs from active lot reservations (${line.allocated_quantity})`}>
                                                    <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* Rem to Alloc */}
                                    <td className="p-2.5 text-left text-muted-foreground" title={`Remaining to Allocate: ${line.remaining_to_allocate.toLocaleString()} ${line.uom}`}>
                                        {line.remaining_to_allocate.toLocaleString()}
                                    </td>

                                    {/* Physical Pick */}
                                    <td className="p-2.5 text-left font-bold text-indigo-700 dark:text-indigo-300" title={`Physical Picked: ${line.picked_consolidation_quantity.toLocaleString()} ${line.uom}`}>
                                        {line.picked_consolidation_quantity.toLocaleString()}
                                    </td>

                                    {/* Approved Consol */}
                                    <td className="p-2.5 text-left font-bold text-emerald-700 dark:text-emerald-300" title={`Approved Consolidation: ${line.approved_consolidation_quantity.toLocaleString()} ${line.uom}`}>
                                        {line.approved_consolidation_quantity.toLocaleString()}
                                    </td>

                                    {/* Rem to Consolidate */}
                                    <td className="p-2.5 text-left text-muted-foreground" title={`Remaining to Consolidate: ${line.remaining_to_consolidate_physical.toLocaleString()} ${line.uom}`}>
                                        {line.remaining_to_consolidate_physical.toLocaleString()}
                                    </td>

                                    {/* Invoiced Qty */}
                                    <td className="p-2.5 text-left font-medium text-sky-700 dark:text-sky-300" title={`Invoiced: ${line.invoiced_quantity > 0 ? `${line.invoiced_quantity.toLocaleString()} ${line.uom}` : "-"}`}>
                                        {line.invoiced_quantity > 0 ? line.invoiced_quantity.toLocaleString() : "-"}
                                    </td>

                                    {/* Served Qty */}
                                    <td className="p-2.5 text-left font-bold text-emerald-700 dark:text-emerald-300" title={`Served: ${line.served_quantity.toLocaleString()} ${line.uom}`}>
                                        {line.served_quantity.toLocaleString()}
                                    </td>

                                    {/* Fulfillment Stage */}
                                    <td className="p-2.5 text-left" title={`Fulfillment Stage: ${line.stage}`}>
                                        {getStageBadge(line.stage)}
                                    </td>

                                    {/* Exceptions */}
                                    <td className="p-2.5 pr-3">
                                        {!hasLineExceptions && !line.reservations.some((r) => r.is_substituted_lot || r.is_added_lot) ? (
                                            <span className="text-[10px] text-muted-foreground" title="No exceptions recorded">—</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {line.reservations.some((r) => r.is_added_lot) && (
                                                    <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-300" title="Additional lot added during picking">
                                                        Added Lot
                                                    </Badge>
                                                )}
                                                {line.reservations.some((r) => r.is_substituted_lot && !r.is_added_lot) && (
                                                    <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-300" title="Warehouse staff picked from an alternative lot during picking">
                                                        Substituted Lot
                                                    </Badge>
                                                )}
                                                {line.is_discrepancy && (
                                                    <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300 flex items-center gap-0.5" title="Allocation mismatch between stored total and lot rows">
                                                        <AlertTriangle className="w-2.5 h-2.5" /> Mismatch
                                                    </Badge>
                                                )}
                                                {line.is_pick_exceeds_reserve && (
                                                    <Badge variant="outline" className="text-[9px] bg-red-50 text-red-700 border-red-300" title="Physical picked quantity exceeds reserved lot allocation">
                                                        Pick &gt; Resv
                                                    </Badge>
                                                )}
                                                {line.is_excess_allocation && (
                                                    <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-300" title="Allocated quantity exceeds ordered quantity (Over-allocation)">
                                                        +Alloc
                                                    </Badge>
                                                )}
                                                {line.is_excess_consolidation && (
                                                    <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-300" title="Consolidated quantity exceeds ordered quantity (Over-consolidation)">
                                                        +Consol
                                                    </Badge>
                                                )}
                                                {line.is_missing_reservations && (
                                                    <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300" title="No lot reservations recorded for this line item">
                                                        No Resv
                                                    </Badge>
                                                )}
                                                {line.is_zero_quantity && (
                                                    <Badge variant="outline" className="text-[9px] bg-gray-100 text-gray-700 border-gray-300" title="Ordered quantity is zero or empty">
                                                        Zero Qty
                                                    </Badge>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>

                                {/* Expanded Audit Panels */}
                                {isExpanded && (
                                    <tr className="bg-muted/15">
                                        <td colSpan={13} className="p-3 pl-10 pr-3">
                                            <AuditReservationConsolidationPanels
                                                reservations={line.reservations}
                                                consolidationBatches={line.consolidation_batches}
                                                uom={line.uom}
                                                orderedQuantity={line.ordered_quantity}
                                            />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
