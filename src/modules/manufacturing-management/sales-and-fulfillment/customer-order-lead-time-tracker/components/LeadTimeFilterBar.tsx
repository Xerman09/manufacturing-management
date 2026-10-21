"use client";

import React, { useMemo } from "react";
import { Search, X } from "lucide-react";
import { BranchOption, CustomerOption, OrderLifecycleStatus } from "../types";
import { PeriodPreset } from "../hooks/useCustomerOrderLeadTimeTracker";
import { SearchableSelect, SearchableSelectOption } from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { Button } from "@/components/ui/button";

interface LeadTimeFilterBarProps {
    searchQuery: string;
    onSearchChange: (val: string) => void;
    branches: BranchOption[];
    selectedBranchId: number | null;
    onBranchChange: (id: number | null) => void;
    customers: CustomerOption[];
    selectedCustomerCode: string;
    onCustomerChange: (code: string) => void;
    selectedStatus: OrderLifecycleStatus | "All";
    onStatusChange: (status: OrderLifecycleStatus | "All") => void;
    selectedPeriod: PeriodPreset;
    onPeriodChange: (preset: PeriodPreset) => void;
    startDate: string;
    onStartDateChange: (date: string) => void;
    endDate: string;
    onEndDateChange: (date: string) => void;
    onResetFilters: () => void;
    totalOrders: number;
}

const statusOptions: Array<{ label: string; value: OrderLifecycleStatus | "All" }> = [
    { label: "All Orders", value: "All" },
    { label: "Open / In-Flight", value: "Open" },
    { label: "Completed", value: "Completed" },
    { label: "Missing Milestone", value: "Missing Milestone" },
    { label: "Cancelled", value: "Cancelled" },
];

const periodOptions: Array<{ label: string; value: PeriodPreset }> = [
    { label: "All Time", value: "all" },
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "Last 7 Days", value: "7d" },
    { label: "Last 30 Days", value: "30d" },
    { label: "This Month", value: "this_month" },
    { label: "Custom Range", value: "custom" },
];

export function LeadTimeFilterBar({
    searchQuery,
    onSearchChange,
    branches,
    selectedBranchId,
    onBranchChange,
    customers,
    selectedCustomerCode,
    onCustomerChange,
    selectedStatus,
    onStatusChange,
    selectedPeriod,
    onPeriodChange,
    startDate,
    onStartDateChange,
    endDate,
    onEndDateChange,
    onResetFilters,
    totalOrders,
}: LeadTimeFilterBarProps) {
    // Prepare SearchableSelect options for Branch
    const branchOptions = useMemo<SearchableSelectOption[]>(() => {
        const list: SearchableSelectOption[] = [
            {
                value: "all",
                label: "All Branches",
            },
        ];
        branches.forEach((b) => {
            list.push({
                value: String(b.id),
                label: b.branch_name,
                subLabel: b.branch_code ? `(${b.branch_code})` : undefined,
            });
        });
        return list;
    }, [branches]);

    // Prepare SearchableSelect options for Customer
    const customerOptions = useMemo<SearchableSelectOption[]>(() => {
        const list: SearchableSelectOption[] = [
            {
                value: "all",
                label: "All Customers",
            },
        ];
        customers.forEach((c) => {
            list.push({
                value: c.customer_code,
                label: c.customer_name,
                subLabel: c.customer_code,
            });
        });
        return list;
    }, [customers]);

    const hasActiveFilters =
        Boolean(searchQuery) ||
        selectedBranchId !== null ||
        Boolean(selectedCustomerCode) ||
        selectedStatus !== "All" ||
        selectedPeriod !== "all" ||
        Boolean(startDate) ||
        Boolean(endDate);

    return (
        <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm flex flex-col gap-3">
            {/* Top row: Status Tabs & Result Counter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                    {statusOptions.map((opt) => {
                        const isActive = selectedStatus === opt.value;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => onStatusChange(opt.value)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                }`}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>

                <div className="text-xs text-muted-foreground font-medium self-end sm:self-center">
                    Showing <span className="text-foreground font-bold">{totalOrders}</span> records
                </div>
            </div>

            {/* Filter controls row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-3 items-center">
                {/* Search SO #, PO #, Customer (span 3 on desktop) */}
                <div className="lg:col-span-3 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search SO #, PO #, customer..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all h-9"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => onSearchChange("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Branch Searchable Select (span 2 on desktop) */}
                <div className="lg:col-span-2">
                    <SearchableSelect
                        options={branchOptions}
                        value={selectedBranchId ? String(selectedBranchId) : "all"}
                        onValueChange={(val) => onBranchChange(val === "all" ? null : Number(val))}
                        placeholder="All Branches"
                        searchPlaceholder="Search branch name..."
                        className="w-full"
                        triggerClassName="h-9 text-xs rounded-lg border-input bg-background text-foreground"
                    />
                </div>

                {/* Customer Searchable Select (span 2 on desktop) */}
                <div className="lg:col-span-2">
                    <SearchableSelect
                        options={customerOptions}
                        value={selectedCustomerCode || "all"}
                        onValueChange={(val) => onCustomerChange(val === "all" ? "" : val)}
                        placeholder="All Customers"
                        searchPlaceholder="Search customer..."
                        className="w-full"
                        triggerClassName="h-9 text-xs rounded-lg border-input bg-background text-foreground"
                    />
                </div>

                {/* Period Preset Select (span 2 on desktop) */}
                <div className="lg:col-span-2">
                    <select
                        value={selectedPeriod}
                        onChange={(e) => onPeriodChange(e.target.value as PeriodPreset)}
                        className="w-full h-9 px-3 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                        {periodOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Paired From & To Date Controls (span 3 on desktop) */}
                <div className="lg:col-span-3 flex items-center gap-1.5">
                    <div className="relative flex-1">
                        <input
                            type="date"
                            title={selectedPeriod === "custom" ? "From Date (Editable)" : "From Date (Viewing only - select Custom Range to edit)"}
                            value={startDate}
                            disabled={selectedPeriod !== "custom"}
                            onChange={(e) => onStartDateChange(e.target.value)}
                            className={`w-full px-2 py-1.5 text-xs rounded-lg border border-input h-9 transition-all ${
                                selectedPeriod === "custom"
                                    ? "bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-text"
                                    : "bg-muted/50 text-muted-foreground/80 cursor-default opacity-85 select-none"
                            }`}
                        />
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">to</span>
                    <div className="relative flex-1">
                        <input
                            type="date"
                            title={selectedPeriod === "custom" ? "To Date (Editable)" : "To Date (Viewing only - select Custom Range to edit)"}
                            value={endDate}
                            disabled={selectedPeriod !== "custom"}
                            onChange={(e) => onEndDateChange(e.target.value)}
                            className={`w-full px-2 py-1.5 text-xs rounded-lg border border-input h-9 transition-all ${
                                selectedPeriod === "custom"
                                    ? "bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-text"
                                    : "bg-muted/50 text-muted-foreground/80 cursor-default opacity-85 select-none"
                            }`}
                        />
                    </div>
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onResetFilters}
                            title="Clear Filters"
                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
