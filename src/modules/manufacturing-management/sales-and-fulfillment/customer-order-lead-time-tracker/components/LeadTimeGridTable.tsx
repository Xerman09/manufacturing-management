"use client";

import { inversionDetails } from "../utils/inversions";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { AssessmentBadge } from "./AssessmentBadge";

import React from "react";
import {
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Eye,
    TrendingDown,
} from "lucide-react";
import { CustomerOrderLeadTimeItem } from "../types";
import { Button } from "@/components/ui/button";

interface LeadTimeGridTableProps {
    orders: CustomerOrderLeadTimeItem[];
    isLoading: boolean;
    error: string | null;
    page: number;
    pageSize: number;
    totalOrders: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onViewTimeline: (order: CustomerOrderLeadTimeItem, targetPair?: string) => void;
    onRetry: () => void;
}

export function LeadTimeGridTable({
    orders,
    isLoading,
    error,
    page,
    pageSize,
    totalOrders,
    onPageChange,
    onPageSizeChange,
    onViewTimeline,
    onRetry,
}: LeadTimeGridTableProps) {
    const totalPages = Math.ceil(totalOrders / pageSize) || 1;

    const renderReportingBadge = (status: string) => {
        switch (status) {
            case "Completed":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Completed
                    </span>
                );
            case "Open":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                        <Clock className="w-3 h-3" />
                        Open (In-Flight)
                    </span>
                );
            case "Missing Milestone":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <AlertTriangle className="w-3 h-3" />
                        Missing Milestone
                    </span>
                );
            case "Cancelled":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                        Cancelled
                    </span>
                );
            default:
                return (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="bg-card text-card-foreground border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
            {/* Table Container */}
            <div className="overflow-x-auto min-h-[360px]">
                <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                        <tr>
                            <th className="py-3 px-4">Order / PO</th>
                            <th className="py-3 px-4">Customer</th>
                            <th className="py-3 px-4">Branch</th>
                            <th className="py-3 px-4">Created Date</th>
                            <th className="py-3 px-4">Current Stage</th>
                            <th className="py-3 px-4">Total Lead Time / Age</th>
                            <th className="py-3 px-4">Delivery Status</th>
                            <th className="py-3 px-4">Anomalies</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-foreground">
                        {isLoading ? (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        <span>Calculating order lifecycle durations...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-destructive">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <AlertTriangle className="w-6 h-6" />
                                        <span>{error}</span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={onRetry}
                                            className="h-8 text-xs mt-1"
                                        >
                                            Retry
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                                    No customer orders found matching current criteria.
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => (
                                <tr
                                    key={order.orderId}
                                    className="hover:bg-muted/40 transition-colors"
                                >
                                    {/* Order / PO */}
                                    <td className="py-3 px-4">
                                        <div className="font-semibold text-foreground">
                                            {order.orderNo}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">{order.poNo || "No PO"}</div>
                                    </td>

                                    {/* Customer */}
                                    <td className="py-3 px-4">
                                        <div className="font-medium text-foreground max-w-[160px] truncate" title={order.customerName}>
                                            {order.customerName}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">{order.customerCode}</div>
                                    </td>

                                    {/* Branch */}
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <span className="text-foreground">
                                            {order.branchName}
                                        </span>
                                    </td>

                                    {/* Created Date */}
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <div>
                                            {order.creationTimestamp
                                                ? new Date(order.creationTimestamp).toLocaleDateString()
                                                : "—"}
                                        </div>
                                        {order.promisedDate && (
                                            <div className="text-[10px] text-muted-foreground">
                                                Promised: {new Date(order.promisedDate).toLocaleDateString()}
                                            </div>
                                        )}
                                    </td>

                                    {/* Current Stage */}
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground border border-border">
                                            {order.currentStageLabel}
                                        </span>
                                    </td>

                                    {/* Lead Time / Age */}
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        {order.reportingStatus === "Completed" ? (
                                            <div>
                                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                    {order.totalLeadTimeFormatted || "—"}
                                                </span>
                                                <span className="text-[10px] block text-muted-foreground">Total Lead Time</span>
                                            </div>
                                        ) : order.reportingStatus === "Open" ? (
                                            <div>
                                                <span className="font-bold text-amber-600 dark:text-amber-400">
                                                    {order.ongoingAgeFormatted || "—"}
                                                </span>
                                                <span className="text-[10px] block text-amber-600/80 dark:text-amber-400/80">
                                                    Ongoing In-Flight
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>

                                    {/* Delivery Status */}
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        {renderReportingBadge(order.reportingStatus)}
                                        {order.isPartialDelivery && (
                                            <div className="text-[10px] mt-0.5 font-medium text-purple-600 dark:text-purple-400">
                                                Partial Delivered
                                            </div>
                                        )}
                                    </td>

                                    {/* Anomalies */}
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-1 items-start">
                                            <AssessmentBadge assessment={order.assessment} />
                                            {inversionDetails(order).length > 0 && (
                                                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                                    <button type="button" onClick={() => onViewTimeline(order, inversionDetails(order)[0].key)} className="inline-flex items-center gap-1 rounded border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive focus-visible:outline-2 focus-visible:outline-ring">
                                                        <TrendingDown className="size-3" />Sequence Inverted ({inversionDetails(order).length})
                                                    </button>
                                                </TooltipTrigger><TooltipContent className="max-w-sm">{inversionDetails(order).map(pair => <p key={pair.key} className="mb-2">{pair.explanation} {pair.timestamps}</p>)}</TooltipContent></Tooltip></TooltipProvider>
                                            )}
                                            {order.hasMissingMilestones && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                                    {order.missingMilestonesList.length} Missing Event(s)
                                                </span>
                                            )}

                                        </div>
                                    </td>

                                    {/* Actions */}
                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onViewTimeline(order)}
                                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border-border bg-card text-foreground hover:bg-muted text-xs font-medium shadow-sm transition-all"
                                        >
                                            <Eye className="w-3.5 h-3.5 text-primary" />
                                            Timeline
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="bg-muted/30 border-t border-border px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            onPageSizeChange(Number(e.target.value));
                            onPageChange(1);
                        }}
                        className="px-2 py-1 rounded border border-input bg-background text-foreground"
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                    </select>
                    <span>
                        Page {page} of {totalPages} ({totalOrders} total)
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1 || isLoading}
                        className="h-8 w-8 rounded border-input bg-background hover:bg-muted disabled:opacity-40"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages || isLoading}
                        className="h-8 w-8 rounded border-input bg-background hover:bg-muted disabled:opacity-40"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
