"use client";

import React from "react";
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";
import {  Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WrappedAxisTick } from "./WrappedAxisTick";
import type { QualityIntelligenceReportPayload } from "../types";

interface BottleneckTabProps {
    payload: QualityIntelligenceReportPayload;
}

export const BottleneckTab: React.FC<BottleneckTabProps> = ({ payload }) => {
    const wcData = payload.workCenterThroughput || [];
    const heatmap = payload.routeHeatmap || [];
    const downtime = payload.downtimeEvents || [];

    const getScrapBadgeTone = (rate: number | null) => {
        if (rate === null || rate === undefined) return "bg-muted text-muted-foreground";
        if (rate <= 2) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
        if (rate <= 5) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
        return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
    };

    return (
        <div className="space-y-4">
            {/* Row 1: Work Center Throughput & Utilization */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-base font-bold">
                                Work Center Throughput & Capacity Utilization
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Actual output volume compared to design hourly capacity across stations
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                            {wcData.length} Stations Active
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="pt-2">
                    {wcData.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
                            No active work center throughput recorded in this period.
                        </div>
                    ) : (
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    data={wcData}
                                    margin={{ top: 10, right: 20, left: 10, bottom: 25 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        className="stroke-muted/40"
                                        vertical={false}
                                    />
                                    <XAxis
                                        dataKey="workCenterName"
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
                                                    <div className="font-bold text-foreground">
                                                        {d.workCenterName}
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-blue-600 dark:text-blue-400">
                                                        <span>Actual Output:</span>
                                                        <span className="font-semibold">
                                                            {d.actualQty.toLocaleString()} units
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-muted-foreground">
                                                        <span>Est. Capacity:</span>
                                                        <span className="font-semibold">
                                                            {d.capacityQty ? d.capacityQty.toLocaleString() : "-"} units
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-cyan-600 dark:text-cyan-400">
                                                        <span>Capacity Utilization:</span>
                                                        <span className="font-semibold">
                                                            {d.utilizationPct !== null ? `${d.utilizationPct}%` : "-"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-amber-600 dark:text-amber-400">
                                                        <span>Station Scrap Rate:</span>
                                                        <span className="font-semibold">
                                                            {d.avgScrapRatePct !== null ? `${d.avgScrapRatePct}%` : "-"}
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
                                        yAxisId="left"
                                        dataKey="actualQty"
                                        name="Actual Units"
                                        fill="#3b82f6"
                                        radius={[4, 4, 0, 0]}
                                    />
                                    <Line
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="utilizationPct"
                                        name="Utilization (%)"
                                        stroke="#06b6d4"
                                        strokeWidth={2}
                                        dot={{ r: 4, fill: "#06b6d4" }}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Row 2: Route Scrap Heatmap & Asset Downtime Events */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Route Step Scrap Heatmap */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-bold">Route Step Scrap Matrix</CardTitle>
                        <CardDescription className="text-xs">
                            Scrap intensity across sequential manufacturing operations
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                        {heatmap.length === 0 ? (
                            <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">
                                No routing step yield records available.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {heatmap.map((cell, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                                                {cell.sequenceOrder ?? "–"}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold truncate">
                                                    {cell.operationName}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground truncate">
                                                    {cell.ledgerRowCount} shift entries logged
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right">
                                                <div className="text-xs font-semibold">
                                                    {cell.yieldQty ? `${cell.yieldQty.toLocaleString()} units` : "-"}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">Output</div>
                                            </div>

                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] font-bold px-2 py-0.5 ${getScrapBadgeTone(
                                                    cell.scrapRatePct
                                                )}`}
                                            >
                                                {cell.scrapRatePct !== null ? `${cell.scrapRatePct}% Scrap` : "-"}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Asset Downtime & Maintenance Events */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <CardTitle className="text-base font-bold">
                                    Equipment Downtime & Maintenance
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Unplanned breakdown logs impacting production throughput
                                </CardDescription>
                            </div>
                            <Wrench className="h-4 w-4 text-orange-500" />
                        </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                        {downtime.length === 0 ? (
                            <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">
                                No equipment breakdown events logged in this period.
                            </div>
                        ) : (
                            <div className="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
                                {downtime.map((dt) => (
                                    <div
                                        key={dt.id}
                                        className="p-3 rounded-xl border border-orange-500/20 bg-orange-500/5 space-y-1.5"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-bold text-foreground">
                                                {dt.assetName}
                                            </span>
                                            <Badge
                                                variant="secondary"
                                                className="text-[10px] font-semibold bg-orange-500/15 text-orange-700 dark:text-orange-300"
                                            >
                                                {dt.durationHrs} hrs halt
                                            </Badge>
                                        </div>

                                        {dt.breakdownCategory && (
                                            <div className="text-[10px] font-semibold text-muted-foreground">
                                                Category: {dt.breakdownCategory}
                                            </div>
                                        )}

                                        {dt.rootCause && (
                                            <div className="text-xs text-muted-foreground">
                                                <strong className="text-foreground/80">Cause:</strong> {dt.rootCause}
                                            </div>
                                        )}

                                        {dt.correctiveAction && (
                                            <div className="text-xs text-muted-foreground">
                                                <strong className="text-foreground/80">Action:</strong> {dt.correctiveAction}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
