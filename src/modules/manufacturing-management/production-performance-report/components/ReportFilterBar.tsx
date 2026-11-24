"use client";

import React, { useMemo } from "react";
import {
    Download,
    FileSpreadsheet,
    FileText,
    Filter,
    RotateCcw,
    Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { FilterCombobox, type ComboboxOption } from "./FilterCombobox";
import type {
    QIFilterCatalogPayload,
    QIStatusFilter,
    QualityIntelligenceFilters
} from "../types";

interface ReportFilterBarProps {
    draftFilters: QualityIntelligenceFilters;
    appliedFilters: QualityIntelligenceFilters;
    catalog: QIFilterCatalogPayload;
    catalogLoading: boolean;
    isLoading: boolean;
    aiLoading: boolean;
    exportingFormat: "pdf" | "xlsx" | null;
    onDraftChange: (updates: Partial<QualityIntelligenceFilters>) => void;
    onApplyFilters: () => void;
    onResetFilters: () => void;
    onOpenAiInsights: () => void;
    onExport: (format: "pdf" | "xlsx") => void;
}

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
    draftFilters,
    appliedFilters,
    catalog,
    catalogLoading,
    isLoading,
    aiLoading,
    exportingFormat,
    onDraftChange,
    onApplyFilters,
    onResetFilters,
    onOpenAiInsights,
    onExport
}) => {
    const productOptions: ComboboxOption[] = useMemo(
        () => [
            { value: "all", label: "All Products", sublabel: `${catalog.products.length} SKUs` },
            ...catalog.products.map((p) => ({
                value: String(p.id),
                label: p.name,
                sublabel: p.code
            }))
        ],
        [catalog.products]
    );

    const workCenterOptions: ComboboxOption[] = useMemo(
        () => [
            { value: "all", label: "All Work Centers", sublabel: `${catalog.workCenters.length} stations` },
            ...catalog.workCenters.map((wc) => ({
                value: String(wc.id),
                label: wc.name
            }))
        ],
        [catalog.workCenters]
    );

    const statusOptions: ComboboxOption[] = useMemo(
        () => [
            { value: "all", label: "All Statuses" },
            { value: "Draft", label: "Draft" },
            { value: "Scheduled", label: "Scheduled" },
            { value: "In Progress", label: "In Progress" },
            { value: "In Production", label: "In Production" },
            { value: "QA Pending", label: "QA Pending" },
            { value: "Closed", label: "Closed / Completed" },
            { value: "Cancelled", label: "Cancelled" }
        ],
        []
    );

    const hasUnappliedChanges =
        draftFilters.dateFrom !== appliedFilters.dateFrom ||
        draftFilters.dateTo !== appliedFilters.dateTo ||
        draftFilters.productId !== appliedFilters.productId ||
        draftFilters.workCenterId !== appliedFilters.workCenterId ||
        draftFilters.status !== appliedFilters.status;

    return (
        <div className="rounded-2xl border border-border/60 bg-card/75 backdrop-blur-md shadow-sm p-3.5 space-y-3">
            {/* Top row: Title/scope info + AI & Export buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Filter className="h-3.5 w-3.5" /> Filter Parameters
                    </span>
                    {hasUnappliedChanges && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Unapplied Changes
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onOpenAiInsights}
                        disabled={isLoading || aiLoading}
                        className="h-8 rounded-xl px-3 text-xs gap-1.5 border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 cursor-pointer"
                    >
                        <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`} />
                        <span>{aiLoading ? "Analyzing..." : "AI Insights"}</span>
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isLoading || exportingFormat !== null}
                                className="h-8 rounded-xl px-3 text-xs gap-1.5 cursor-pointer"
                            >
                                <Download className="h-3.5 w-3.5" />
                                <span>
                                    {exportingFormat
                                        ? `Exporting ${exportingFormat.toUpperCase()}...`
                                        : "Export"}
                                </span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-xl">
                            <DropdownMenuItem
                                onClick={() => onExport("pdf")}
                                className="text-xs gap-2 cursor-pointer"
                            >
                                <FileText className="h-3.5 w-3.5 text-rose-500" />
                                <div>
                                    <div className="font-semibold">Printable PDF Brief</div>
                                    <div className="text-[10px] text-muted-foreground">
                                        Configurable in print dialog
                                    </div>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => onExport("xlsx")}
                                className="text-xs gap-2 cursor-pointer"
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                                <div>
                                    <div className="font-semibold">Excel Spreadsheet</div>
                                    <div className="text-[10px] text-muted-foreground">
                                        Full workbook (.xlsx)
                                    </div>
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Bottom row: Filter Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.1fr_1.1fr_1.6fr_1.3fr_1.2fr_auto] gap-2.5 items-end">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        From Date
                    </label>
                    <Input
                        type="date"
                        value={draftFilters.dateFrom}
                        onChange={(e) => onDraftChange({ dateFrom: e.target.value })}
                        className="h-8 text-xs bg-background"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        To Date
                    </label>
                    <Input
                        type="date"
                        value={draftFilters.dateTo}
                        onChange={(e) => onDraftChange({ dateTo: e.target.value })}
                        className="h-8 text-xs bg-background"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Product
                    </label>
                    <FilterCombobox
                        value={draftFilters.productId}
                        onValueChange={(val) => onDraftChange({ productId: val })}
                        options={productOptions}
                        placeholder="All Products"
                        searchPlaceholder="Search product SKU..."
                        disabled={catalogLoading}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Work Center
                    </label>
                    <FilterCombobox
                        value={draftFilters.workCenterId}
                        onValueChange={(val) => onDraftChange({ workCenterId: val })}
                        options={workCenterOptions}
                        placeholder="All Work Centers"
                        searchPlaceholder="Search work center..."
                        disabled={catalogLoading}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Status
                    </label>
                    <FilterCombobox
                        value={draftFilters.status}
                        onValueChange={(val) => onDraftChange({ status: val as QIStatusFilter })}
                        options={statusOptions}
                        placeholder="All Statuses"
                    />
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        type="button"
                        size="sm"
                        onClick={onApplyFilters}
                        disabled={!hasUnappliedChanges || isLoading}
                        className={`h-8 flex-1 rounded-lg text-xs font-semibold gap-1.5 transition-all cursor-pointer ${
                            hasUnappliedChanges
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-muted text-muted-foreground"
                        }`}
                    >
                        <Filter className="h-3.5 w-3.5" />
                        <span>{hasUnappliedChanges ? "Apply Filter" : "Applied"}</span>
                        {hasUnappliedChanges && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                        )}
                    </Button>

                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onResetFilters}
                        title="Reset to this month"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
