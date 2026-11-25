"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    ArrowUpDown,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ChevronUp,
    ExternalLink,
    Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { JOB_ORDER_STATUS } from "../../job-order-status";
import type { QIJobOrderRow } from "../types";

interface JobOrderTableProps {
    jobOrders: QIJobOrderRow[];
    onSelectJobOrder: (jobOrderId: number) => void;
}

type SortKey = keyof QIJobOrderRow;

export const JobOrderTable: React.FC<JobOrderTableProps> = ({
    jobOrders,
    onSelectJobOrder
}) => {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sortKey, setSortKey] = useState<SortKey>("startDate");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortOrder("desc");
        }
    };

    const filteredRows = useMemo(() => {
        let list = [...jobOrders];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(
                (j) =>
                    j.jobOrderNo.toLowerCase().includes(q) ||
                    j.productName.toLowerCase().includes(q) ||
                    j.status.toLowerCase().includes(q) ||
                    (j.workCenterName && j.workCenterName.toLowerCase().includes(q))
            );
        }

        list.sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];

            if (valA === null || valA === undefined) return sortOrder === "asc" ? 1 : -1;
            if (valB === null || valB === undefined) return sortOrder === "asc" ? -1 : 1;

            if (typeof valA === "number" && typeof valB === "number") {
                return sortOrder === "asc" ? valA - valB : valB - valA;
            }

            return sortOrder === "asc"
                ? String(valA).localeCompare(String(valB))
                : String(valB).localeCompare(String(valA));
        });

        return list;
    }, [jobOrders, search, sortKey, sortOrder]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const paginatedRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredRows.slice(start, start + pageSize);
    }, [filteredRows, page, pageSize]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case JOB_ORDER_STATUS.CLOSED:
                return (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                        {status}
                    </Badge>
                );
            case JOB_ORDER_STATUS.PICKED:
            case JOB_ORDER_STATUS.IN_PRODUCTION:
                return (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                        {status}
                    </Badge>
                );
            case JOB_ORDER_STATUS.FOR_PICKING:
            case JOB_ORDER_STATUS.PRODUCTION_COMPLETED:
            case JOB_ORDER_STATUS.FOR_QA_RECONCILIATION:
            case JOB_ORDER_STATUS.ON_HOLD:
            case JOB_ORDER_STATUS.QA_HOLD:
                return (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                        {status}
                    </Badge>
                );
            case JOB_ORDER_STATUS.CANCELLED:
                return (
                    <Badge variant="destructive" className="text-[10px]">
                        {status}
                    </Badge>
                );
            default:
                return (
                    <Badge variant="secondary" className="text-[10px]">
                        {status}
                    </Badge>
                );
        }
    };

    const renderSortHeader = (label: string, key: SortKey, titleText: string) => {
        const isCurrent = sortKey === key;
        return (
            <TableHead
                title={titleText}
                onClick={() => handleSort(key)}
                className="cursor-pointer hover:bg-muted/50 transition-colors select-none text-xs"
            >
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    {isCurrent ? (
                        sortOrder === "asc" ? (
                            <ChevronUp className="h-3 w-3 text-primary" />
                        ) : (
                            <ChevronDown className="h-3 w-3 text-primary" />
                        )
                    ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                    )}
                </div>
            </TableHead>
        );
    };

    return (
        <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <CardTitle className="text-base font-bold">
                        Job Orders Production & Quality Ledger
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Showing {filteredRows.length} batches evaluated. Click any row to view shift yield, BOM variance, and QA results.
                    </p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search JO # or Product..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className="h-8 pl-8 text-xs bg-background"
                    />
                </div>
            </CardHeader>

            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30">
                                {renderSortHeader("JO Number", "jobOrderNo", "Job Order Document Number")}
                                {renderSortHeader("Product Name", "productName", "Finished Good being produced")}
                                {renderSortHeader("Status", "status", "Current lifecycle status")}
                                {renderSortHeader("Start Date", "startDate", "Scheduled start date")}
                                {renderSortHeader("Target Qty", "targetQty", "Target production quantity")}
                                {renderSortHeader("Actual Qty", "actualQtyProduced", "Finished quantity received in stock")}
                                {renderSortHeader("Yield %", "yieldRatePct", "Completed output vs target planned")}
                                {renderSortHeader("Scrap %", "scrapRatePct", "Scrap quantity relative to yield")}
                                {renderSortHeader("QA Pass %", "qaPassRatePct", "Quality inspection parameter pass percentage")}
                                {renderSortHeader("Cycle Time", "cycleTimeHrs", "Production completion duration in hours")}
                                <TableHead title="View Job Order Details" className="w-12 text-center">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={11} className="h-32 text-center text-xs text-muted-foreground">
                                        No job orders match your criteria.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedRows.map((row, idx) => (
                                    <motion.tr
                                        key={row.jobOrderId}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.15, delay: idx * 0.02 }}
                                        onClick={() => onSelectJobOrder(row.jobOrderId)}
                                        className="group cursor-pointer hover:bg-muted/40 transition-colors border-b"
                                    >
                                        <TableCell className="font-bold text-xs py-2.5">
                                            {row.jobOrderNo}
                                        </TableCell>
                                        <TableCell className="text-xs py-2.5 max-w-[180px] truncate">
                                            {row.productName}
                                        </TableCell>
                                        <TableCell className="py-2.5">
                                            {getStatusBadge(row.status)}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground py-2.5">
                                            {row.startDate || "-"}
                                        </TableCell>
                                        <TableCell className="text-xs font-medium py-2.5">
                                            {row.targetQty.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-xs font-medium py-2.5">
                                            {row.actualQtyProduced !== null
                                                ? row.actualQtyProduced.toLocaleString()
                                                : "-"}
                                        </TableCell>
                                        <TableCell className="text-xs py-2.5">
                                            {row.yieldRatePct !== null ? (
                                                <span
                                                    className={`font-semibold ${
                                                        row.yieldRatePct >= 95
                                                            ? "text-emerald-600 dark:text-emerald-400"
                                                            : row.yieldRatePct >= 85
                                                            ? "text-amber-600 dark:text-amber-400"
                                                            : "text-rose-600 dark:text-rose-400"
                                                    }`}
                                                >
                                                    {row.yieldRatePct}%
                                                </span>
                                            ) : (
                                                "-"
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs py-2.5">
                                            {row.scrapRatePct !== null ? (
                                                <span
                                                    className={`font-semibold ${
                                                        row.scrapRatePct <= 2
                                                            ? "text-emerald-600 dark:text-emerald-400"
                                                            : row.scrapRatePct <= 5
                                                            ? "text-amber-600 dark:text-amber-400"
                                                            : "text-rose-600 dark:text-rose-400"
                                                    }`}
                                                >
                                                    {row.scrapRatePct}%
                                                </span>
                                            ) : (
                                                "-"
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs py-2.5">
                                            {row.qaPassRatePct !== null ? (
                                                <span
                                                    className={`font-semibold ${
                                                        row.qaPassRatePct >= 95
                                                            ? "text-emerald-600 dark:text-emerald-400"
                                                            : "text-amber-600 dark:text-amber-400"
                                                    }`}
                                                >
                                                    {row.qaPassRatePct}%
                                                </span>
                                            ) : (
                                                "-"
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs py-2.5 text-muted-foreground">
                                            {row.cycleTimeHrs !== null ? `${row.cycleTimeHrs} hrs` : "-"}
                                        </TableCell>
                                        <TableCell className="text-center py-2.5">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 opacity-70 group-hover:opacity-100"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectJobOrder(row.jobOrderId);
                                                }}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                            </Button>
                                        </TableCell>
                                    </motion.tr>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span>Rows per page:</span>
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                            }}
                            className="h-7 px-2 text-xs rounded-md border border-border bg-background"
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                        <span>
                            Showing {(page - 1) * pageSize + 1} -{" "}
                            {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}
                        </span>
                    </div>

                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPage(1)}
                            disabled={page <= 1}
                            className="h-7 w-7"
                        >
                            <ChevronsLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="h-7 w-7"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <span className="px-2 font-medium">
                            {page} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="h-7 w-7"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPage(totalPages)}
                            disabled={page >= totalPages}
                            className="h-7 w-7"
                        >
                            <ChevronsRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
