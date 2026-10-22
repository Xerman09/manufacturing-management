"use client";

import React from "react";
import { Clock, CheckCircle2, AlertTriangle, RefreshCw, TrendingUp } from "lucide-react";
import { LeadTimeSummaryKPIs } from "../types";
import { Button } from "@/components/ui/button";

interface LeadTimeHeaderProps {
    kpis: LeadTimeSummaryKPIs;
    isLoading: boolean;
    onRefresh: () => void;
}

export function LeadTimeHeader({ kpis, isLoading, onRefresh }: LeadTimeHeaderProps) {
    return (
        <div className="flex flex-col gap-4">
            {/* Title & Refresh */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Clock className="w-7 h-7 text-primary" />
                        Customer Order Lead Time Tracker
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Lifecycle duration monitoring, milestone timestamps, and latency detection from SO creation to final delivery.
                    </p>
                </div>
                <Button
                    onClick={onRefresh}
                    disabled={isLoading}
                    variant="outline"
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium border-border bg-card text-foreground hover:bg-muted shadow-sm transition-all"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-primary" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Total Orders Tracked */}
                <div className="bg-card text-card-foreground border border-border rounded-xl p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-medium uppercase tracking-wider">Tracked Orders</span>
                        <TrendingUp className="w-4 h-4 text-muted-foreground/70" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-foreground">
                            {kpis.totalTrackedOrders}
                        </span>
                        <span className="text-xs text-muted-foreground">total</span>
                    </div>
                </div>

                {/* Average Lead Time */}
                <div className="bg-card text-card-foreground border border-border rounded-xl p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-medium uppercase tracking-wider">Avg Lead Time</span>
                        <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-primary">
                            {kpis.averageLeadTimeDays}
                        </span>
                        <span className="text-xs text-muted-foreground">days</span>
                    </div>
                </div>

                {/* Open / Ongoing Orders */}
                <div className="bg-card text-card-foreground border border-border rounded-xl p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-medium uppercase tracking-wider">Ongoing In-Flight</span>
                        <Clock className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                            {kpis.openOrdersCount}
                        </span>
                        <span className="text-xs text-muted-foreground">active</span>
                    </div>
                </div>

                {/* Completed Orders */}
                <div className="bg-card text-card-foreground border border-border rounded-xl p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-medium uppercase tracking-wider">Completed</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                            {kpis.completedOrdersCount}
                        </span>
                        <span className="text-xs text-muted-foreground">delivered</span>
                    </div>
                </div>

                {/* Flagged / Anomalies */}
                <div className="bg-card text-card-foreground border border-border rounded-xl p-3.5 shadow-sm col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-medium uppercase tracking-wider">Missing Milestones</span>
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-destructive">
                            {kpis.flaggedMissingMilestonesCount}
                        </span>
                        {kpis.negativeDurationCount > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
                                {kpis.negativeDurationCount} neg
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
