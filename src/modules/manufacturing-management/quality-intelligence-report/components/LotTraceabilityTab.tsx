"use client";

import React, { useMemo, useState } from "react";
import {
    ArrowUpDown,
     
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ExternalLink,
     
    GitBranch,
    Search,
 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeFormatNumber } from "../utils/qualityMath";
import type { QualityLotTraceRow } from "../types";

interface LotTraceabilityTabProps {
    rows: QualityLotTraceRow[];
    onSelectJobOrder: (jobOrderId: number) => void;
}

type SortField =
    | "jobOrderNo"
    | "productName"
    | "finishedLotNumber"
    | "workCenterName"
    | "shiftName"
    | "producedQty"
    | "rejectedQty"
    | "defectRatePct"
    | "qaStatus";

export const LotTraceabilityTab: React.FC<LotTraceabilityTabProps> = ({
    rows,
    onSelectJobOrder
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortField, setSortField] = useState<SortField>("jobOrderNo");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Filtering
    const filteredRows = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return rows;
        return rows.filter((r) => {
            const matchesJo = r.jobOrderNo.toLowerCase().includes(q);
            const matchesSku =
                r.productName.toLowerCase().includes(q) || (r.productCode || "").toLowerCase().includes(q);
            const matchesLot =
                (r.finishedLotNumber || "").toLowerCase().includes(q) ||
                (r.finishedBatchNo || "").toLowerCase().includes(q);
            const matchesWc = (r.workCenterName || "").toLowerCase().includes(q);
            const matchesShift = (r.shiftName || "").toLowerCase().includes(q);
            const matchesComp = r.componentBatches.some((c) =>
                c.componentBatchNo.toLowerCase().includes(q) ||
                (c.componentLotName || "").toLowerCase().includes(q) ||
                c.componentProductName.toLowerCase().includes(q)
            );
            return matchesJo || matchesSku || matchesLot || matchesWc || matchesShift || matchesComp;
        });
    }, [rows, searchQuery]);

    // Sorting
    const sortedRows = useMemo(() => {
        return [...filteredRows].sort((a, b) => {
            let valA: any = a[sortField];
            let valB: any = b[sortField];

            if (valA === null || valA === undefined) valA = "";
            if (valB === null || valB === undefined) valB = "";

            if (typeof valA === "number" && typeof valB === "number") {
                return sortDirection === "asc" ? valA - valB : valB - valA;
            }

            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
        });
    }, [filteredRows, sortField, sortDirection]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedRows.slice(start, start + pageSize);
    }, [sortedRows, currentPage, pageSize]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
    };

    const renderSortHeader = (
        field: SortField,
        label: string,
        align: "left" | "right" | "center" = "left",
        widthClass = ""
    ) => {
        const isCurrent = sortField === field;
        return (
            <th
                className={`py-2.5 px-3 cursor-pointer select-none hover:text-foreground transition-colors ${
                    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
                } ${widthClass}`}
                onClick={() => handleSort(field)}
                title={`Sort by ${label} (${isCurrent ? (sortDirection === "asc" ? "Ascending" : "Descending") : "Click to sort"})`}
            >
                <div
                    className={`flex items-center gap-1 ${
                        align === "right"
                            ? "justify-end"
                            : align === "center"
                            ? "justify-center"
                            : "justify-start"
                    }`}
                >
                    <span>{label}</span>
                    {isCurrent ? (
                        sortDirection === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0" />
                        )
                    ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100 shrink-0" />
                    )}
                </div>
            </th>
        );
    };

    return (
        <Card className="rounded-2xl border-border/60 shadow-sm gap-0">
            <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-blue-500" />
                            Lot Traceability & Genealogy Matrix
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Trace finished product lots to component raw material batches, production shifts, and QA status
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Searchbar */}
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search by JO, SKU, lot, batch..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="h-8 pl-8 text-xs bg-background border-border/70 rounded-xl"
                            />
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="border border-border/70 rounded-xl overflow-hidden shadow-sm flex flex-col">
                    <div className="overflow-x-auto min-h-[480px]">
                        <table className="w-full min-w-[1100px] text-xs">
                            <thead className="bg-muted/40 border-b border-border/70 text-muted-foreground font-bold">
                                <tr>
                                    {renderSortHeader("jobOrderNo", "Job Order No", "left", "w-[150px]")}
                                    {renderSortHeader("productName", "Finished Product SKU", "left", "w-[220px]")}
                                    {renderSortHeader("finishedLotNumber", "Output Lot / Batch", "left", "w-[220px]")}
                                    
                                    {renderSortHeader("shiftName", "Shift", "left", "w-[100px]")}
                                    {renderSortHeader("producedQty", "Produced", "right", "w-[95px]")}
                                    {renderSortHeader("rejectedQty", "Defects", "right", "w-[90px]")}
                                    {renderSortHeader("qaStatus", "QA Status", "center", "w-[110px]")}
                                    <th className="py-2.5 px-3 text-left min-w-[180px]" title="Component raw material lots and batches used in this job order">
                                        Raw Material Component Genealogy
                                    </th>
                                    <th className="py-2.5 px-3 text-center w-[80px]" title="Genealogy and inspection actions">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {paginatedRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="h-64 text-center text-xs text-muted-foreground">
                                            No lot traceability records match your search query.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedRows.map((row) => (
                                        <tr
                                            key={row.jobOrderId}
                                            className="hover:bg-muted/20 transition-colors h-[48px]"
                                        >
                                            <td className="py-2 px-3 font-semibold text-foreground">
                                                {row.jobOrderNo}
                                            </td>
                                            <td className="py-2 px-3">
                                                <div className="font-medium text-foreground truncate max-w-[210px]" title={row.productName}>
                                                    {row.productName}
                                                </div>
                                                {row.productCode && (
                                                    <div className="text-[10px] text-muted-foreground truncate max-w-[210px]">
                                                        {row.productCode}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2 px-3">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1 font-mono text-[11px] text-foreground font-medium" title={`Output Lot: ${row.finishedLotNumber || "-"}`}>
                                                        <span className="text-[9px] uppercase font-bold text-muted-foreground/80 font-sans">L:</span>
                                                        <span>{row.finishedLotNumber || "-"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground" title={`Output Batch: ${row.finishedBatchNo || "-"}`}>
                                                        <span className="text-[9px] uppercase font-bold text-muted-foreground/70 font-sans">B:</span>
                                                        <span>{row.finishedBatchNo || "-"}</span>
                                                    </div>
                                                </div>
                                            </td>
 
                                            <td className="py-2 px-3 text-muted-foreground">
                                                {row.shiftName || "-"}
                                            </td>
                                            <td className="py-2 px-3 text-right font-semibold">
                                                {row.producedQty !== null ? safeFormatNumber(row.producedQty) : "-"}
                                            </td>
                                            <td className="py-2 px-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                                                {row.rejectedQty !== null && row.rejectedQty > 0
                                                    ? safeFormatNumber(row.rejectedQty)
                                                    : "0"}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] font-semibold ${
                                                        row.qaStatus === "Passed"
                                                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                                                            : row.qaStatus === "QA Hold"
                                                            ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                                                            : "border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/5"
                                                    }`}
                                                >
                                                    {row.qaStatus}
                                                </Badge>
                                            </td>
                                            <td className="py-2 px-3 min-w-[260px] max-w-[360px]">
                                                {row.componentBatches.length === 0 ? (
                                                    <span className="text-[10px] text-muted-foreground italic">
                                                        No component link
                                                    </span>
                                                ) : (
                                                    <div className="flex flex-col gap-1">
                                                        {row.componentBatches.slice(0, 2).map((c, cIdx) => (
                                                            <div
                                                                key={cIdx}
                                                                className="inline-flex items-center gap-1.5px-2 py-0.5  transition-colors"
                                                                title={`${c.componentProductName} | Lot: ${c.componentLotName || "-"} | Batch: ${c.componentBatchNo || "-"} | Consumed: ${safeFormatNumber(c.consumedQty, 2)}`}
                                                            >
                                                                <span className="font-semibold text-foreground truncate" title={c.componentProductName}>
                                                                    {c.componentProductName}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {row.componentBatches.length > 2 && (
                                                            <span className="text-[9px] text-muted-foreground font-medium pl-1">
                                                                +{row.componentBatches.length - 2} more components
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => onSelectJobOrder(row.jobOrderId)}
                                                    className="h-7 px-2 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                                >
                                                    Trace
                                                    <ExternalLink className="h-3 w-3 ml-1" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Bar */}
                    <div className="px-4 py-2.5 border-t border-border/70 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
                        <div>
                            Showing <strong>{sortedRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{" "}
                            <strong>{Math.min(currentPage * pageSize, sortedRows.length)}</strong> of{" "}
                            <strong>{sortedRows.length}</strong> batches
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                                <span>Rows per page:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="h-7 px-1.5 text-xs bg-background border border-border/70 rounded-md"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage <= 1}
                                    className="h-7 w-7 rounded-md"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <span className="px-2 text-xs font-semibold">
                                    {currentPage} / {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="h-7 w-7 rounded-md"
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
