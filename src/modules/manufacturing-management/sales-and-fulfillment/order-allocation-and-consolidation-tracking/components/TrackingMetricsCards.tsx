// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/components/TrackingMetricsCards.tsx

import React from "react";
import { motion } from "framer-motion";
import {
    Boxes,
    PackageCheck,
    AlertTriangle,
    Layers,
    TrendingUp,
} from "lucide-react";
import { TrackingMetrics } from "../types";

interface TrackingMetricsCardsProps {
    metrics: TrackingMetrics;
}

export const TrackingMetricsCards: React.FC<TrackingMetricsCardsProps> = ({ metrics }) => {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Total Orders Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.05 }}
                className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col justify-between"
                title="Total sales orders currently tracked in the fulfillment pipeline"
            >
                <div className="flex items-center justify-between">
                    <span
                        className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                        title="Total sales orders tracked across branches"
                    >
                        Tracked Orders
                    </span>
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Layers className="w-4 h-4" />
                    </div>
                </div>
                <div className="mt-2">
                    <div
                        className="text-2xl font-bold tracking-tight"
                        title={`${metrics.total_orders.toLocaleString()} total orders`}
                    >
                        {metrics.total_orders.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <span
                            className="flex items-center gap-1"
                            title="Orders where all ordered item lines are 100% allocated to inventory lots"
                        >
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            {metrics.fully_allocated_count} allocated
                        </span>
                        <span>•</span>
                        <span
                            className="flex items-center gap-1"
                            title="Orders where all ordered item lines are 100% physically picked and consolidated"
                        >
                            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                            {metrics.fully_consolidated_count} consolidated
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* 2. Overall Allocation Rate Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col justify-between"
                title="Quantity-weighted percentage of ordered items allocated to inventory lots"
            >
                <div className="flex items-center justify-between">
                    <span
                        className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider"
                        title="Quantity-weighted allocation progress across all active lines"
                    >
                        Allocation Rate (Qty-Weighted)
                    </span>
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Boxes className="w-4 h-4" />
                    </div>
                </div>
                <div className="mt-2">
                    <div
                        className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400"
                        title={`Overall Allocation Rate: ${metrics.overall_allocation_rate.toFixed(1)}%`}
                    >
                        {metrics.overall_allocation_rate.toFixed(1)}%
                    </div>
                    <div
                        className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden"
                        title={`Overall Allocation Progress: ${metrics.overall_allocation_rate.toFixed(1)}%`}
                    >
                        <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, metrics.overall_allocation_rate)}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                        <span title="Orders with partial inventory reservations">{metrics.partially_allocated_count} Partial</span>
                        <span title="Orders with no inventory allocations yet">{metrics.not_started_allocation_count} Unallocated</span>
                    </div>
                </div>
            </motion.div>

            {/* 3. Physical Consolidation Rate Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.15 }}
                className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col justify-between"
                title="Quantity-weighted percentage of ordered items physically picked and consolidated"
            >
                <div className="flex items-center justify-between">
                    <span
                        className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider"
                        title="Consolidation picking progress on warehouse floor"
                    >
                        Consolidation Progress
                    </span>
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        <PackageCheck className="w-4 h-4" />
                    </div>
                </div>
                <div className="mt-2">
                    <div className="flex items-baseline justify-between">
                        <div
                            className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400"
                            title={`Physical Picked Rate: ${metrics.overall_physical_consolidation_rate.toFixed(1)}%`}
                        >
                            {metrics.overall_physical_consolidation_rate.toFixed(1)}%
                        </div>
                        <span
                            className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium"
                            title={`Planned Consolidation Rate: ${metrics.overall_planned_consolidation_rate.toFixed(1)}%`}
                        >
                            <TrendingUp className="w-3 h-3 text-purple-500" />
                            {metrics.overall_planned_consolidation_rate.toFixed(1)}% Planned
                        </span>
                    </div>
                    <div
                        className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden relative"
                        title={`Physical Picks: ${metrics.overall_physical_consolidation_rate.toFixed(1)}% | Planned: ${metrics.overall_planned_consolidation_rate.toFixed(1)}%`}
                    >
                        {/* Planned background bar */}
                        <div
                            className="bg-purple-300 dark:bg-purple-900/60 h-1.5 absolute top-0 left-0 transition-all duration-500"
                            style={{ width: `${Math.min(100, metrics.overall_planned_consolidation_rate)}%` }}
                        />
                        {/* Physical picked foreground bar */}
                        <div
                            className="bg-indigo-600 h-1.5 absolute top-0 left-0 transition-all duration-500"
                            style={{ width: `${Math.min(100, metrics.overall_physical_consolidation_rate)}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                        <span title="Physical pick confirmations on the warehouse floor">Physical Picks</span>
                        <span title="Orders with picking currently in progress">{metrics.partially_consolidated_count} In Progress</span>
                    </div>
                </div>
            </motion.div>

            {/* 4. Operational Exceptions Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.2 }}
                className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${
                    metrics.total_exceptions_count > 0
                        ? "bg-amber-500/5 border-amber-300/40 text-amber-950 dark:text-amber-100"
                        : "bg-card text-card-foreground"
                }`}
                title="Total count of operational warnings, quantity mismatches, and picking exceptions requiring attention"
            >
                <div className="flex items-center justify-between">
                    <span
                        className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider"
                        title="Operational alerts and audit discrepancies"
                    >
                        Operational Alerts
                    </span>
                    <div
                        className={`p-2 rounded-lg ${
                            metrics.total_exceptions_count > 0
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-muted text-muted-foreground"
                        }`}
                    >
                        <AlertTriangle className="w-4 h-4" />
                    </div>
                </div>
                <div className="mt-2">
                    <div
                        className="text-2xl font-bold tracking-tight"
                        title={`${metrics.total_exceptions_count.toLocaleString()} total operational alerts`}
                    >
                        {metrics.total_exceptions_count.toLocaleString()}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px]">
                        {metrics.total_discrepancies > 0 && (
                            <span
                                className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-medium"
                                title="Stored order allocation header does not match underlying lot reservation records"
                            >
                                {metrics.total_discrepancies} Discrepancy
                            </span>
                        )}
                        {metrics.total_inconsistent_picks > 0 && (
                            <span
                                className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 font-medium"
                                title="Floor picks detected with added lots, substitutions, or pick quantity exceeding planned reserve"
                            >
                                {metrics.total_inconsistent_picks} Inconsistent Pick
                            </span>
                        )}
                        {metrics.total_excess_allocations > 0 && (
                            <span
                                className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-200 font-medium"
                                title="Total allocation or consolidation exceeds original ordered quantity"
                            >
                                {metrics.total_excess_allocations} Excess
                            </span>
                        )}
                        {metrics.total_exceptions_count === 0 && (
                            <span
                                className="text-muted-foreground text-xs"
                                title="All tracked orders are reconciled with zero operational exceptions"
                            >
                                All records reconciled
                            </span>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
