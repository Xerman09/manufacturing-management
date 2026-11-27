"use client";

import React, { useState, useMemo } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import type { AssetRiskRow, RiskSeverity } from "../types";

interface AssetRiskRankedTabProps {
    rows: AssetRiskRow[];
    onSelectRow: (row: AssetRiskRow) => void;
}

export function AssetRiskRankedTab({ rows, onSelectRow }: AssetRiskRankedTabProps) {
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const filteredRows = useMemo(() => {
        return rows.filter(
            (r) =>
                r.assetName.toLowerCase().includes(search.toLowerCase()) ||
                r.workCenterName.toLowerCase().includes(search.toLowerCase()) ||
                r.serial.toLowerCase().includes(search.toLowerCase()) ||
                r.primaryFailureMode.toLowerCase().includes(search.toLowerCase())
        );
    }, [rows, search]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);

    const paginatedRows = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return filteredRows.slice(start, start + pageSize);
    }, [filteredRows, safeCurrentPage, pageSize]);

    const handleSearchChange = (val: string) => {
        setSearch(val);
        setCurrentPage(1);
    };

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize);
        setCurrentPage(1);
    };

    const getRiskBadge = (level: RiskSeverity, pct: number) => {
        let color = "bg-emerald-500 text-white";
        if (level === "Critical") color = "bg-red-500 text-white";
        else if (level === "High") color = "bg-amber-500 text-white";
        else if (level === "Medium") color = "bg-yellow-500 text-black";

        return (
            <Badge className={`${color} font-mono text-xs px-2 py-0.5`}>
                {pct.toFixed(1)}% - {level}
            </Badge>
        );
    };

    const startIndex = (safeCurrentPage - 1) * pageSize + 1;
    const endIndex = Math.min(safeCurrentPage * pageSize, filteredRows.length);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold">Ranked Equipment Breakdown Risk</h3>
                    <p className="text-xs text-muted-foreground">
                        Assets ordered by predicted breakdown probability within the stated horizon based on run-hours, MTBF, and historical failures.
                    </p>
                </div>
                <input
                    type="text"
                    placeholder="Search asset, station, or failure mode..."
                    className="h-8 w-full sm:w-64 rounded-md border px-2.5 text-xs bg-background"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                />
            </div>

            <div className="rounded-lg border bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[200px]">Asset Name & Serial</TableHead>
                            <TableHead>Work Center</TableHead>
                            <TableHead>Condition</TableHead>
                            <TableHead className="text-right">Run Hours</TableHead>
                            <TableHead className="text-right">Breakdowns</TableHead>
                            <TableHead className="text-right">MTBF</TableHead>
                            <TableHead className="text-center">Breakdown Risk</TableHead>
                            <TableHead>Primary Risk Basis</TableHead>
                            <TableHead className="text-right">Evidence</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-xs text-muted-foreground">
                                    No assets found matching the selected filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedRows.map((row) => (
                                <TableRow
                                    key={row.assetId}
                                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                                    onClick={() => onSelectRow(row)}
                                >
                                    <TableCell className="font-medium">
                                        <div className="flex flex-col">
                                            <span className="truncate">{row.assetName}</span>
                                            {row.serial && (
                                                <span className="font-mono text-[10px] text-muted-foreground">
                                                    SN: {row.serial}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {row.workCenterName}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={
                                                row.condition === "Bad" || row.condition === "Under Maintenance"
                                                    ? "text-red-600 border-red-300"
                                                    : "text-emerald-600 border-emerald-300"
                                            }
                                        >
                                            {row.condition}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {row.cumulativeRunHours.toFixed(1)} hrs
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {row.breakdownCount}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {row.mtbfHours !== null ? `${row.mtbfHours.toFixed(1)} hrs` : "-"}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {getRiskBadge(row.riskLevel, row.predictedBreakdownRiskPct)}
                                    </TableCell>
                                    <TableCell className="text-xs max-w-[220px] truncate">
                                        <span className="font-medium">{row.primaryFailureMode}</span>
                                        {row.dataGapWarning && (
                                            <div className="flex items-center text-[10px] text-amber-600">
                                                <AlertCircle className="mr-1 h-3 w-3 shrink-0" />
                                                Rule-based estimate
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectRow(row);
                                            }}
                                        >
                                            <Eye className="h-3.5 w-3.5 mr-1" />
                                            Drilldown
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            {filteredRows.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span>
                            Showing <strong className="text-foreground">{startIndex}</strong>–<strong className="text-foreground">{endIndex}</strong> of{" "}
                            <strong className="text-foreground">{filteredRows.length}</strong> assets
                        </span>
                        <span className="text-muted-foreground/60">•</span>
                        <div className="flex items-center gap-1.5">
                            <span>Per page:</span>
                            <select
                                className="h-7 rounded border bg-background px-1.5 text-xs text-foreground"
                                value={pageSize}
                                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="mr-2">
                            Page <strong className="text-foreground">{safeCurrentPage}</strong> of <strong className="text-foreground">{totalPages}</strong>
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={safeCurrentPage <= 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span className="sr-only">Previous page</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={safeCurrentPage >= totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                            <span className="sr-only">Next page</span>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

