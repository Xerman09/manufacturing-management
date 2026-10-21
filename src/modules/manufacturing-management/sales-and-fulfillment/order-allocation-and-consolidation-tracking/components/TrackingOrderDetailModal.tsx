// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/components/TrackingOrderDetailModal.tsx

import React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    FileText,
    RefreshCw,
    AlertTriangle,
    User,
    Building2,
    Calendar,
} from "lucide-react";
import { OrderTrackingItem } from "../types";
import { TrackingLineGrid } from "./TrackingLineGrid";

interface TrackingOrderDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: OrderTrackingItem | null;
    isLoading: boolean;
    onRefresh: () => void;
}

export const TrackingOrderDetailModal: React.FC<TrackingOrderDetailModalProps> = ({
    isOpen,
    onClose,
    order,
    isLoading,
    onRefresh,
}) => {
    if (!order) return null;

    const hasAnyException =
        order.exceptions.has_discrepancy ||
        order.exceptions.has_inconsistent_pick ||
        order.exceptions.has_excess_allocation ||
        order.exceptions.has_excess_consolidation ||
        order.exceptions.has_missing_reservations ||
        order.exceptions.has_zero_quantity ||
        order.exceptions.is_mixed_uom ||
        Boolean(order.exceptions.has_substituted_lot) ||
        Boolean(order.exceptions.has_added_lot);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[95vw] sm:max-w-[95vw] xl:max-w-[1600px] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
                {/* Header */}
                <DialogHeader className="p-4 sm:p-5 border-b bg-card">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pr-6">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-primary" />
                                    <span>{order.order_no}</span>
                                </DialogTitle>

                                <Badge
                                    variant="outline"
                                    className={`text-xs font-bold ${
                                        order.stage === "Fully Picked"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                            : order.stage === "In Picking"
                                            ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                                            : order.stage === "Ready for Picking"
                                            ? "bg-blue-50 text-blue-700 border-blue-300"
                                            : "bg-amber-50 text-amber-700 border-amber-300"
                                    }`}
                                >
                                    {order.stage}
                                </Badge>
                                {order.is_cancelled && (
                                    <Badge variant="destructive" className="text-xs">
                                        Cancelled
                                    </Badge>
                                )}
                            </div>

                            <DialogDescription className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                                <span className="flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    {order.customer_name} ({order.customer_code})
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Building2 className="w-3.5 h-3.5" />
                                    {order.branch_name}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {order.order_date ? new Date(order.order_date).toLocaleDateString() : "-"}
                                </span>
                            </DialogDescription>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onRefresh}
                                disabled={isLoading}
                                title="Refresh order details and batch allocations from server"
                                className="h-8 text-xs flex items-center gap-1.5"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
                                <span>Refresh</span>
                            </Button>
                        </div>
                    </div>

                    {/* Quick Metric Ribbon */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 mt-2 border-t text-xs">
                        <div className="p-2 rounded-lg bg-muted/40 flex flex-col" title="Total Sales Order Ordered Quantity across all items">
                            <span className="text-muted-foreground text-[10px] uppercase font-semibold">Total Ordered</span>
                            <span className="text-sm font-bold mt-0.5">
                                {order.total_ordered_quantity.toLocaleString()} {order.uom_summary}
                            </span>
                        </div>
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-900 dark:text-blue-200 flex flex-col" title="Total quantity reserved across inventory lots for this order">
                            <span className="text-blue-700 dark:text-blue-300 text-[10px] uppercase font-semibold">Allocated Qty</span>
                            <span className="text-sm font-bold mt-0.5 flex items-baseline gap-1">
                                <span>{order.total_allocated_quantity.toLocaleString()}</span>
                                <span className="text-[10px] font-normal opacity-80">({order.allocation_rate.toFixed(1)}%)</span>
                            </span>
                        </div>
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-900 dark:text-indigo-200 flex flex-col" title="Total quantity physically picked on warehouse floor">
                            <span className="text-indigo-700 dark:text-indigo-300 text-[10px] uppercase font-semibold">Physical Picked</span>
                            <span className="text-sm font-bold mt-0.5 flex items-baseline gap-1">
                                <span>{order.total_physical_picked_quantity.toLocaleString()}</span>
                                <span className="text-[10px] font-normal opacity-80">({order.physical_consolidation_rate.toFixed(1)}%)</span>
                            </span>
                        </div>
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 flex flex-col" title="Total quantity approved in consolidation batches">
                            <span className="text-emerald-700 dark:text-emerald-300 text-[10px] uppercase font-semibold">Approved Consolidation</span>
                            <span className="text-sm font-bold mt-0.5 flex items-baseline gap-1">
                                <span>{order.total_approved_consolidation_quantity.toLocaleString()}</span>
                                <span className="text-[10px] font-normal opacity-80">
                                    ({order.total_ordered_quantity > 0 ? ((order.total_approved_consolidation_quantity / order.total_ordered_quantity) * 100).toFixed(1) : 0}%)
                                </span>
                            </span>
                        </div>
                    </div>

                    {/* Exceptions Warning Banner */}
                    {hasAnyException && (
                        <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-300 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                            <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="font-semibold">Operational Alerts:</span>
                                {order.exceptions.has_added_lot && (
                                    <Badge variant="outline" className="text-[10px] bg-sky-100 text-sky-900 border-sky-300" title="One or more lots were added dynamically during warehouse picking">
                                        Added Lot Included
                                    </Badge>
                                )}
                                {order.exceptions.has_substituted_lot && (
                                    <Badge variant="outline" className="text-[10px] bg-sky-100 text-sky-900 border-sky-300" title="Warehouse staff picked from an alternative lot during picking">
                                        Substituted / Alternative Lot Picked
                                    </Badge>
                                )}
                                {order.exceptions.has_discrepancy && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-900 border-amber-300" title="Stored line allocated quantity differs from active lot reservations">
                                        Allocation Discrepancy (Stored vs Lot Rows)
                                    </Badge>
                                )}
                                {order.exceptions.has_inconsistent_pick && (
                                    <Badge variant="outline" className="text-[10px] bg-red-100 text-red-900 border-red-300" title="Physical picked quantity does not match consolidation batch record">
                                        Inconsistent Pick (Picked &gt; Reserved)
                                    </Badge>
                                )}
                                {order.exceptions.has_missing_reservations && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-900 border-amber-300" title="No lot reservations recorded for one or more lines">
                                        Missing Reservation Records
                                    </Badge>
                                )}
                                {order.exceptions.has_excess_allocation && (
                                    <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-900 border-purple-300" title="Allocated quantity exceeds ordered quantity">
                                        Excess Over-Allocation
                                    </Badge>
                                )}
                                {order.exceptions.has_excess_consolidation && (
                                    <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-900 border-purple-300" title="Consolidated quantity exceeds ordered quantity">
                                        Excess Over-Consolidation
                                    </Badge>
                                )}
                                {order.exceptions.is_mixed_uom && (
                                    <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-900 border-blue-300" title="Order contains items with multiple units of measure">
                                        Mixed UOM
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}
                </DialogHeader>

                {/* Body: Line Grid */}
                <div className="p-4 sm:p-5 overflow-y-auto flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Order Line Items ({order.lines.length})
                        </span>
                        <span className="text-[11px] text-muted-foreground italic">
                            Click arrow on any row to inspect underlying lot reservations and consolidation batches
                        </span>
                    </div>

                    <TrackingLineGrid lines={order.lines} />
                </div>

                {/* Footer */}
                <div className="p-3 border-t bg-muted/20 flex justify-end">
                    <Button variant="outline" size="sm" onClick={onClose} title="Close this modal" className="h-8 text-xs">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
