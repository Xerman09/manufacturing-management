"use client";

import { useMemo } from "react";
import { Filter, RotateCcw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "./SearchableSelect";
import type { WipFilterState } from "../types";

interface WipFiltersProps {
    filters: WipFilterState;
    onFilterChange: <K extends keyof WipFilterState>(key: K, value: WipFilterState[K]) => void;
    onReset: () => void;
    jobOrderOptions: { id: number; no: string; productName: string; status: string }[];
    branchOptions: { id: number; name: string; code: string }[];
    materialOptions: { id: number; name: string; code: string }[];
    totalResults: number;
}

export default function WipFilters({
    filters,
    onFilterChange,
    onReset,
    jobOrderOptions,
    branchOptions,
    materialOptions,
    totalResults,
}: WipFiltersProps) {
    const joSelectOptions = useMemo(() => {
        return [
            { value: "all", label: "All Job Orders" },
            ...jobOrderOptions.map((jo) => ({
                value: String(jo.id),
                label: `${jo.no} - ${jo.productName}`,
                subLabel: `Status: ${jo.status}`,
            })),
        ];
    }, [jobOrderOptions]);

    const branchSelectOptions = useMemo(() => {
        return [
            { value: "all", label: "All Branches" },
            ...branchOptions.map((b) => ({
                value: String(b.id),
                label: b.name,
                subLabel: b.code,
            })),
        ];
    }, [branchOptions]);

    const materialSelectOptions = useMemo(() => {
        return [
            { value: "all", label: "All Materials" },
            ...materialOptions.map((m) => ({
                value: String(m.id),
                label: m.name,
                subLabel: m.code,
            })),
        ];
    }, [materialOptions]);

    const statusOptions = [
        { value: "all", label: "All WIP Statuses" },
        { value: "ISSUED_TO_PRODUCTION", label: "Issued to Production", badge: "On Floor" },
        { value: "PARTIALLY_CONSUMED", label: "Partially Consumed", badge: "In Progress" },
        { value: "RESERVED", label: "Reserved (Warehouse)", badge: "Storage" },
        { value: "CONSUMED", label: "Consumed", badge: "Completed" },
        { value: "RETURNED", label: "Returned", badge: "Restocked" },
        { value: "EXCEPTION", label: "Exceptions / Negative WIP", badge: "Alert" },
    ];

    const hasActiveFilters =
        filters.jobOrderId !== "all" ||
        filters.branchId !== "all" ||
        filters.materialId !== "all" ||
        filters.status !== "all" ||
        Boolean(filters.search.trim()) ||
        Boolean(filters.dateFrom) ||
        Boolean(filters.dateTo);

    return (
        <div className="rounded-xl border bg-card p-3 sm:p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    <span className="text-xs sm:text-sm font-semibold tracking-tight text-foreground">
                        WIP Inventory Filters
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {totalResults} {totalResults === 1 ? "record" : "records"}
                    </span>
                </div>
                {hasActiveFilters && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onReset}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset Filters
                    </Button>
                )}
            </div>

            {/* Filter controls grid */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search JO, material, lot batch..."
                        value={filters.search}
                        onChange={(e) => onFilterChange("search", e.target.value)}
                        className="h-9 pl-8 text-xs bg-background"
                    />
                </div>

                {/* Job Order Dropdown (Combobox) */}
                <div>
                    <SearchableSelect
                        options={joSelectOptions}
                        value={filters.jobOrderId}
                        onValueChange={(val) => onFilterChange("jobOrderId", val)}
                        placeholder="Filter by Job Order..."
                        searchPlaceholder="Type Job Order no..."
                    />
                </div>

                {/* Branch Dropdown (Combobox) */}
                <div>
                    <SearchableSelect
                        options={branchSelectOptions}
                        value={filters.branchId}
                        onValueChange={(val) => onFilterChange("branchId", val)}
                        placeholder="Filter by Branch..."
                        searchPlaceholder="Type Branch name..."
                    />
                </div>

                {/* WIP Status Dropdown (Combobox) */}
                <div>
                    <SearchableSelect
                        options={statusOptions}
                        value={filters.status}
                        onValueChange={(val) => onFilterChange("status", val)}
                        placeholder="Filter by WIP Status..."
                        searchPlaceholder="Type Status..."
                    />
                </div>
            </div>

            {/* Secondary row for Material and Date Range */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1 border-t">
                {/* Material Dropdown */}
                <div>
                    <SearchableSelect
                        options={materialSelectOptions}
                        value={filters.materialId}
                        onValueChange={(val) => onFilterChange("materialId", val)}
                        placeholder="Filter by Raw Material / Component..."
                        searchPlaceholder="Type Material name..."
                    />
                </div>

                {/* Date From */}
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">From:</span>
                    <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => onFilterChange("dateFrom", e.target.value)}
                        className="h-9 text-xs bg-background"
                    />
                </div>

                {/* Date To */}
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">To:</span>
                    <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => onFilterChange("dateTo", e.target.value)}
                        className="h-9 text-xs bg-background"
                    />
                </div>
            </div>
        </div>
    );
}
