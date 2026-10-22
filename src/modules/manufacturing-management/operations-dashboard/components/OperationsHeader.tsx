"use client";

import React, { useMemo } from "react";
import { RefreshCw, Building2, ShieldCheck } from "lucide-react";
import { DashboardBranch } from "../types/operations-dashboard.types";
import {
    SearchableSelect,
    SearchableSelectOption,
} from "@/modules/manufacturing-management/shared/components/SearchableSelect";

interface OperationsHeaderProps {
    isRefreshing: boolean;
    onRefresh: () => void;
    branches: DashboardBranch[];
    selectedBranchId: string;
    onBranchChange: (branchId: string) => void;
}

export const OperationsHeader: React.FC<OperationsHeaderProps> = ({
    isRefreshing,
    onRefresh,
    branches,
    selectedBranchId,
    onBranchChange,
}) => {
    const branchOptions: SearchableSelectOption[] = useMemo(() => {
        const list: SearchableSelectOption[] = [
            { value: "all", label: "All Branches" },
        ];
        branches.forEach((b) => {
            list.push({
                value: String(b.id),
                label: b.branch_name,
            });
        });
        return list;
    }, [branches]);

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border/70 p-4 rounded-xl shadow-xs">
            <div>
                <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h1 className="text-xl font-bold tracking-tight text-foreground">
                        Manufacturing Operations Dashboard
                    </h1>
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        <ShieldCheck className="h-3 w-3" /> Operations Cockpit
                    </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time consolidated view of order progress, shop-floor queues, and active exceptions.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                {/* Searchable Branch Filter */}
                <div className="flex items-center gap-1.5 min-w-[220px]">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                        <SearchableSelect
                            options={branchOptions}
                            value={selectedBranchId}
                            onValueChange={onBranchChange}
                            placeholder="Select Branch..."
                            searchPlaceholder="Search branch name..."
                            className="h-8 text-xs bg-muted/30 border-border"
                        />
                    </div>
                </div>

                {/* Clean Refresh Button */}
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                    <span>{isRefreshing ? "Syncing..." : "Refresh"}</span>
                </button>
            </div>
        </div>
    );
};
