"use client";

import React, { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { DetailedKPIRow } from "../types";

interface Props {
    row: DetailedKPIRow | null;
    open: boolean;
    onClose: () => void;
}

type SortField = "col1" | "col2" | "col3" | "col4" | "status";

export const RecordDrilldownModal: React.FC<Props> = ({ row, open, onClose }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<SortField>("col1");
    const [sortAsc, setSortAsc] = useState<boolean>(true);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const pageSize = 10;

    const calculationDetails = row?.calculationDetails;
    const records = useMemo(() => row?.records || [], [row?.records]);
    const recordColumns = row?.recordColumns;

    // Filter displayed records by search term
    const filteredRecords = useMemo(() => {
        return records.filter((r) => {
            if (!searchTerm) return true;
            const q = searchTerm.toLowerCase();
            return (
                r.col1.toLowerCase().includes(q) ||
                r.col2.toLowerCase().includes(q) ||
                r.col3.toLowerCase().includes(q) ||
                r.col4.toLowerCase().includes(q) ||
                r.status.toLowerCase().includes(q)
            );
        });
    }, [records, searchTerm]);

    // Sort records
    const sortedRecords = useMemo(() => {
        return [...filteredRecords].sort((a, b) => {
            const valA = String(a[sortField] || "").toLowerCase();
            const valB = String(b[sortField] || "").toLowerCase();
            const cmp = valA.localeCompare(valB, undefined, { numeric: true });
            return sortAsc ? cmp : -cmp;
        });
    }, [filteredRecords, sortField, sortAsc]);

    // Paginate records
    const totalRecords = sortedRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedRecords.slice(start, start + pageSize);
    }, [sortedRecords, currentPage, pageSize]);

    if (!row || !calculationDetails || !recordColumns) return null;

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortAsc((prev) => !prev);
        } else {
            setSortField(field);
            setSortAsc(true);
        }
        setCurrentPage(1);
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/60 ml-1 inline" />;
        return sortAsc
            ? <ArrowUp className="h-3 w-3 text-primary ml-1 inline" />
            : <ArrowDown className="h-3 w-3 text-primary ml-1 inline" />;
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="w-[94vw] max-w-5xl lg:max-w-6xl max-h-[88vh] flex flex-col p-4 sm:p-6 overflow-hidden">
                <DialogHeader className="pb-2 border-b">
                    <div className="flex items-center justify-between pr-4">
                        <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                            {row.kpi} Breakdown
                        </DialogTitle>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-muted-foreground">
                            {row.category}
                        </Badge>
                    </div>
                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        {row.operationalScope} • Target Basis: {row.targetBasis}
                    </DialogDescription>
                </DialogHeader>

                {/* Calculation Summary Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-3 bg-muted/40 p-3 rounded-lg border text-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">
                            {calculationDetails.numeratorLabel}
                        </span>
                        <p className="text-sm sm:text-base font-black text-foreground mt-0.5">
                            {calculationDetails.numeratorValue.toLocaleString()}
                        </p>
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">
                            {calculationDetails.denominatorLabel}
                        </span>
                        <p className="text-sm sm:text-base font-black text-foreground mt-0.5">
                            {calculationDetails.denominatorValue.toLocaleString()}
                        </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Scope</span>
                        <p className="text-sm sm:text-base font-bold text-foreground mt-0.5">
                            {calculationDetails.sourceRecordsCount} Transactions
                        </p>
                    </div>
                </div>

                {/* Search Bar for Records */}
                <div className="relative mb-2.5">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1);
                        }}
                        placeholder={`Search ${recordColumns.col1} or ${recordColumns.col2}...`}
                        className="h-8 pl-8 text-xs bg-background border-border/70"
                    />
                </div>

                {/* Records Table with Horizontal Auto-Scroll */}
                <div className="flex-1 overflow-auto border rounded-xl bg-card min-w-0">
                    <Table className="min-w-[700px] w-full">
                        <TableHeader className="bg-muted/50 sticky top-0 z-10">
                            <TableRow className="text-xs">
                                <TableHead
                                    onClick={() => handleSort("col1")}
                                    className="font-bold cursor-pointer select-none hover:text-foreground"
                                >
                                    {recordColumns.col1} {renderSortIcon("col1")}
                                </TableHead>
                                <TableHead
                                    onClick={() => handleSort("col2")}
                                    className="font-bold cursor-pointer select-none hover:text-foreground"
                                >
                                    {recordColumns.col2} {renderSortIcon("col2")}
                                </TableHead>
                                <TableHead
                                    onClick={() => handleSort("col3")}
                                    className="font-bold text-right cursor-pointer select-none hover:text-foreground"
                                >
                                    {recordColumns.col3} {renderSortIcon("col3")}
                                </TableHead>
                                <TableHead
                                    onClick={() => handleSort("col4")}
                                    className="font-bold text-right cursor-pointer select-none hover:text-foreground"
                                >
                                    {recordColumns.col4} {renderSortIcon("col4")}
                                </TableHead>
                                <TableHead
                                    onClick={() => handleSort("status")}
                                    className="font-bold text-center w-[100px] cursor-pointer select-none hover:text-foreground"
                                >
                                    Status {renderSortIcon("status")}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedRecords.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                                        No transactional records matching your query.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedRecords.map((item) => (
                                    <TableRow key={item.id} className="text-xs hover:bg-muted/40">
                                        <TableCell className="font-mono font-semibold text-foreground">
                                            {item.col1}
                                        </TableCell>
                                        <TableCell className="text-foreground max-w-[240px] truncate" title={item.col2}>
                                            {item.col2}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground font-medium">
                                            {item.col3}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-foreground">
                                            {item.col4}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge
                                                variant="outline"
                                                className={`text-[9px] font-bold ${
                                                    item.status.toLowerCase().includes("passed") || item.status.toLowerCase().includes("resolved") || item.status.toLowerCase().includes("favorable") || item.status.toLowerCase().includes("delivered")
                                                        ? "text-emerald-700 bg-emerald-500/10 border-emerald-300"
                                                        : "text-amber-700 bg-amber-500/10 border-amber-300"
                                                }`}
                                            >
                                                {item.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
                    <span>
                        Showing {totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} records
                    </span>
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Previous
                        </Button>
                        <span className="font-semibold text-foreground px-2">
                            {currentPage} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        >
                            Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
