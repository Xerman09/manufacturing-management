import React from "react";
import { Search, RotateCcw, Download, Calendar, Building2, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
    return (
        <div className="bg-card border border-border rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {/* Search */}
                <div className="relative sm:col-span-2">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search material SKU, name, or category..."
                        value={filters.search}
                        onChange={(e) => onFilterChange("search", e.target.value)}
                        className="pl-8 h-9 text-xs"
                    />
                </div>

                {/* Branch */}
                <div>
                    <Select
                        value={filters.branch_id === "ALL" ? "ALL" : String(filters.branch_id)}
                        onValueChange={(val) =>
                            onFilterChange("branch_id", val === "ALL" ? "ALL" : Number(val))
                        }
                    >
                        <SelectTrigger className="h-9 text-xs">
                            <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <SelectValue placeholder="Branch / Plant" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Branches</SelectItem>
                            {branches.map((b) => (
                                <SelectItem key={b.id} value={String(b.id)}>
                                    {b.branch_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Assessment Window (Months) */}
                <div>
                    <Select
                        value={String(filters.assessment_window_months)}
                        onValueChange={(val) =>
                            onFilterChange("assessment_window_months", Number(val))
                        }
                    >
                        <SelectTrigger className="h-9 text-xs">
                            <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <SelectValue placeholder="Assessment Window" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="0">All Recorded History</SelectItem>
                            <SelectItem value="1">Last 1 Month (30d)</SelectItem>
                            <SelectItem value="3">Last 3 Months (90d)</SelectItem>
                            <SelectItem value="5">Last 5 Months (150d)</SelectItem>
                            <SelectItem value="6">Last 6 Months (180d)</SelectItem>
                            <SelectItem value="12">Last 12 Months (1 Year)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Status */}
                <div>
                    <Select
                        value={filters.status}
                        onValueChange={(val) =>
                            onFilterChange("status", val as ProjectionStatus | "ALL")
                        }
                    >
                        <SelectTrigger className="h-9 text-xs">
                            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            <SelectValue placeholder="Projection Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="CRITICAL_SUPPLY">Critical (&le; 3 Days)</SelectItem>
                            <SelectItem value="LOW_SUPPLY">Low Stock (&le; 14 Days)</SelectItem>
                            <SelectItem value="ESTIMATED_SUPPLY">Adequate (&gt; 14 Days)</SelectItem>
                            <SelectItem value="INSUFFICIENT_HISTORY">Insufficient History</SelectItem>
                            <SelectItem value="NO_RECORDED_CONSUMPTION">No Consumption</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Product Type Filter */}
                {productTypes.length > 0 && (
                    <div>
                        <Select
                            value={filters.product_type}
                            onValueChange={(val) =>
                                onFilterChange("product_type", val)
                            }
                        >
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Product Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All Product Types</SelectItem>
                                {productTypes.map((pt) => (
                                    <SelectItem key={pt.id} value={pt.name}>
                                        {pt.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Working Days per Month Setting */}
                <div>
                    <Select
                        value={String(filters.working_days_per_month)}
                        onValueChange={(val) =>
                            onFilterChange("working_days_per_month", Number(val))
                        }
                    >
                        <SelectTrigger className="h-9 text-xs">
                            <span className="text-muted-foreground mr-1 text-[11px]">Cal:</span>
                            <SelectValue placeholder="Working Days" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="22">22 Days / Mo (5-day wk)</SelectItem>
                            <SelectItem value="26">26 Days / Mo (6-day wk)</SelectItem>
                            <SelectItem value="30">30 Days / Mo (Continuous)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
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
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reset
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onExport}
                        className="h-8 text-xs"
                    >
                        <Download className="h-3 w-3 mr-1" />
                        Export Projections
                    </Button>
                </div>
            </div>
        </div>
    );
}
