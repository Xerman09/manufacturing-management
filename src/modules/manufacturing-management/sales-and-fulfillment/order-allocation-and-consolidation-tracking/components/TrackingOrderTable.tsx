// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/components/TrackingOrderTable.tsx

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Eye,
    FileText,
    Boxes,
    Layers,
    Calendar,
    Building2,
    TrendingUp,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrderTrackingItem } from "../types";

interface TrackingOrderTableProps {
    orders: OrderTrackingItem[];
    isLoading: boolean;
    onSelectOrder: (order: OrderTrackingItem) => void;
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
    onPageChange: (newPage: number) => void;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    onSort?: (column: string) => void;
}

function getVisiblePages(current: number, total: number): (number | "ellipsis")[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i);
    }
    const pages: (number | "ellipsis")[] = [];
    pages.push(0);

    if (current > 2) {
        pages.push("ellipsis");
    }

    const start = Math.max(1, current - 1);
    const end = Math.min(total - 2, current + 1);

    for (let i = start; i <= end; i++) {
        pages.push(i);
    }

    if (current < total - 3) {
        pages.push("ellipsis");
    }

    pages.push(total - 1);
    return pages;
}

export const TrackingOrderTable: React.FC<TrackingOrderTableProps> = ({
    orders,
    isLoading,
    onSelectOrder,
    page,
    pageSize,
    totalPages,
    totalCount,
    onPageChange,
    sortBy,
    sortOrder,
    onSort,
}) => {
    const getStageBadge = (stage: string) => {
        switch (stage) {
            case "Fully Picked":
                return (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 font-bold px-2 py-0.5">
                        Fully Picked
                    </Badge>
                );
            case "In Picking":
                return (
                    <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-300 font-semibold px-2 py-0.5">
                        In Picking
                    </Badge>
                );
            case "Ready for Picking":
                return (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-300 font-semibold px-2 py-0.5">
                        Ready for Picking
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 font-semibold px-2 py-0.5">
                        Awaiting Allocation
                    </Badge>
                );
        }
    };

    const renderSortHeader = (
        label: string,
        columnKey: string,
        tooltip: string,
        extraThClass = ""
    ) => {
        const isSorted = sortBy === columnKey;
        return (
            <th
                className={`p-3 select-none whitespace-nowrap ${extraThClass}`}
                title={`${tooltip} (Click to sort ${isSorted && sortOrder === "asc" ? "descending" : "ascending"})`}
            >
                <button
                    type="button"
                    onClick={() => onSort?.(columnKey)}
                    className={`group/btn inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-foreground text-left focus:outline-none ${
                        isSorted ? "text-primary" : "text-muted-foreground"
                    }`}
                >
                    <span>{label}</span>
                    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {isSorted ? (
                            sortOrder === "desc" ? (
                                <ArrowDown className="w-3.5 h-3.5 text-primary" />
                            ) : (
                                <ArrowUp className="w-3.5 h-3.5 text-primary" />
                            )
                        ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/40 group-hover/btn:text-foreground group-hover/btn:opacity-100 transition-opacity" />
                        )}
                    </span>
                </button>
            </th>
        );
    };

    if (isLoading && orders.length === 0) {
        return (
            <div className="border rounded-xl bg-card p-12 text-center shadow-sm">
                <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-3 animate-pulse">
                    <Layers className="w-6 h-6 animate-spin" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Loading tracking records...</h3>
                <p className="text-xs text-muted-foreground mt-1">Cross-referencing reservations and consolidation batches</p>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="border rounded-xl bg-card p-12 text-center shadow-sm">
                <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground mb-3">
                    <Boxes className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">No tracking records found</h3>
                <p className="text-xs text-muted-foreground mt-1">
                    Try adjusting your branch selection, search terms, or status filters.
                </p>
            </div>
        );
    }

    return (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm flex flex-col">
            {/* Top Loading Progress Line */}
            <div className="h-0.5 w-full bg-transparent overflow-hidden relative">
                {isLoading && (
                    <motion.div
                        className="h-full bg-primary"
                        initial={{ x: "-100%", width: "45%" }}
                        animate={{ x: "250%" }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                    />
                )}
            </div>

            <div className="overflow-x-auto relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-background/25 backdrop-blur-[0.5px] z-10 flex items-center justify-center pointer-events-none transition-opacity">
                        <div className="bg-background/95 border shadow-md rounded-full px-3 py-1 flex items-center gap-2 text-xs font-medium text-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            <span>Updating orders...</span>
                        </div>
                    </div>
                )}
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                            {renderSortHeader("Order & PO", "order_no", "Sales Order Number and Customer PO Reference", "w-[150px] min-w-[150px] pl-4")}
                            {renderSortHeader("Customer", "customer_name", "Customer Name and Account Code", "w-[170px] min-w-[170px]")}
                            {renderSortHeader("Branch", "branch_name", "Originating Branch or Location", "w-[130px] min-w-[130px]")}
                            {renderSortHeader("Dates", "order_date", "Order Date and Requested Delivery Date", "w-[125px] min-w-[125px]")}
                            {renderSortHeader("Ordered Qty", "total_ordered_quantity", "Total Ordered Quantity across all items in this order", "w-[115px] min-w-[115px]")}
                            {renderSortHeader("Consolidated vs Ordered", "physical_consolidation_rate", "Progress of physical picks and approved consolidation towards ordered quantity", "w-[200px] min-w-[200px]")}
                            {renderSortHeader("Ordered vs Serve Qty", "invoiced_served_rate", "Comparison of invoiced order quantity against physically served quantity", "w-[200px] min-w-[200px]")}
                            {renderSortHeader("Fulfillment Stage", "stage", "Current warehouse fulfillment workflow stage", "w-[135px] min-w-[135px]")}
                            <th className="p-3 w-[130px] min-w-[130px] whitespace-nowrap" title="Operational alerts and audit discrepancies for this order">Exceptions</th>
                            <th className="p-3 pr-4 text-right w-[110px] min-w-[110px] whitespace-nowrap" title="View detailed order tracking and batch audit breakdown">Actions</th>
                        </tr>
                    </thead>
                    <tbody
                        key={`page-${page}`}
                        className={`divide-y divide-border transition-opacity duration-150 ${
                            isLoading ? "opacity-60" : "opacity-100"
                        }`}
                    >
                        <AnimatePresence initial={false}>
                            {orders.map((order, idx) => {
                                const hasAnyException =
                                    order.exceptions.has_discrepancy ||
                                    order.exceptions.has_inconsistent_pick ||
                                    order.exceptions.has_excess_allocation ||
                                    order.exceptions.has_excess_consolidation ||
                                    order.exceptions.has_missing_reservations ||
                                    order.exceptions.has_zero_quantity ||
                                    Boolean(order.exceptions.has_substituted_lot) ||
                                    Boolean(order.exceptions.has_added_lot);

                                return (
                                    <motion.tr
                                        key={order.order_id}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.2) }}
                                        className="hover:bg-muted/30 transition-colors group"
                                    >
                                        {/* 1. Order & PO */}
                                        <td className="p-3 pl-4">
                                            <div className="font-bold text-foreground flex items-center gap-1.5" title={`Sales Order: ${order.order_no || "-"}`}>
                                                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                                                <span>{order.order_no || "-"}</span>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground mt-0.5" title={`Customer PO: ${order.po_no || "N/A"}`}>
                                                PO: {order.po_no && order.po_no !== "N/A" ? order.po_no : "-"}
                                            </div>
                                        </td>

                                        {/* 2. Customer */}
                                        <td className="p-3">
                                            <div className="font-medium text-foreground max-w-[180px] truncate" title={order.customer_name}>
                                                {order.customer_name || "-"}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground" title={`Customer Code: ${order.customer_code || "-"}`}>
                                                {order.customer_code || "-"}
                                            </div>
                                        </td>

                                        {/* 3. Branch */}
                                        <td className="p-3">
                                            <div className="flex items-center gap-1 text-muted-foreground" title={`Branch: ${order.branch_name || "-"}`}>
                                                <Building2 className="w-3 h-3 shrink-0" />
                                                <span className="truncate max-w-[120px]">{order.branch_name || "-"}</span>
                                            </div>
                                        </td>

                                        {/* 4. Dates */}
                                        <td className="p-3">
                                            <div className="flex items-center gap-1 text-muted-foreground text-[11px]" title={`Order Date: ${order.order_date ? new Date(order.order_date).toLocaleDateString() : "-"}`}>
                                                <Calendar className="w-3 h-3 shrink-0" />
                                                <span>{order.order_date ? new Date(order.order_date).toLocaleDateString() : "-"}</span>
                                            </div>
                                            {order.delivery_date && (
                                                <div className="text-[10px] text-muted-foreground mt-0.5" title={`Delivery Date: ${new Date(order.delivery_date).toLocaleDateString()}`}>
                                                    Del: {new Date(order.delivery_date).toLocaleDateString()}
                                                </div>
                                            )}
                                        </td>

                                        {/* 5. Ordered Qty */}
                                        <td className="p-3 text-left">
                                            <div className="font-bold text-foreground text-sm" title={`Total Ordered: ${order.total_ordered_quantity.toLocaleString()} ${order.uom_summary}`}>
                                                {order.total_ordered_quantity.toLocaleString()}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground" title={`${order.line_count} line items in this order`}>
                                                {order.uom_summary} ({order.line_count} lines)
                                            </div>
                                        </td>
 

                                        {/* 7. Consolidated vs Ordered */}
                                        <td className="p-3" title={`Physical Picked: ${order.total_physical_picked_quantity.toLocaleString()} (${order.physical_consolidation_rate.toFixed(1)}%) | Approved Plan: ${order.total_planned_applied_quantity.toLocaleString()} | Remaining: ${order.total_remaining_to_consolidate.toLocaleString()}`}>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                                                        <span>Pick: {order.total_physical_picked_quantity.toLocaleString()}</span>
                                                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-normal">
                                                             (App: {order.total_planned_applied_quantity.toLocaleString()})
                                                        </span>
                                                    </span>
                                                    <span className="text-muted-foreground font-medium">
                                                        {order.physical_consolidation_rate.toFixed(1)}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden relative">
                                                    <div
                                                        className="bg-purple-300 dark:bg-purple-900/60 h-1.5 absolute top-0 left-0"
                                                        style={{ width: `${Math.min(100, order.planned_consolidation_rate)}%` }}
                                                    />
                                                    <div
                                                        className="bg-indigo-600 h-1.5 absolute top-0 left-0"
                                                        style={{ width: `${Math.min(100, order.physical_consolidation_rate)}%` }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                                    <span>Rem: {order.total_remaining_to_consolidate.toLocaleString()}</span>
                                                    <span className="text-purple-600 dark:text-purple-400 flex items-center gap-0.5" title={`Planned Consolidation Rate: ${order.planned_consolidation_rate.toFixed(0)}%`}>
                                                        <TrendingUp className="w-2.5 h-2.5" /> {order.planned_consolidation_rate.toFixed(0)}% plan
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Invoiced Order vs Serve Qty */}
                                        <td
                                            className="p-3"
                                            title={
                                                order.total_invoiced_quantity > 0
                                                    ? `Served: ${order.total_served_quantity.toLocaleString()} (${order.invoiced_served_rate.toFixed(1)}%) | Invoiced: ${order.total_invoiced_quantity.toLocaleString()} | Remaining: ${Math.max(0, order.total_invoiced_quantity - order.total_served_quantity).toLocaleString()}`
                                                    : `Served: ${order.total_served_quantity.toLocaleString()} | Invoiced: - (No active invoice)`
                                            }
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                                        <span>Serve: {order.total_served_quantity.toLocaleString()}</span>
                                                        {order.total_invoiced_quantity > 0 ? (
                                                            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-normal">
                                                                (Inv: {order.total_invoiced_quantity.toLocaleString()})
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-muted-foreground font-normal">
                                                                (Inv: -)
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="text-muted-foreground font-medium">
                                                        {order.total_invoiced_quantity > 0
                                                            ? `${order.invoiced_served_rate.toFixed(1)}%`
                                                            : "-"}
                                                    </span>
                                                </div>
                                                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden relative">
                                                    <div
                                                        className={`h-1.5 rounded-full transition-all ${
                                                            order.total_invoiced_quantity > 0 && order.invoiced_served_rate >= 100
                                                                ? "bg-emerald-500"
                                                                : "bg-teal-600"
                                                        }`}
                                                        style={{
                                                            width: `${order.total_invoiced_quantity > 0 ? Math.min(100, order.invoiced_served_rate) : 0}%`,
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                                    <span>
                                                        Rem:{" "}
                                                        {order.total_invoiced_quantity > 0
                                                            ? Math.max(0, order.total_invoiced_quantity - order.total_served_quantity).toLocaleString()
                                                            : "-"}
                                                    </span>
                                                    <span
                                                        className="text-sky-600 dark:text-sky-400 flex items-center gap-0.5"
                                                        title={
                                                            order.invoice_count > 0
                                                                ? `Linked Invoices: ${order.invoice_numbers?.join(", ") || order.invoice_count}`
                                                                : "No active sales invoice"
                                                        }
                                                    >
                                                        {order.invoice_count > 0 ? `${order.invoice_count} Inv` : "No Invoice"}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Fulfillment Stage */}
                                        <td className="p-3" title={`Fulfillment Stage: ${order.stage}`}>
                                            <div className="flex flex-col gap-1 items-start">
                                                {getStageBadge(order.stage)}
                                                 
                                            </div>
                                        </td>

                                        {/* 9. Exceptions */}
                                        <td className="p-3">
                                            {!hasAnyException ? (
                                                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200" title="No discrepancies or exceptions found for this order">
                                                    Clean
                                                </Badge>
                                            ) : (
                                                <div className="flex flex-wrap gap-1 max-w-[150px]">
                                                    {order.exceptions.has_added_lot && (
                                                        <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-300" title="Additional lot added during picking">
                                                            Added Lot
                                                        </Badge>
                                                    )}
                                                    {order.exceptions.has_substituted_lot && (
                                                        <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-300" title="Warehouse staff picked from an alternative lot during picking">
                                                            Substituted Lot
                                                        </Badge>
                                                    )}
                                                    {order.exceptions.has_discrepancy && (
                                                        <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300" title="Allocation discrepancy between stored total and lot rows">
                                                            Discrepancy
                                                        </Badge>
                                                    )}
                                                    {order.exceptions.has_inconsistent_pick && (
                                                        <Badge variant="outline" className="text-[9px] bg-red-50 text-red-700 border-red-300" title="Physical picked quantity does not match consolidation batch record">
                                                            Inconsistent Pick
                                                        </Badge>
                                                    )}
                                                    {order.exceptions.has_excess_allocation && (
                                                        <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-300" title="Allocated quantity exceeds ordered quantity (Over-allocation)">
                                                            Over-Alloc
                                                        </Badge>
                                                    )}
                                                    {order.exceptions.has_excess_consolidation && (
                                                        <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-300" title="Consolidated quantity exceeds ordered quantity (Over-consolidation)">
                                                            Over-Consol
                                                        </Badge>
                                                    )}
                                                    {order.exceptions.has_missing_reservations && (
                                                        <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300" title="No lot reservations recorded for one or more lines">
                                                            Missing Resv
                                                        </Badge>
                                                    )}
                                                    {order.exceptions.has_zero_quantity && (
                                                        <Badge variant="outline" className="text-[9px] bg-gray-50 text-gray-700 border-gray-300" title="One or more line items have zero ordered quantity">
                                                            Zero Qty
                                                        </Badge>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* 10. Actions */}
                                        <td className="p-3 pr-4 text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onSelectOrder(order)}
                                                title="View order lines, lot reservations, and consolidation batches"
                                                className="h-8 px-2.5 text-xs font-semibold flex items-center gap-1 rounded-lg"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                <span>View Lines</span>
                                            </Button>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-muted/20 border-t text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <span>
                            Showing <span className="font-semibold text-foreground">{(page * pageSize) + 1}</span> to{" "}
                            <span className="font-semibold text-foreground">{Math.min(totalCount, (page + 1) * pageSize)}</span> of{" "}
                            <span className="font-semibold text-foreground">{totalCount}</span> orders
                        </span>
                        {isLoading && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-primary animate-pulse ml-2 font-medium">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Updating page...
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            disabled={page === 0 || isLoading}
                            onClick={() => onPageChange(0)}
                            className="h-8 w-8 text-xs"
                            title="First Page"
                        >
                            <ChevronsLeft className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 0 || isLoading}
                            onClick={() => onPageChange(page - 1)}
                            className="h-8 px-2.5 text-xs flex items-center gap-1"
                            title="Previous Page"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Prev</span>
                        </Button>

                        <div className="flex items-center gap-1 mx-1">
                            {getVisiblePages(page, totalPages).map((p, pIdx) => {
                                if (p === "ellipsis") {
                                    return (
                                        <span key={`ellipsis-${pIdx}`} className="px-1 text-muted-foreground select-none">
                                            ...
                                        </span>
                                    );
                                }
                                const isCurrent = p === page;
                                return (
                                    <Button
                                        key={`page-btn-${p}`}
                                        variant={isCurrent ? "default" : "outline"}
                                        size="icon"
                                        disabled={isLoading}
                                        onClick={() => onPageChange(p)}
                                        className={`h-8 w-8 text-xs transition-all ${
                                            isCurrent
                                                ? "font-bold shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {p + 1}
                                    </Button>
                                );
                            })}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages - 1 || isLoading}
                            onClick={() => onPageChange(page + 1)}
                            className="h-8 px-2.5 text-xs flex items-center gap-1"
                            title="Next Page"
                        >
                            <span className="hidden sm:inline">Next</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            disabled={page >= totalPages - 1 || isLoading}
                            onClick={() => onPageChange(totalPages - 1)}
                            className="h-8 w-8 text-xs"
                            title="Last Page"
                        >
                            <ChevronsRight className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
