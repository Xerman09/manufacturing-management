import React, { useMemo } from "react";
import { Search, RotateCcw, Download, Calendar, Building2, SlidersHorizontal, Tag, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    SearchableSelect,
    SearchableSelectOption,
} from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { StockProjectionFilters, ProjectionStatus } from "../types";

interface StockProjectionFilterBarProps {
    filters: StockProjectionFilters;
    branches: Array<{ id: number; branch_name: string; branch_code: string }>;
    productTypes: Array<{ id: number; name: string }>;
    totalCount: number;
    onFilterChange: <K extends keyof StockProjectionFilters>(
        key: K,
        value: StockProjectionFilters[K]
    ) => void;
    onResetFilters: () => void;
    onExport: () => void;
}

export default function StockProjectionFilterBar({
    filters,
    branches,
    productTypes,
    totalCount,
    onFilterChange,
    onResetFilters,
    onExport,
}: StockProjectionFilterBarProps) {
    // Memoize branch options for SearchableSelect
    const branchOptions: SearchableSelectOption[] = useMemo(() => {
        const options: SearchableSelectOption[] = [
            {
                value: "ALL",
                label: "All Branches",
                subLabel: "Evaluate projections across all plants",
            },
        ];

        for (const b of branches) {
            options.push({
                value: String(b.id),
                label: b.branch_name,
                subLabel: b.branch_code ? `Code: ${b.branch_code}` : undefined,
                badge: b.branch_code || undefined,
            });
        }

        return options;
    }, [branches]);

    return (
        <div className="bg-card border border-border rounded-xl p-3.5 space-y-3.5 shadow-xs">
            {/* Structured Grid with Descriptive Labels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Search Material */}
                <div className="space-y-1.5 sm:col-span-2 md:col-span-1 lg:col-span-2">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5 text-primary" />
                        Search Material
                    </Label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="SKU, material name, or category..."
                            value={filters.search}
                            onChange={(e) => onFilterChange("search", e.target.value)}
                            className="pl-8.5 h-9 text-xs"
                        />
                    </div>
                </div>

                {/* 2. Branch / Plant (Searchable Select) */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        Branch / Plant
                    </Label>
                    <SearchableSelect
                        options={branchOptions}
                        value={filters.branch_id === "ALL" ? "ALL" : String(filters.branch_id)}
                        onValueChange={(val) =>
                            onFilterChange("branch_id", val === "ALL" ? "ALL" : Number(val))
                        }
                        placeholder="Select branch..."
                        searchPlaceholder="Search branch name or code..."
                        triggerClassName="h-9 text-xs"
                        popoverClassName="w-72"
                    />
                </div>

                {/* 3. Assessment Window */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Assessment Window
                    </Label>
                    <Select
                        value={String(filters.assessment_window_months)}
                        onValueChange={(val) =>
                            onFilterChange("assessment_window_months", Number(val))
                        }
                    >
                        <SelectTrigger className="h-9 text-xs w-full">
                            <SelectValue placeholder="Assessment Window" />
                        </SelectTrigger>
                        <SelectContent position="popper" align="start" sideOffset={4} className="w-[--radix-select-trigger-width]">
                            <SelectItem value="0">All Recorded History</SelectItem>
                            <SelectItem value="1">Last 1 Month (30d)</SelectItem>
                            <SelectItem value="3">Last 3 Months (90d)</SelectItem>
                            <SelectItem value="5">Last 5 Months (150d)</SelectItem>
                            <SelectItem value="6">Last 6 Months (180d)</SelectItem>
                            <SelectItem value="12">Last 12 Months (1 Year)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* 4. Projection Status (With popper positioning and color indicator dots) */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                        Projection Status
                    </Label>
                    <Select
                        value={filters.status}
                        onValueChange={(val) =>
                            onFilterChange("status", val as ProjectionStatus | "ALL")
                        }
                    >
                        <SelectTrigger className="h-9 text-xs w-full">
                            <SelectValue placeholder="Projection Status" />
                        </SelectTrigger>
                        <SelectContent position="popper" align="start" sideOffset={4} className="w-[--radix-select-trigger-width] min-w-[210px]">
                            <SelectItem value="ALL">
                                <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                                    All Statuses
                                </span>
                            </SelectItem>
                            <SelectItem value="CRITICAL_SUPPLY">
                                <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                                    Critical (&le; 3 Days)
                                </span>
                            </SelectItem>
                            <SelectItem value="LOW_SUPPLY">
                                <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                                    Low Stock (&le; 14 Days)
                                </span>
                            </SelectItem>
                            <SelectItem value="ESTIMATED_SUPPLY">
                                <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                    Adequate (&gt; 14 Days)
                                </span>
                            </SelectItem>
                            <SelectItem value="INSUFFICIENT_HISTORY">
                                <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                                    Insufficient History
                                </span>
                            </SelectItem>
                            <SelectItem value="NO_RECORDED_CONSUMPTION">
                                <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-zinc-400" />
                                    No Consumption
                                </span>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* 5. Product Type / Category */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-primary" />
                        Product Type
                    </Label>
                    <Select
                        value={filters.product_type}
                        onValueChange={(val) =>
                            onFilterChange("product_type", val)
                        }
                    >
                        <SelectTrigger className="h-9 text-xs w-full">
                            <SelectValue placeholder="Product Type" />
                        </SelectTrigger>
                        <SelectContent position="popper" align="start" sideOffset={4} className="w-[--radix-select-trigger-width]">
                            <SelectItem value="ALL">All Product Types</SelectItem>
                            {productTypes.map((pt) => (
                                <SelectItem key={pt.id} value={pt.name}>
                                    {pt.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* 6. Working Days per Month Baseline */}
                <div className="space-y-1.5 sm:col-span-2 md:col-span-1 lg:col-span-1">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        Working Days / Mo
                    </Label>
                    <Select
                        value={String(filters.working_days_per_month)}
                        onValueChange={(val) =>
                            onFilterChange("working_days_per_month", Number(val))
                        }
                    >
                        <SelectTrigger className="h-9 text-xs w-full">
                            <SelectValue placeholder="Working Days" />
                        </SelectTrigger>
                        <SelectContent position="popper" align="start" sideOffset={4} className="w-[--radix-select-trigger-width]">
                            <SelectItem value="22">22 Days (5-day wk)</SelectItem>
                            <SelectItem value="26">26 Days (6-day wk)</SelectItem>
                            <SelectItem value="30">30 Days (Continuous)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={filters.only_with_available_stock}
                            onChange={(e) =>
                                onFilterChange("only_with_available_stock", e.target.checked)
                            }
                            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span>Only show materials with available stock</span>
                    </label>
                    <span className="text-muted-foreground/40">|</span>
                    <span>
                        Showing <strong className="text-foreground">{totalCount}</strong> evaluated materials
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onResetFilters}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reset
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onExport}
                        className="h-8 text-xs cursor-pointer shadow-2xs hover:bg-muted/50"
                    >
                        <Download className="h-3 w-3 mr-1" />
                        Export Projections
                    </Button>
                </div>
            </div>
        </div>
    );
}
