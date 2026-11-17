"use client";

import React, { useMemo } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RotateCcw, Download, Sparkles, Lock, Filter } from "lucide-react";
import type { PlantOption, AIExecutiveReportFilters, AiTierInfo } from "../types";

interface Props {
    draftFilters: AIExecutiveReportFilters;
    appliedFilters: AIExecutiveReportFilters;
    branches: PlantOption[];
    aiTier: AiTierInfo;
    showAICopilot: boolean;
    copilotLoading: boolean;
    isLoading: boolean;
    onDraftChange: (updates: Partial<AIExecutiveReportFilters>) => void;
    onApplyFilters: () => void;
    onResetDefaults: () => void;
    onToggleAICopilot: () => void;
    onExportPdf: () => void;
}

export const ReportFilters: React.FC<Props> = ({
    draftFilters,
    appliedFilters,
    branches,
    aiTier,
    showAICopilot,
    copilotLoading,
    isLoading,
    onDraftChange,
    onApplyFilters,
    onResetDefaults,
    onToggleAICopilot,
    onExportPdf
}) => {
    // Format searchable plant options with distinct, unique labels to avoid clashing dropdown selections
    const branchOptions = useMemo(() => {
        // Count occurrences of [code] name to identify duplicate labels
        const labelCounts = new Map<string, number>();
        branches.forEach((b) => {
            const baseKey = `[${b.code}] ${b.name}`;
            labelCounts.set(baseKey, (labelCounts.get(baseKey) || 0) + 1);
        });

        return [
            { value: "all", label: "All Plants & Facilities" },
            ...branches.map((b) => {
                const baseKey = `[${b.code}] ${b.name}`;
                const hasDuplicate = (labelCounts.get(baseKey) || 0) > 1;
                const label = hasDuplicate
                    ? `[${b.code} #${b.id}] ${b.name}`
                    : `[${b.code}] ${b.name}`;

                return {
                    value: String(b.id),
                    label
                };
            })
        ];
    }, [branches]);

    // Standard preset options for date range
    const periodOptions = [
        { value: "today", label: "Today" },
        { value: "thisWeek", label: "This Week" },
        { value: "thisMonth", label: "This Month" },
        { value: "thisYear", label: "This Year" },
        { value: "custom", label: "Custom Range" }
    ];

    const isAiLicensed = aiTier.assigned && aiTier.tierLevel > 0;

    // Detect if draft differs from applied
    const hasUnappliedChanges =
        draftFilters.plantId !== appliedFilters.plantId ||
        draftFilters.period !== appliedFilters.period ||
        draftFilters.dateFrom !== appliedFilters.dateFrom ||
        draftFilters.dateTo !== appliedFilters.dateTo;

    // Condition: only show reset button if applied filters differ from default
    const isFiltered =
        appliedFilters.plantId !== "all" ||
        appliedFilters.period !== "thisMonth" ||
        Boolean(appliedFilters.dateFrom) ||
        Boolean(appliedFilters.dateTo);

    return (
        <div className="flex flex-wrap items-center justify-between gap-2.5 w-full min-w-0 p-3 rounded-xl border border-border/50 bg-card/60 backdrop-blur-md shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 mr-1">
                    Filters
                </span>

                {/* Searchable Select for Plant */}
                <div className="w-[220px]">
                    <SearchableSelect
                        value={draftFilters.plantId}
                        onValueChange={(val) => onDraftChange({ plantId: val })}
                        options={branchOptions}
                        placeholder="Search Plant / Branch..."
                        className="h-8 text-xs bg-background border-border/60"
                    />
                </div>

                {/* Searchable Select for Date Period */}
                <div className="w-[145px]">
                    <SearchableSelect
                        value={draftFilters.period}
                        onValueChange={(val) =>
                            onDraftChange({ period: val as AIExecutiveReportFilters["period"] })
                        }
                        options={periodOptions}
                        placeholder="Select Period..."
                        className="h-8 text-xs bg-background border-border/60"
                    />
                </div>

                {/* Custom Date Range Pickers: Shown conditionally when period === 'custom' */}
                {draftFilters.period === "custom" && (
                    <div className="flex items-center gap-1.5">
                        <Input
                            type="date"
                            value={draftFilters.dateFrom}
                            onChange={(e) => onDraftChange({ dateFrom: e.target.value })}
                            className="h-8 w-[130px] text-xs bg-background border-border/60"
                        />
                        <span className="text-xs text-muted-foreground">-</span>
                        <Input
                            type="date"
                            value={draftFilters.dateTo}
                            onChange={(e) => onDraftChange({ dateTo: e.target.value })}
                            className="h-8 w-[130px] text-xs bg-background border-border/60"
                        />
                    </div>
                )}

                {/* Apply Filters Button */}
                <Button
                    size="sm"
                    className={`h-8 px-3 text-xs gap-1.5 font-bold transition-all ${
                        hasUnappliedChanges
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                            : "bg-muted text-muted-foreground hover:bg-muted/80 cursor-default"
                    }`}
                    onClick={onApplyFilters}
                    disabled={!hasUnappliedChanges || isLoading}
                >
                    <Filter className="h-3 w-3" />
                    <span>Apply Filters</span>
                    {hasUnappliedChanges && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    )}
                </Button>

                {/* Conditional Reset Button: Only displays when applied filters differ from default */}
                {isFiltered && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={onResetDefaults}
                        title="Reset to default filters"
                    >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                    </Button>
                )}
            </div>

            {/* Actions: AI Copilot, Export PDF */}
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onToggleAICopilot}
                    className={`h-8 px-3 text-xs gap-1.5 transition-all ${
                        showAICopilot
                            ? "bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300 font-bold shadow-sm"
                            : isAiLicensed
                            ? "border-purple-500/25 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                            : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                >
                    {isAiLicensed ? (
                        <Sparkles className={`h-3.5 w-3.5 ${showAICopilot || copilotLoading ? "text-purple-600 animate-spin" : "text-purple-500"}`} />
                    ) : (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span>AI Copilot</span>
                    {!isAiLicensed && (
                        <span className="text-[9px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground uppercase font-semibold">
                            Locked
                        </span>
                    )}
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1.5"
                    onClick={onExportPdf}
                >
                    <Download className="h-3 w-3" />
                    Export PDF
                </Button>
            </div>
        </div>
    );
};
