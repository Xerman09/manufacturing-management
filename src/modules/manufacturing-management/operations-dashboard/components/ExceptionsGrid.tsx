"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, Info, ArrowUpRight } from "lucide-react";
import { ExceptionItem, ExceptionSeverity } from "../types/operations-dashboard.types";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

interface ExceptionsGridProps {
    exceptions: ExceptionItem[];
}

type StatusFilterType = "ALL" | ExceptionSeverity;

export const ExceptionsGrid: React.FC<ExceptionsGridProps> = ({ exceptions }) => {
    const [pageIndex, setPageIndex] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(5);
    const [statusFilter, setStatusFilter] = useState<StatusFilterType>("ALL");

    const counts = useMemo(() => {
        const c = { ALL: exceptions.length, CRITICAL: 0, WARNING: 0, INFO: 0 };
        exceptions.forEach((e) => {
            if (e.severity === "CRITICAL") c.CRITICAL++;
            else if (e.severity === "WARNING") c.WARNING++;
            else if (e.severity === "INFO") c.INFO++;
        });
        return c;
    }, [exceptions]);

    const filteredExceptions = useMemo(() => {
        if (statusFilter === "ALL") return exceptions;
        return exceptions.filter((e) => e.severity === statusFilter);
    }, [exceptions, statusFilter]);

    if (!exceptions || exceptions.length === 0) {
        return null;
    }

    const totalCount = filteredExceptions.length;
    const startIndex = (pageIndex - 1) * pageSize;
    const paginatedExceptions = filteredExceptions.slice(startIndex, startIndex + pageSize);

    const handleFilterChange = (filter: StatusFilterType) => {
        setStatusFilter(filter);
        setPageIndex(1);
    };

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case "CRITICAL":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                        <AlertOctagon className="h-3 w-3" /> CRITICAL
                    </span>
                );
            case "WARNING":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <AlertTriangle className="h-3 w-3" /> WARNING
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        <Info className="h-3 w-3" /> NOTICE
                    </span>
                );
        }
    };

    return (
        <div className="bg-card border border-rose-500/20 rounded-xl overflow-hidden shadow-xs">
            {/* Header with Title and Status Filter Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 bg-rose-500/5 border-b border-rose-500/20 gap-3">
                <div className="flex items-center gap-2">
                    <AlertOctagon className="h-4 w-4 text-rose-500" />
                    <h2 className="text-sm font-bold text-foreground">
                        Operational Exceptions &amp; Escalations
                    </h2>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600">
                        {counts.ALL} Active
                    </span>
                </div>

                {/* Status Filter Buttons */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => handleFilterChange("ALL")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            statusFilter === "ALL"
                                ? "bg-foreground text-background shadow-xs"
                                : "bg-muted/50 text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        All ({counts.ALL})
                    </button>
                    <button
                        type="button"
                        onClick={() => handleFilterChange("CRITICAL")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            statusFilter === "CRITICAL"
                                ? "bg-rose-600 text-white shadow-xs"
                                : "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                        }`}
                    >
                        Critical ({counts.CRITICAL})
                    </button>
                    <button
                        type="button"
                        onClick={() => handleFilterChange("WARNING")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            statusFilter === "WARNING"
                                ? "bg-amber-600 text-white shadow-xs"
                                : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                        }`}
                    >
                        Warning ({counts.WARNING})
                    </button>
                    <button
                        type="button"
                        onClick={() => handleFilterChange("INFO")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            statusFilter === "INFO"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
                        }`}
                    >
                        Notice ({counts.INFO})
                    </button>
                </div>
            </div>

            <div className="divide-y divide-border/60">
                {paginatedExceptions.map((exc) => (
                    <div
                        key={exc.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-3 hover:bg-muted/15 transition-colors"
                    >
                        <div className="flex items-start gap-3">
                            <div className="shrink-0 mt-0.5">
                                {getSeverityBadge(exc.severity)}
                            </div>
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs font-bold text-foreground">
                                        {exc.title}
                                    </h3>
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                        {exc.sourceModule}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {exc.description}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                            <Link
                                href={exc.actionUrl}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all shadow-xs cursor-pointer"
                            >
                                <span>{exc.actionLabel}</span>
                                <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                ))}
                {filteredExceptions.length === 0 && (
                    <div className="p-8 text-center text-xs text-muted-foreground italic">
                        No exceptions match the selected {statusFilter} filter.
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {totalCount > pageSize && (
                <div className="border-t border-border/60 py-2.5 px-4 bg-muted/10">
                    <DataTablePagination
                        pageIndex={pageIndex}
                        pageSize={pageSize}
                        rowCount={totalCount}
                        onPageChange={setPageIndex}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPageIndex(1);
                        }}
                    />
                </div>
            )}
        </div>
    );
};
