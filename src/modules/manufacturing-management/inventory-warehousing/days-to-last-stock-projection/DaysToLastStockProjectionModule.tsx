"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDaysToLastProjection } from "./hooks/useDaysToLastProjection";
import StockProjectionKpiCards from "./components/StockProjectionKpiCards";
import StockProjectionFilterBar from "./components/StockProjectionFilterBar";
import StockProjectionTable from "./components/StockProjectionTable";
import HistoryCoverageDrawer from "./components/HistoryCoverageDrawer";
import InsufficientHistoryAlert from "./components/InsufficientHistoryAlert";

export function DaysToLastStockProjection() {
    return <DaysToLastStockProjectionModule />;
}

export function DaysToLastStockProjectionModule() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            setMounted(true);
        });
    }, []);

    const {
        items,
        kpis,
        branches,
        productTypes,
        loading,
        filters,
        selectedMaterial,
        isDrawerOpen,
        handleFilterChange,
        resetFilters,
        handleOpenDrawer,
        handleCloseDrawer,
        handleExport,
        refresh,
    } = useDaysToLastProjection();

    if (!mounted) {
        return (
            <div className="space-y-4">
                <div className="h-24 w-full rounded-xl border border-border bg-card animate-pulse" />
                <div className="h-14 w-full rounded-xl border border-border bg-card animate-pulse" />
                <div className="h-96 w-full rounded-xl border border-border bg-card animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        Days to Last Stock Projection
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Planning estimate for inventory longevity using verified production consumption history.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        disabled={loading}
                        className="h-8 text-xs bg-background"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                        Recalculate Projections
                    </Button>
                </div>
            </div>

            {/* Insufficient History Alert Banner */}
            <InsufficientHistoryAlert
                count={kpis.insufficient_history_count}
                onViewGaps={() => handleFilterChange("status", "INSUFFICIENT_HISTORY")}
            />

            {/* 4 Executive KPI Cards */}
            <StockProjectionKpiCards
                kpis={kpis}
                loading={loading}
                onSelectStatusFilter={(status) => handleFilterChange("status", status)}
            />

            {/* Filter Bar with Search & Comboboxes */}
            <StockProjectionFilterBar
                filters={filters}
                branches={branches}
                productTypes={productTypes}
                totalCount={items.length}
                onFilterChange={handleFilterChange}
                onResetFilters={resetFilters}
                onExport={handleExport}
            />

            {/* Stock Longevity Data Table */}
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
            >
                <StockProjectionTable
                    items={items}
                    loading={loading}
                    onSelectMaterial={handleOpenDrawer}
                />
            </motion.div>

            {/* Historical Coverage & Formula Audit Drawer */}
            <HistoryCoverageDrawer
                item={selectedMaterial}
                open={isDrawerOpen}
                onClose={handleCloseDrawer}
            />
        </div>
    );
}

export default DaysToLastStockProjectionModule;
