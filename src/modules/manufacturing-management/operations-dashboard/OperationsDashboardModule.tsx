"use client";

import React, { useState } from "react";
import { Loader2, BarChart2, AlertOctagon, ChevronDown, ChevronUp } from "lucide-react";
import { useOperationsDashboard } from "./hooks/useOperationsDashboard";
import { OperationsHeader } from "./components/OperationsHeader";
import { OperationsKpiCards } from "./components/OperationsKpiCards";
import { OperationsChartsSection } from "./components/OperationsChartsSection";
import { PendingQueuesSection } from "./components/PendingQueuesSection";
import { ExceptionsGrid } from "./components/ExceptionsGrid";

export default function OperationsDashboardModule() {
    const {
        data,
        loading,
        error,
        isRefreshing,
        selectedBranchId,
        setSelectedBranchId,
        activeQueueTab,
        setActiveQueueTab,
        searchQuery,
        setSearchQuery,
        refresh,
    } = useOperationsDashboard();

    // Section collapse states
    const [showCharts, setShowCharts] = useState<boolean>(true);
    const [showExceptions, setShowExceptions] = useState<boolean>(true);

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center p-24 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-semibold">
                    Aggregating manufacturing queues, orders, and shop floor metrics...
                </span>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div role="alert" className="p-8 text-center bg-card border border-rose-500/30 rounded-xl space-y-3">
                <p className="text-sm font-bold text-rose-500">Failed to load operations dashboard</p>
                <p className="text-xs text-muted-foreground">{error}</p>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={isRefreshing}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                    Try Again
                </button>
                {selectedBranchId !== "all" && <button type="button" disabled={isRefreshing} onClick={() => setSelectedBranchId("all")} className="ml-3 px-4 py-2 rounded-lg border text-xs font-semibold">Reset branch filter</button>}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Top Operations Header */}
            <OperationsHeader
                isRefreshing={isRefreshing}
                onRefresh={refresh}
                branches={data?.branches ?? []}
                selectedBranchId={selectedBranchId}
                onBranchChange={setSelectedBranchId}
            />

            {/* KPI Cards Strip */}
            <OperationsKpiCards
                totals={data?.totals}
                activeTab={activeQueueTab}
                onSelectTab={setActiveQueueTab}
            />

            {/* Section Visibility Controls Toolbar */}
            <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Analytics &amp; Operational Views
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowCharts((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            showCharts
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <BarChart2 className="h-3.5 w-3.5" />
                        <span>{showCharts ? "Hide Visual Analytics" : "Show Visual Analytics"}</span>
                        {showCharts ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowExceptions((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            showExceptions
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                                : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <AlertOctagon className="h-3.5 w-3.5" />
                        <span>{showExceptions ? "Hide Exceptions" : "Show Exceptions"}</span>
                        {showExceptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                </div>
            </div>

            {/* Visual Analytics & Charts Section (with smooth collapse transition) */}
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    showCharts ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                }`}
            >
                <OperationsChartsSection data={data} />
            </div>

            {/* Exceptions and Escalations Strip (with smooth collapse transition) */}
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    showExceptions ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                }`}
            >
                <ExceptionsGrid exceptions={data?.exceptions ?? []} />
            </div>

            {/* Main Queues Grid with Start-Aligned Searchbar & Pagination */}
            <PendingQueuesSection
                data={data}
                activeTab={activeQueueTab}
                onSelectTab={setActiveQueueTab}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />
        </div>
    );
}
