"use client";

import React from "react";
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";
import { Boxes, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WrappedAxisTick } from "./WrappedAxisTick";
import { safeFormatNumber, safeFormatPercent } from "../utils/qualityMath";
import type { QualityReportPayload } from "../types";

interface QualityOverviewTabProps {
    payload: QualityReportPayload;
}

export const QualityOverviewTab: React.FC<QualityOverviewTabProps> = ({ payload }) => {
    const pareto = payload.defectPareto || [];
    const trend = payload.trendSeries || [];
    const kpis = payload.kpis;

    return (
        <div className="space-y-4">
            {/* Row 1: Defect Pareto Analysis */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-base font-bold">Defect Pareto Analysis</CardTitle>
                            <CardDescription className="text-xs">
                                80/20 failure distribution: Defect parameter units alongside cumulative percentage
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                            {pareto.length} Failure Categories
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="pt-2">
                    {pareto.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
                            No defect inspection parameter failures recorded in this period.
                        </div>
                    ) : (
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    data={pareto}
                                    margin={{ top: 10, right: 20, left: 10, bottom: 25 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        className="stroke-muted/40"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="defectLabel"
                                        tick={<WrappedAxisTick />}
                                        interval={0}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        tick={{ fontSize: 10 }}
                                        className="text-muted-foreground fill-muted-foreground"
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        domain={[0, 100]}
                                        unit="%"
                                        tick={{ fontSize: 10 }}
                                        className="text-muted-foreground fill-muted-foreground"
                                    />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="rounded-xl border border-border/80 bg-background/95 backdrop-blur-sm p-2.5 shadow-lg text-xs space-y-1">
                                                    <div className="font-bold flex items-center gap-1.5">
                                                        <span>{d.defectLabel}</span>
                                                        {d.isCritical && (
                                                            <Badge variant="destructive" className="text-[9px] py-0 px-1">
                                                                Critical
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-rose-600 dark:text-rose-400">
                                                        <span>Defect Qty:</span>
                                                        <span className="font-semibold">
                                                            {d.defectQuantity.toLocaleString()} units
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-slate-600 dark:text-slate-400">
                                                        <span>Defective Units:</span>
                                                        <span className="font-semibold">
                                                            {d.defectiveUnits.toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-blue-600 dark:text-blue-400">
                                                        <span>Cumulative Share:</span>
                                                        <span className="font-semibold">{d.cumulativePct}%</span>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="top"
                                        height={32}
                                        wrapperStyle={{ fontSize: "11px" }}
                                    />
                                    <Bar
                                        yAxisId="left"
                                        dataKey="defectQuantity"
                                        name="Defect Units"
                                        fill="#f43f5e"
                                        radius={[4, 4, 0, 0]}
                                    />
                                    <Line
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="cumulativePct"
                                        name="Cumulative %"
                                        stroke="#3b82f6"
                                        strokeWidth={2.5}
                                        dot={{ r: 4, fill: "#3b82f6" }}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Row 2: Trend Series (Defect Rate, Scrap Rate, FPY) */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-base font-bold">
                                Quality & Yield Chronological Trends
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Daily progression of First Pass Yield (FPY), Defect Rate, and Scrap Rate
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                            {trend.length} Days Evaluated
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="pt-2">
                    {trend.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
                            No production activity logged within the selected date range.
                        </div>
                    ) : (
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={trend}
                                    margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        className="stroke-muted/40"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="periodLabel"
                                        tick={{ fontSize: 10 }}
                                        className="text-muted-foreground fill-muted-foreground"
                                    />
                                    <YAxis
                                        domain={[0, 100]}
                                        unit="%"
                                        tick={{ fontSize: 10 }}
                                        className="text-muted-foreground fill-muted-foreground"
                                    />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="rounded-xl border border-border/80 bg-background/95 backdrop-blur-sm p-2.5 shadow-lg text-xs space-y-1">
                                                    <div className="font-bold">{d.date}</div>
                                                    <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                                                        <span>First Pass Yield:</span>
                                                        <span className="font-semibold">
                                                            {safeFormatPercent(d.fpyPct)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-rose-600 dark:text-rose-400">
                                                        <span>Defect Rate:</span>
                                                        <span className="font-semibold">
                                                            {safeFormatPercent(d.defectRatePct)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-amber-600 dark:text-amber-400">
                                                        <span>Scrap Rate:</span>
                                                        <span className="font-semibold">
                                                            {safeFormatPercent(d.scrapRatePct)}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                                                        Inspected: {d.inspectedQty.toLocaleString()} units
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="top"
                                        height={32}
                                        wrapperStyle={{ fontSize: "11px" }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="fpyPct"
                                        name="First Pass Yield (FPY %)"
                                        stroke="#10b981"
                                        strokeWidth={2.5}
                                        dot={{ r: 3.5, fill: "#10b981" }}
                                        connectNulls
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="defectRatePct"
                                        name="Defect Rate %"
                                        stroke="#f43f5e"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: "#f43f5e" }}
                                        connectNulls
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="scrapRatePct"
                                        name="Scrap Rate %"
                                        stroke="#f59e0b"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                        dot={{ r: 2.5, fill: "#f59e0b" }}
                                        connectNulls
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Row 3: Defective Units vs Number of Defects Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Boxes className="h-4 w-4 text-blue-500" />
                            Defective Units vs. Total Defect Count
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Distinction between physical units affected and multi-parameter test failures
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 text-xs space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl border border-border/70 bg-muted/20">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground">
                                    Physical Defective Units
                                </div>
                                <div className="text-2xl font-extrabold text-foreground mt-1">
                                    {safeFormatNumber(kpis.totalDefectiveUnits)}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                    Total units rejected or placed on hold
                                </div>
                            </div>
                            <div className="p-3 rounded-xl border border-border/70 bg-muted/20">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground">
                                    Recorded Defect Points
                                </div>
                                <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                                    {safeFormatNumber(
                                        pareto.reduce((sum, d) => sum + d.defectQuantity, 0)
                                    )}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                    Sum of all failed inspection criteria
                                </div>
                            </div>
                        </div>
                        <p className="text-muted-foreground leading-relaxed text-[11px]">
                            * Units requiring rework or failing multiple criteria register multiple defect counts, but represent a single defective unit count for inventory balancing.
                        </p>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            First Pass Yield (FPY) Integrity Rule
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Standard manufacturing yield criteria excluding rework
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 text-xs space-y-3">
                        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                                    First Pass Yield:
                                </span>
                                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                                    {safeFormatPercent(kpis.fpyPct)}
                                </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Calculated strictly as units that passed all in-process QA checkpoints on the initial run. Batches with QA Hold statuses, dispositions, or replacement job orders are excluded from First Pass Yield.
                            </p>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                            <span>Evaluated Job Orders: <strong>{kpis.totalJobOrders}</strong></span>
                            <span>Repeat Defect Types: <strong>{kpis.repeatDefectCount}</strong></span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
