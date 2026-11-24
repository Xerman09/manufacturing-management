"use client";

import React from "react";
import {
    Area,
    AreaChart,
    Bar,
    CartesianGrid,
    Cell,
    ComposedChart,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    BarChart
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WrappedAxisTick } from "./WrappedAxisTick";
import type { QualityIntelligenceReportPayload } from "../types";

interface OverviewTabProps {
    payload: QualityIntelligenceReportPayload;
}

const LOSS_COLORS: Record<string, string> = {
    product: "#3b82f6",
    work_center: "#f59e0b",
    route: "#8b5cf6",
    defect: "#ef4444"
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ payload }) => {
    const trendData = payload.trendSeries || [];
    const topLoss = payload.topLossDrivers || [];

    return (
        <div className="space-y-4">
            {/* Row 1: Dual Charts - Yield & Scrap Trend + Top Loss Drivers */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 2 Cols: Production Yield & Scrap Trend */}
                <Card className="lg:col-span-2 rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <CardTitle className="text-base font-bold">
                                    Production Yield & Scrap Trend
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Yield rate (%) alongside scrap volume across scheduled production dates
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                                {trendData.length} Data Points
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                        {trendData.length === 0 ? (
                            <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
                                No production trend data recorded in this period.
                            </div>
                        ) : (
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart
                                        data={trendData}
                                        margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            className="stroke-muted/40"
                                            vertical={false}
                                        />
                                        <XAxis
                                            dataKey="periodLabel"
                                            tick={<WrappedAxisTick />}
                                            interval={0}
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            domain={[0, 100]}
                                            tick={{ fontSize: 10 }}
                                            unit="%"
                                            className="text-muted-foreground fill-muted-foreground"
                                        />
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            tick={{ fontSize: 10 }}
                                            className="text-muted-foreground fill-muted-foreground"
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="rounded-xl border border-border/80 bg-background/95 backdrop-blur-sm p-2.5 shadow-lg text-xs space-y-1">
                                                        <div className="font-bold text-foreground">
                                                            {d.date}
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                                                            <span>Yield Rate:</span>
                                                            <span className="font-semibold">
                                                                {d.yieldRatePct !== null
                                                                    ? `${d.yieldRatePct}%`
                                                                    : "-"}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 text-amber-600 dark:text-amber-400">
                                                            <span>Scrap Rate:</span>
                                                            <span className="font-semibold">
                                                                {d.scrapRatePct !== null
                                                                    ? `${d.scrapRatePct}%`
                                                                    : "-"}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 text-muted-foreground">
                                                            <span>Batches:</span>
                                                            <span className="font-semibold">
                                                                {d.jobOrderCount}
                                                            </span>
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
                                            yAxisId="right"
                                            dataKey="scrapRatePct"
                                            name="Scrap Rate (%)"
                                            fill="#f59e0b"
                                            opacity={0.4}
                                            radius={[4, 4, 0, 0]}
                                        />
                                        <Line
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="yieldRatePct"
                                            name="Yield Rate (%)"
                                            stroke="#10b981"
                                            strokeWidth={2.5}
                                            dot={{ r: 3, fill: "#10b981" }}
                                            activeDot={{ r: 5 }}
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 1 Col: Top Loss Drivers */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-bold">Top Loss Drivers</CardTitle>
                        <CardDescription className="text-xs">
                            Products & stations generating highest cumulative scrap & rejected volume
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                        {topLoss.length === 0 ? (
                            <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
                                No loss drivers recorded for selected filter.
                            </div>
                        ) : (
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={topLoss.slice(0, 5)}
                                        layout="vertical"
                                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            className="stroke-muted/40"
                                            horizontal={false}
                                        />
                                        <XAxis
                                            type="number"
                                            tick={{ fontSize: 10 }}
                                            className="text-muted-foreground fill-muted-foreground"
                                        />
                                        <YAxis
                                            dataKey="label"
                                            type="category"
                                            width={100}
                                            tick={{ fontSize: 9 }}
                                            className="text-muted-foreground fill-muted-foreground"
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="rounded-xl border border-border/80 bg-background/95 backdrop-blur-sm p-2 shadow-lg text-xs space-y-1">
                                                        <div className="font-bold">{d.label}</div>
                                                        <div className="text-muted-foreground capitalize">
                                                            Type: {d.lossType.replace("_", " ")}
                                                        </div>
                                                        <div className="font-semibold text-rose-600 dark:text-rose-400">
                                                            Loss: {d.lossQty.toLocaleString()} units
                                                        </div>
                                                        {d.percentageOfTotal && (
                                                            <div className="text-[10px] text-muted-foreground">
                                                                {d.percentageOfTotal}% of total loss
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="lossQty" name="Loss Units" radius={[0, 4, 4, 0]}>
                                            {topLoss.slice(0, 5).map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={LOSS_COLORS[entry.lossType] || "#3b82f6"}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Row 2: Rejection Volume Trend */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold">Defect & Rejection Volume Trend</CardTitle>
                    <CardDescription className="text-xs">
                        Daily finished units flagged or rejected during in-process or release inspection
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                    {trendData.length === 0 ? (
                        <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                            No rejection events in selected range.
                        </div>
                    ) : (
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={trendData}
                                    margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                                >
                                    <defs>
                                        <linearGradient id="rejectionGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        className="stroke-muted/40"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="periodLabel"
                                        tick={<WrappedAxisTick />}
                                        interval={0}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10 }}
                                        className="text-muted-foreground fill-muted-foreground"
                                    />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="rounded-xl border border-border/80 bg-background/95 backdrop-blur-sm p-2 shadow-lg text-xs space-y-1">
                                                    <div className="font-bold">{d.date}</div>
                                                    <div className="text-rose-600 dark:text-rose-400 font-semibold">
                                                        Rejected: {d.rejectedQty} units
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="rejectedQty"
                                        name="Rejected Units"
                                        stroke="#ef4444"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#rejectionGrad)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
