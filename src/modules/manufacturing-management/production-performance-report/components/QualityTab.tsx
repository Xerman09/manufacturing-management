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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WrappedAxisTick } from "./WrappedAxisTick";
import type { QualityIntelligenceReportPayload } from "../types";

interface QualityTabProps {
    payload: QualityIntelligenceReportPayload;
}

export const QualityTab: React.FC<QualityTabProps> = ({ payload }) => {
    const qaParams = payload.qaParameterSummary || [];
    const pareto = payload.defectPareto || [];

    return (
        <div className="space-y-4">
            {/* Row 1: Defect Pareto Analysis */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-base font-bold">Defect Pareto Analysis</CardTitle>
                            <CardDescription className="text-xs">
                                80/20 loss driver distribution: failed test alongside cumulative percentage
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                            {pareto.length} Defect Categories
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="pt-2">
                    {pareto.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
                            No failed QA parameters recorded for the evaluated job orders.
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
                                                    <div className="font-bold">{d.defectLabel}</div>
                                                    <div className="flex justify-between gap-4 text-rose-600 dark:text-rose-400">
                                                        <span>Defect Qty:</span>
                                                        <span className="font-semibold">
                                                            {d.quantity.toLocaleString()} units
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-blue-600 dark:text-blue-400">
                                                        <span>Cumulative Share:</span>
                                                        <span className="font-semibold">
                                                            {d.cumulativePct}%
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
                                        dataKey="quantity"
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

            {/* Row 2: QA Parameters Pass Rate */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold">
                        Inspection Parameter Pass Rates
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Pass rate (%) ranked from lowest to highest; critical parameters flagged
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                    {qaParams.length === 0 ? (
                        <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">
                            No QA parameter checks logged for evaluated job orders.
                        </div>
                    ) : (
                        <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                            {qaParams.map((p) => {
                                const passPct = p.passRatePct ?? 0;
                                const isLow = passPct < 90;
                                return (
                                    <div
                                        key={p.parameterId}
                                        className="p-2.5 rounded-xl border border-border/60 bg-muted/20 space-y-1.5"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {p.isCritical ? (
                                                    <Badge
                                                        variant="destructive"
                                                        className="text-[9px] px-1.5 py-0 h-4 shrink-0 uppercase tracking-wider"
                                                    >
                                                        Critical
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[9px] px-1.5 py-0 h-4 shrink-0"
                                                    >
                                                        Standard
                                                    </Badge>
                                                )}
                                                <span className="text-xs font-semibold truncate">
                                                    {p.parameterName}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <span
                                                    className={`text-xs font-bold ${
                                                        isLow
                                                            ? "text-rose-600 dark:text-rose-400"
                                                            : "text-emerald-600 dark:text-emerald-400"
                                                    }`}
                                                >
                                                    {p.passRatePct !== null ? `${p.passRatePct}%` : "-"}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    ({p.passedChecks}/{p.totalChecks})
                                                </span>
                                            </div>
                                        </div>

                                        {/* Visual Progress Bar */}
                                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    isLow ? "bg-rose-500" : "bg-emerald-500"
                                                }`}
                                                style={{ width: `${Math.min(100, passPct)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
