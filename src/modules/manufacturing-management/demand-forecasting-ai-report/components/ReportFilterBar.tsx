"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
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
    DemandForecastFilters,
    FilterCatalogPayload,
    ForecastCadence,
    ForecastHorizonOption,
    HistoricalPeriodPreset
} from "../types";

interface ReportFilterBarProps {
    draftFilters: DemandForecastFilters;
    appliedFilters: DemandForecastFilters;
    catalog: FilterCatalogPayload;
    catalogLoading: boolean;
    isLoading: boolean;
    exportingFormat: "pdf" | "xlsx" | null;
    aiLoading: boolean;
    onDraftChange: (updates: Partial<DemandForecastFilters>) => void;
    onCadenceSwitch: (cadence: ForecastCadence) => void;
    onApplyFilters: () => void;
    onResetFilters: () => void;
    onOpenAICommentary: () => void;
    onExport: (format: "pdf" | "xlsx") => void;
}

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
    draftFilters,
    appliedFilters,
    catalog,
    catalogLoading,
    isLoading,
    exportingFormat,
    aiLoading,
    onDraftChange,
    onCadenceSwitch,
    onApplyFilters,
    onResetFilters,
    onOpenAICommentary,
    onExport
}) => {
    const periodOptions: ComboboxOption[] = useMemo(
        () => [
            { value: "last8Weeks", label: "Last 8 Weeks", sublabel: "Short-term weekly history" },
            { value: "last12Weeks", label: "Last 12 Weeks", sublabel: "Quarter rolling weekly" },
            { value: "last6Months", label: "Last 6 Months", sublabel: "Half-year demand baseline" },
            { value: "last12Months", label: "Last 12 Months", sublabel: "Full-year seasonal view" },
            { value: "thisYear", label: "Year to Date", sublabel: "Jan 1 to current date" },
            { value: "custom", label: "Custom Date Range", sublabel: "Select explicit start and end dates" }
        ],
        []
    );

    const branchOptions: ComboboxOption[] = useMemo(() => {
        const seen = new Map<string, number>();
        catalog.branches.forEach((b) => {
            const key = `[${b.code}] ${b.name}`;
            seen.set(key, (seen.get(key) || 0) + 1);
        });
        return [
            { value: "all", label: "All Branches", sublabel: "All active branches combined" },
            ...catalog.branches.map((b) => {
                const base = `[${b.code}] ${b.name}`;
                return {
                    value: String(b.id),
                    label: (seen.get(base) || 0) > 1 ? `[${b.code} #${b.id}] ${b.name}` : base
                };
            })
        ];
    }, [catalog.branches]);

    const productOptions: ComboboxOption[] = useMemo(
        () => [
            { value: "all", label: "All Products", sublabel: `${catalog.products.length} active SKUs` },
            ...catalog.products.map((p) => ({
                value: String(p.id),
                label: p.name,
                sublabel: `${p.code} · ${p.categoryName}`
            }))
        ],
        [catalog.products]
    );

    const regionOptions: ComboboxOption[] = useMemo(
        () => [
            { value: "all", label: "All Customer Regions", sublabel: `${catalog.regions.length} regions` },
            ...catalog.regions.map((r) => ({
                value: r.key,
                label: r.label,
                sublabel:
                    r.source === "unmapped"
                        ? `Unassigned · ${r.customerCount} customers`
                        : `${r.customerCount} customer${r.customerCount === 1 ? "" : "s"}`
            }))
        ],
        [catalog.regions]
    );

    const horizonOptions: ComboboxOption[] = useMemo(() => {
        if (draftFilters.cadence === "weekly") {
            return [
                { value: "4w", label: "Next 4 Weeks", sublabel: "Short-term replenishment" },
                { value: "8w", label: "Next 8 Weeks", sublabel: "Standard weekly planning" },
                { value: "12w", label: "Next 12 Weeks", sublabel: "Quarterly rolling outlook" }
            ];
        }
        return [
            { value: "3m", label: "Next 3 Months", sublabel: "Quarterly planning cycle" },
            { value: "6m", label: "Next 6 Months", sublabel: "Half-year capacity plan" },
            { value: "12m", label: "Next 12 Months", sublabel: "Annual demand outlook" }
        ];
    }, [draftFilters.cadence]);

    const hasUnappliedChanges =
        draftFilters.cadence !== appliedFilters.cadence ||
        draftFilters.period !== appliedFilters.period ||
        draftFilters.dateFrom !== appliedFilters.dateFrom ||
        draftFilters.dateTo !== appliedFilters.dateTo ||
        draftFilters.branchId !== appliedFilters.branchId ||
        draftFilters.productId !== appliedFilters.productId ||
        draftFilters.regionKey !== appliedFilters.regionKey ||
        draftFilters.forecastHorizon !== appliedFilters.forecastHorizon;

    const isNonDefault =
        appliedFilters.branchId !== "all" ||
        appliedFilters.productId !== "all" ||
        appliedFilters.regionKey !== "all" ||
        appliedFilters.period !==
            (appliedFilters.cadence === "weekly" ? "last12Weeks" : "last6Months");

    return (
        <div className="rounded-2xl border border-border/60 bg-card/75 backdrop-blur-md shadow-sm p-3.5 space-y-3">
            {/* Row 1: Weekly/Monthly Cycle Toggle + Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="inline-flex items-center rounded-xl border border-border/70 bg-muted/50 p-0.5">
                    {(["weekly", "monthly"] as ForecastCadence[]).map((mode) => {
                        const active = draftFilters.cadence === mode;
                        return (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => onCadenceSwitch(mode)}
                                className={`relative px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                    active
                                        ? "text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {active && (
                                    <motion.span
                                        layoutId="demand-cadence-pill"
                                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                                        className="absolute inset-0 rounded-lg bg-background shadow-sm border border-border/50"
                                    />
                                )}
                                <span className="relative z-10 capitalize">
                                    {mode === "weekly" ? "Weekly Cycle" : "Monthly Cycle"}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Right-side Actions: AI Commentary & Export */}
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onOpenAICommentary}
                        disabled={isLoading || aiLoading}
                        className="h-8 rounded-xl px-3 text-xs gap-1.5 border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
                    >
                        <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`} />
                        <span>{aiLoading ? "Analyzing..." : "AI Commentary"}</span>
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isLoading || exportingFormat !== null}
                                className="h-8 rounded-xl px-3 text-xs gap-1.5"
                            >
                                <Download className="h-3.5 w-3.5" />
                                <span>
                                    {exportingFormat
                                        ? `Exporting ${exportingFormat.toUpperCase()}...`
                                        : "Export"}
                                </span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl">
                            <DropdownMenuItem
                                onClick={() => onExport("pdf")}
                                className="text-xs gap-2 cursor-pointer"
                            >
                                <FileText className="h-3.5 w-3.5 text-rose-500" />
                                Export PDF Brief
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => onExport("xlsx")}
                                className="text-xs gap-2 cursor-pointer"
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                                Export Excel Workbook
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Row 2: Searchable Combobox Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.1fr_1.1fr_1.7fr_1.3fr_1.1fr_auto] gap-2.5 items-end">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Period
                    </label>
                    <FilterCombobox
                        value={draftFilters.period}
                        onValueChange={(val) =>
                            onDraftChange({ period: val as HistoricalPeriodPreset })
                        }
                        options={periodOptions}
                        placeholder="Select period"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Branch
                    </label>
                    <FilterCombobox
                        value={draftFilters.branchId}
                        onValueChange={(val) => onDraftChange({ branchId: val })}
                        options={branchOptions}
                        placeholder="Select branch"
                        searchPlaceholder="Search branch..."
                        disabled={catalogLoading}
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
                        placeholder="Product SKU"
                        searchPlaceholder="Search product or SKU..."
                        disabled={catalogLoading}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Customer Region
                    </label>
                    <FilterCombobox
                        value={draftFilters.regionKey}
                        onValueChange={(val) => onDraftChange({ regionKey: val })}
                        options={regionOptions}
                        placeholder="Customer region"
                        searchPlaceholder="Search province or city..."
                        disabled={catalogLoading}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Forecast Period
                    </label>
                    <FilterCombobox
                        value={draftFilters.forecastHorizon}
                        onValueChange={(val) =>
                            onDraftChange({ forecastHorizon: val as ForecastHorizonOption })
                        }
                        options={horizonOptions}
                        placeholder="Forecast horizon"
                    />
                </div>

                <div className="flex items-center gap-1.5">
                    <Button
                        type="button"
                        size="sm"
                        onClick={onApplyFilters}
                        disabled={!hasUnappliedChanges || isLoading}
                        className={`h-8 flex-1 rounded-lg text-xs font-semibold gap-1.5 transition-all ${
                            hasUnappliedChanges
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-muted text-muted-foreground"
                        }`}
                    >
                        <Filter className="h-3.5 w-3.5" />
                        <span>{hasUnappliedChanges ? "Update Forecast" : "Applied"}</span>
                        {hasUnappliedChanges && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                        )}
                    </Button>
                    {isNonDefault && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onResetFilters}
                            title="Reset filters to default"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Custom Date Pickers */}
            {draftFilters.period === "custom" && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50"
                >
                    <span className="text-[11px] font-semibold text-muted-foreground">
                        Custom Historical Window:
                    </span>
                    <Input
                        type="date"
                        value={draftFilters.dateFrom}
                        onChange={(e) => onDraftChange({ dateFrom: e.target.value })}
                        className="h-8 w-[145px] text-xs bg-background"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                        type="date"
                        value={draftFilters.dateTo}
                        onChange={(e) => onDraftChange({ dateTo: e.target.value })}
                        className="h-8 w-[145px] text-xs bg-background"
                    />
                </motion.div>
            )}
        </div>
    );
};
