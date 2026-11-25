"use client";

import React, { useMemo } from "react";
import {
    Download,
    FileSpreadsheet,
    FileText,
    Filter,
    RefreshCw,
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
import { JOB_ORDER_STATUS } from "../../job-order-status";
import type {
    QualityFilterCatalogPayload,
    QualityFilters
} from "../types";

interface ReportFilterBarProps {
    draftFilters: QualityFilters;
    appliedFilters: QualityFilters;
    catalog: QualityFilterCatalogPayload;
    catalogLoading: boolean;
    isLoading: boolean;
    aiLoading: boolean;
    exportingFormat: "pdf" | "xlsx" | null;
    onDraftChange: (updates: Partial<QualityFilters>) => void;
    onApplyFilters: () => void;
    onResetFilters: () => void;
    onOpenAiInsights: () => void;
    onExport: (format: "pdf" | "xlsx") => void;
}

const FIELD_CLASS = "flex min-w-[9.5rem] flex-1 flex-col gap-1";
const LABEL_CLASS = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

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
    const productOptions = useMemo<ComboboxOption[]>(
        () => [
            { value: "all", label: "All Products", sublabel: `${catalog.products.length} SKUs` },
            ...catalog.products.map((p) => ({
                value: String(p.id),
                label: p.name,
                sublabel: p.code ? `Code: ${p.code}` : undefined
            }))
        ],
        [catalog.products]
    );

    const workCenterOptions = useMemo<ComboboxOption[]>(
        () => [
            {
                value: "all",
                label: "All Lines / Stations",
                sublabel: `${catalog.workCenters.length} work centers`
            },
            ...catalog.workCenters.map((wc) => ({ value: String(wc.id), label: wc.name }))
        ],
        [catalog.workCenters]
    );

    const shiftOptions = useMemo<ComboboxOption[]>(
        () => [
            { value: "all", label: "All Shifts" },
            ...catalog.shifts.map((sh) => ({ value: sh, label: sh }))
        ],
        [catalog.shifts]
    );

    const statusOptions = useMemo<ComboboxOption[]>(
        () => [
            { value: "all", label: "All Statuses" },
            { value: JOB_ORDER_STATUS.DRAFT, label: "Draft" },
            { value: JOB_ORDER_STATUS.FOR_PICKING, label: "For Picking" },
            { value: JOB_ORDER_STATUS.PICKED, label: "Picked" },
            { value: JOB_ORDER_STATUS.IN_PRODUCTION, label: "In Production" },
            { value: JOB_ORDER_STATUS.ON_HOLD, label: "On Hold" },
            { value: JOB_ORDER_STATUS.QA_HOLD, label: "QA Hold" },
            { value: JOB_ORDER_STATUS.PRODUCTION_COMPLETED, label: "Production Completed" },
            { value: JOB_ORDER_STATUS.FOR_QA_RECONCILIATION, label: "For QA & Reconciliation" },
            { value: JOB_ORDER_STATUS.CLOSED, label: "Closed" },
            { value: JOB_ORDER_STATUS.CANCELLED, label: "Cancelled" }
        ],
        []
    );

    const hasUnappliedChanges =
        draftFilters.dateFrom !== appliedFilters.dateFrom ||
        draftFilters.dateTo !== appliedFilters.dateTo ||
        draftFilters.productId !== appliedFilters.productId ||
        draftFilters.workCenterId !== appliedFilters.workCenterId ||
        draftFilters.shiftName !== appliedFilters.shiftName ||
        draftFilters.status !== appliedFilters.status;

    return (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-3.5 space-y-3">
            {/* Row 1: Section label + AI / Export actions */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/50 pb-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Filter className="h-3.5 w-3.5" /> Filter Parameters
                    </span>
                    {hasUnappliedChanges && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
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
                        disabled={isLoading}
                        className="h-8 rounded-xl px-3 text-xs gap-1.5 border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 cursor-pointer"
                    >
                        <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`} />
                        <span>{aiLoading ? "Analyzing..." : "AI Insight"}</span>
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

            {/* Row 2: Job order scope controls + Apply / Reset */}
            <div className="flex flex-wrap items-end gap-2.5">
                <div className={FIELD_CLASS}>
                    <label className={LABEL_CLASS}>From Date</label>
                    <Input
                        type="date"
                        value={draftFilters.dateFrom}
                        onChange={(e) => onDraftChange({ dateFrom: e.target.value })}
                        className="h-8 text-xs bg-background"
                    />
                </div>

                <div className={FIELD_CLASS}>
                    <label className={LABEL_CLASS}>To Date</label>
                    <Input
                        type="date"
                        value={draftFilters.dateTo}
                        onChange={(e) => onDraftChange({ dateTo: e.target.value })}
                        className="h-8 text-xs bg-background"
                    />
                </div>

                <div className={FIELD_CLASS}>
                    <label className={LABEL_CLASS}>Product SKU</label>
                    <FilterCombobox
                        options={productOptions}
                        value={draftFilters.productId}
                        onValueChange={(val) => onDraftChange({ productId: val })}
                        placeholder="All Products"
                        searchPlaceholder="Search product SKU..."
                        disabled={catalogLoading}
                    />
                </div>

                <div className={FIELD_CLASS}>
                    <label className={LABEL_CLASS}>Line / Station</label>
                    <FilterCombobox
                        options={workCenterOptions}
                        value={draftFilters.workCenterId}
                        onValueChange={(val) => onDraftChange({ workCenterId: val })}
                        placeholder="All Lines / Stations"
                        searchPlaceholder="Search work center..."
                        disabled={catalogLoading}
                    />
                </div>

                <div className={FIELD_CLASS}>
                    <label className={LABEL_CLASS}>Production Shift</label>
                    <FilterCombobox
                        options={shiftOptions}
                        value={draftFilters.shiftName}
                        onValueChange={(val) => onDraftChange({ shiftName: val })}
                        placeholder="All Shifts"
                        searchPlaceholder="Search shift..."
                        disabled={catalogLoading}
                    />
                </div>

                <div className={FIELD_CLASS}>
                    <label className={LABEL_CLASS}>Job Order Status</label>
                    <FilterCombobox
                        options={statusOptions}
                        value={draftFilters.status}
                        onValueChange={(val) =>
                            onDraftChange({ status: val as QualityFilters["status"] })
                        }
                        placeholder="All Statuses"
                        searchPlaceholder="Search status..."
                    />
                </div>

                <div className="flex shrink-0 items-center gap-1.5 ml-auto">
                    <Button
                        type="button"
                        size="sm"
                        onClick={onApplyFilters}
                        disabled={!hasUnappliedChanges || isLoading}
                        className={`h-8 rounded-xl px-4 text-xs font-semibold gap-1.5 transition-all cursor-pointer ${
                            hasUnappliedChanges
                                ? "bg-primary text-primary-foreground shadow-sm hover:opacity-90"
                                : "bg-muted text-muted-foreground cursor-default"
                        }`}
                    >
                        {isLoading ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Filter className="h-3.5 w-3.5" />
                        )}
                        <span>{isLoading ? "Applying..." : hasUnappliedChanges ? "Apply Filters" : "Applied"}</span>
                    </Button>

                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onResetFilters}
                        title="Reset to current month"
                        disabled={isLoading}
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
