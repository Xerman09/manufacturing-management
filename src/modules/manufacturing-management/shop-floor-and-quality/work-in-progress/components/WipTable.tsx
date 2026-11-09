"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
    AlertTriangle,
    ArrowUpDown,
    CheckCircle2,
    Clock,
    Eye,
    Factory,
    Layers,
    RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WipMaterialItem } from "../types";
import { formatQty } from "../utils/wip-calculations";

interface WipTableProps {
    items: WipMaterialItem[];
    loading?: boolean;
    onViewDetail: (item: WipMaterialItem) => void;
}

type SortField =
    | "jobOrderNo"
    | "materialName"
    | "branchName"
    | "reservedQuantity"
    | "issuedQuantity"
    | "consumedQuantity"
    | "returnedQuantity"
    | "remainingWipQuantity"
    | "jobOrderStatus";

function getStatusBadge(status?: string, hasDiscrepancy?: boolean) {
    const s = (status || "").trim().toLowerCase();

    let badgeClass = "bg-muted text-muted-foreground border-border";
    let icon = <Clock className="h-3 w-3" />;
    let label = status || "-";

    if (s === "draft") {
        badgeClass = "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700";
        icon = <Clock className="h-3 w-3" />;
        label = "Draft";
    } else if (s === "for picking" || s === "released" || s === "proceed") {
        badgeClass = "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800";
        icon = <Layers className="h-3 w-3" />;
        label = "For Picking";
    } else if (s === "picked" || s === "reserved") {
        badgeClass = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800";
        icon = <CheckCircle2 className="h-3 w-3" />;
        label = "Picked";
    } else if (s === "in production" || s === "ongoing" || s === "in progress") {
        badgeClass = "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800";
        icon = <Factory className="h-3 w-3" />;
        label = "In Production";
    } else if (s === "production completed" || s === "finished") {
        badgeClass = "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800";
        icon = <CheckCircle2 className="h-3 w-3" />;
        label = "Production Completed";
    } else if (s === "for qa and reconciliation" || s === "for qa & reconciliation" || s === "qa & reconciliation") {
        badgeClass = "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800";
        icon = <RotateCcw className="h-3 w-3" />;
        label = "For QA & Reconciliation";
    } else if (s === "on hold") {
        badgeClass = "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800";
        icon = <AlertTriangle className="h-3 w-3" />;
        label = "On Hold";
    } else if (s === "qa hold") {
        badgeClass = "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800";
        icon = <AlertTriangle className="h-3 w-3" />;
        label = "QA Hold";
    } else if (s === "closed" || s === "completed") {
        badgeClass = "bg-muted text-muted-foreground border-border";
        icon = <CheckCircle2 className="h-3 w-3" />;
        label = "Closed";
    } else if (s === "cancelled") {
        badgeClass = "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800";
        icon = <AlertTriangle className="h-3 w-3" />;
        label = "Cancelled";
    }

    return (
        <div className="flex flex-col items-center gap-1">
            <Badge
                variant="outline"
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold border ${badgeClass}`}
            >
                {icon}
                <span>{label}</span>
            </Badge>
            {hasDiscrepancy && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Discrepancy
                </span>
            )}
        </div>
    );
}

export default function WipTable({ items, loading = false, onViewDetail }: WipTableProps) {
    const [sortField, setSortField] = useState<SortField>("jobOrderNo");
    const [sortAsc, setSortAsc] = useState(true);
    const [page, setPage] = useState(1);
    const pageSize = 15;

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(true);
        }
    };

    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            const valA: string | number = a[sortField];
            const valB: string | number = b[sortField];

            if (typeof valA === "string") {
                const cmp = valA.localeCompare(String(valB));
                return sortAsc ? cmp : -cmp;
            }

            const numA = Number(valA) || 0;
            const numB = Number(valB) || 0;
            return sortAsc ? numA - numB : numB - numA;
        });
    }, [items, sortField, sortAsc]);

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(sortedItems.length / pageSize));
    }, [sortedItems.length, pageSize]);

    const paginatedItems = useMemo(() => {
        return sortedItems.slice((page - 1) * pageSize, page * pageSize);
    }, [sortedItems, page, pageSize]);

    if (loading) {
        return (
            <div className="rounded-xl border bg-card p-8 text-center shadow-xs">
                <div className="mx-auto flex max-w-sm flex-col items-center justify-center space-y-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-sm font-medium text-foreground">Loading Work In Progress inventory...</p>
                    <p className="text-xs text-muted-foreground">Reconciling reservations, floor staging, and shift consumptions</p>
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-dashed bg-card/60 p-12 text-center shadow-xs"
            >
                <div className="mx-auto flex max-w-sm flex-col items-center justify-center space-y-3">
                    <div className="p-3 rounded-full bg-muted text-muted-foreground">
                        <Layers className="h-6 w-6" />
                    </div>
                    <p className="text-base font-semibold text-foreground">No WIP Records Found</p>
                    <p className="text-xs text-muted-foreground">
                        No materials matching the selected filters are currently active in production or reservations.
                    </p>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-separate border-spacing-0">
                    <thead className="bg-muted/60 text-[11px] font-semibold text-muted-foreground border-b uppercase tracking-wider">
                        <tr>
                            <th className="py-3 px-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("jobOrderNo")}>
                                <div className="flex items-center gap-1">
                                    <span>Job Order</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("materialName")}>
                                <div className="flex items-center gap-1">
                                    <span>Material / Component</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-2">UOM</th>
                            <th className="py-3 px-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("branchName")}>
                                <div className="flex items-center gap-1">
                                    <span>Branch</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-3 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("reservedQuantity")}>
                                <div className="flex items-center justify-end gap-1">
                                    <span>Reserved</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-3 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("issuedQuantity")}>
                                <div className="flex items-center justify-end gap-1">
                                    <span>Issued (WIP In)</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-3 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("consumedQuantity")}>
                                <div className="flex items-center justify-end gap-1">
                                    <span>Consumed</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-3 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("returnedQuantity")}>
                                <div className="flex items-center justify-end gap-1">
                                    <span>Returned</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-3 text-right">Loss / Scrap</th>
                            <th className="py-3 px-3 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("remainingWipQuantity")}>
                                <div className="flex items-center justify-end gap-1">
                                    <span className="font-bold text-foreground">Floor Remaining</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-3 text-center cursor-pointer hover:text-foreground" onClick={() => handleSort("jobOrderStatus")}>
                                <div className="flex items-center justify-center gap-1">
                                    <span>Status</span>
                                    <ArrowUpDown className="h-3 w-3" />
                                </div>
                            </th>
                            <th className="py-3 px-3 text-center">Action</th>
                        </tr>
                    </thead>
                    <motion.tbody
                        key={`${sortField}-${sortAsc}-${page}`}
                        initial={{ opacity: 0.35 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="divide-y divide-border"
                    >
                        {paginatedItems.map((item) => {
                            const isNegative = item.remainingWipQuantity < 0;
                            return (
                                <tr
                                    key={item.id}
                                    className={`hover:bg-muted/40 transition-colors border-b border-border/50 ${
                                        isNegative ? "bg-rose-500/5 dark:bg-rose-950/20" : ""
                                    }`}
                                >
                                    {/* Job Order */}
                                    <td className="py-2.5 px-3">
                                        <div className="font-semibold text-foreground">{item.jobOrderNo || "-"}</div>
                                        <div className="text-[11px] text-muted-foreground truncate max-w-[180px]" title={item.targetProductDescription || item.targetProductName}>
                                            {item.targetProductDescription || item.targetProductName || "-"}
                                        </div>
                                    </td>

                                    {/* Material */}
                                    <td className="py-2.5 px-3">
                                        <div className="font-medium text-foreground">{item.materialName || "-"}</div>
                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                            <span>{item.materialCode || "-"}</span>
                                        </div>
                                        {item.lots.length > 0 && (
                                            <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                                                {item.lots.length} {item.lots.length === 1 ? "batch lot" : "batch lots"}
                                            </div>
                                        )}
                                    </td>

                                    {/* UOM */}
                                    <td className="py-2.5 px-2 text-muted-foreground">
                                        {item.uomShortcut || "-"}
                                    </td>

                                    {/* Branch */}
                                    <td className="py-2.5 px-3 text-muted-foreground">
                                        {item.branchName || "-"}
                                    </td>

                                    {/* Reserved */}
                                    <td className="py-2.5 px-3 text-right font-mono text-amber-600 dark:text-amber-400">
                                        {formatQty(item.reservedQuantity)}
                                    </td>

                                    {/* Issued */}
                                    <td className="py-2.5 px-3 text-right font-mono font-medium text-indigo-600 dark:text-indigo-400">
                                        {formatQty(item.issuedQuantity)}
                                    </td>

                                    {/* Consumed */}
                                    <td className="py-2.5 px-3 text-right font-mono text-foreground">
                                        {formatQty(item.consumedQuantity)}
                                    </td>

                                    {/* Returned */}
                                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                                        {formatQty(item.returnedQuantity)}
                                    </td>

                                    {/* Losses */}
                                    <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                                        {formatQty(item.lossQuantity)}
                                    </td>

                                    {/* Remaining Floor WIP */}
                                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                                        <span
                                            className={`px-2 py-0.5 rounded ${
                                                isNegative
                                                    ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/30"
                                                    : item.remainingWipQuantity > 0
                                                    ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                                                    : "text-muted-foreground"
                                            }`}
                                        >
                                            {formatQty(item.remainingWipQuantity)}
                                        </span>
                                    </td>

                                    {/* Status */}
                                    <td className="py-2.5 px-3 text-center">
                                        {getStatusBadge(item.jobOrderStatus, item.hasDiscrepancy)}
                                    </td>

                                    {/* Action */}
                                    <td className="py-2.5 px-3 text-center">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onViewDetail(item)}
                                            className="h-7 text-xs gap-1 px-2.5 hover:bg-primary/10 hover:text-primary"
                                            title="View supporting batch lots, shift logs, and movements"
                                        >
                                            <Eye className="h-3.5 w-3.5" />
                                            <span>Audit</span>
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </motion.tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
                    <div>
                        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, sortedItems.length)} of {sortedItems.length} items
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={page === 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="h-7 px-2.5 text-xs"
                        >
                            Previous
                        </Button>
                        <span className="px-2 font-medium">
                            {page} / {totalPages}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={page === totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="h-7 px-2.5 text-xs"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
