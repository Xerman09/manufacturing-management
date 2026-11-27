"use client";

import React from "react";
import { Download, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FilterCombobox } from "./FilterCombobox";
import type {
    FilterCatalogPayload,
    PredictiveMaintenanceFilters,
    PredictionHorizonOption
} from "../types";

interface ReportFilterBarProps {
    draftFilters: PredictiveMaintenanceFilters;
    catalog: FilterCatalogPayload;
    onFilterChange: (key: keyof PredictiveMaintenanceFilters, value: string) => void;
    onApply: () => void;
    onReset: () => void;
    onOpenAiDrawer: () => void;
    onExportCsv: () => void;
    isLoading: boolean;
    hasPendingChanges: boolean;
}

export function ReportFilterBar({
    draftFilters,
    catalog,
    onFilterChange,
    onApply,
    onReset,
    onOpenAiDrawer,
    onExportCsv,
    isLoading,
    hasPendingChanges
}: ReportFilterBarProps) {
    return (
        <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {/* Date From */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Cutoff Date From</Label>
                    <Input
                        type="date"
                        className="h-9"
                        value={draftFilters.dateFrom}
                        onChange={(e) => onFilterChange("dateFrom", e.target.value)}
                    />
                </div>

                {/* Date To */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Cutoff Date To</Label>
                    <Input
                        type="date"
                        className="h-9"
                        value={draftFilters.dateTo}
                        onChange={(e) => onFilterChange("dateTo", e.target.value)}
                    />
                </div>

                {/* Prediction Horizon */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Prediction Horizon</Label>
                    <FilterCombobox
                        options={catalog.horizons.map((h) => ({ id: h.id, label: h.label }))}
                        value={draftFilters.horizon}
                        onChange={(val) => onFilterChange("horizon", val as PredictionHorizonOption)}
                        allLabel="30 Days (Monthly)"
                    />
                </div>

                {/* Asset Selection */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Asset / Equipment</Label>
                    <FilterCombobox
                        options={catalog.assets}
                        value={draftFilters.assetId}
                        onChange={(val) => onFilterChange("assetId", val)}
                        allLabel="All Equipment Assets"
                    />
                </div>

                {/* Work Center */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Work Center</Label>
                    <FilterCombobox
                        options={catalog.workCenters}
                        value={draftFilters.workCenterId}
                        onChange={(val) => onFilterChange("workCenterId", val)}
                        allLabel="All Work Centers"
                    />
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        onClick={onApply}
                        disabled={isLoading}
                        className={hasPendingChanges ? "bg-primary font-semibold" : ""}
                    >
                        {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Apply & Calculate
                    </Button>
                    <Button variant="outline" size="sm" onClick={onReset} disabled={isLoading}>
                        Reset
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onExportCsv}>
                        <Download className="mr-2 h-4 w-4" />
                        Export CSV
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={onOpenAiDrawer}
                    >
                        <Sparkles className="mr-2 h-4 w-4" />
                        AI Copilot & Narrative
                    </Button>
                </div>
            </div>
        </div>
    );
}
