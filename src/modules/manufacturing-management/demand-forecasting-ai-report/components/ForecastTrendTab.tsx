"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
    Area,
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis
} from "recharts";
import { ArrowDownRight, ArrowUpRight, BarChart3, MapPin, Package, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
    DemandForecastReportPayload,
    ScenarioAssumptions
} from "../types";
import {
    applyScenarioToTimeSeries,
    formatNumberOrDash,
    formatPercentOrDash
} from "../utils/scenarioMath";

interface ForecastTrendTabProps {
    payload: DemandForecastReportPayload;
    assumptions: ScenarioAssumptions;
    onOpenProductRegionEvidence: (
        title: string,
        subtitle: string,
        evidenceIds: string[],
        totalEvidenceCount: number
    ) => void;
}

export const ForecastTrendTab: React.FC<ForecastTrendTabProps> = ({
    payload,
    assumptions,
    onOpenProductRegionEvidence
}) => {
    const chartData = useMemo(
        () => applyScenarioToTimeSeries(payload.timeSeries, assumptions),
        [payload.timeSeries, assumptions]
    );

    const hasScenarioShift = assumptions.demandAdjustmentPct !== 0;

    const firstForecastLabel = useMemo(
        () => chartData.find((d) => d.isForecast)?.label,
        [chartData]
    );

    const hasAnyData = useMemo(
        () =>
            chartData.some(
                (d) =>
                    (d.actualUnits !== null && d.actualUnits > 0) ||
                    (d.forecastUnits !== null && d.forecastUnits > 0)
            ),
        [chartData]
    );

    const topProducts = useMemo(() => payload.productComparison.slice(0, 5), [payload.productComparison]);
    const topRegions = useMemo(() => payload.regionComparison.slice(0, 5), [payload.regionComparison]);

    const unitNote = payload.kpis.isMixedUnits
        ? `Combined across mixed units (${payload.kpis.activeUnits.join(", ")}) — filter by a single product for unit-specific totals.`
        : payload.kpis.activeUnits[0]
        ? `All volumes expressed in ${payload.kpis.activeUnits[0]}.`
        : "";

    return (
        <div className="space-y-4">
            {/* Hero Demand Forecast + Confidence Range Graph */}
            <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            Customer Demand Trajectory &amp; Expected Range
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                            Actual customer orders vs out-of-sample backtest and {payload.meta.forecastHorizonLabel.toLowerCase()} outlook ({assumptions.confidenceLevel}% confidence range). {unitNote}
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/80" />
                            Actual Orders
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-0.5 w-4 bg-slate-500 border-b border-dashed" />
                            Past Backtest
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                            Expected Demand
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2.5 w-3.5 rounded-sm bg-indigo-500/20 border border-indigo-500/40" />
                            {assumptions.confidenceLevel}% Range
                        </span>
                        {hasScenarioShift && (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-violet-600 dark:text-violet-400">
                                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                                Scenario ({assumptions.demandAdjustmentPct > 0 ? "+" : ""}
                                {assumptions.demandAdjustmentPct}%)
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="pt-2">
                    {!hasAnyData ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border/70 bg-muted/20"
                        >
                            <BarChart3 className="h-9 w-9 text-muted-foreground/50 mb-2.5" />
                            <p className="text-sm font-semibold text-foreground">
                                No Customer Order History in Selected Scope
                            </p>
                            <p className="text-xs text-muted-foreground max-w-md mt-1">
                                Try expanding the historical period or clearing the Branch, Product, or Customer Region filters.
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div
                            key={`${payload.meta.cadence}-${payload.meta.dateFrom}-${payload.meta.dateTo}-${assumptions.confidenceLevel}-${assumptions.demandAdjustmentPct}`}
                            initial={{ opacity: 0.35 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="h-[340px] w-full"
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    data={chartData}
                                    margin={{ top: 12, right: 20, left: 6, bottom: 8 }}
                                >
                                    <defs>
                                        <linearGradient id="piBandFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.28} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.07} />
                                        </linearGradient>
                                        <linearGradient id="actualBarFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.85} />
                                            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.35} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        stroke="hsl(var(--border))"
                                        opacity={0.55}
                                    />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                        tickLine={false}
                                        axisLine={false}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v) =>
                                            Number(v) >= 1000
                                                ? `${(Number(v) / 1000).toFixed(1)}k`
                                                : String(v)
                                        }
                                    />
                                    <RechartsTooltip
                                        content={({ active, payload: tipPayload, label }) => {
                                            if (!active || !tipPayload || tipPayload.length === 0) return null;
                                            const row = tipPayload[0]?.payload as (typeof chartData)[number];
                                            return (
                                                <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-3 shadow-xl text-xs space-y-1.5 min-w-[220px]">
                                                    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5">
                                                        <span className="font-bold text-foreground">{label}</span>
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                            {row.isForecast ? "Forecast" : "Historical"}
                                                        </Badge>
                                                    </div>
                                                    {!row.isForecast ? (
                                                        <>
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-muted-foreground">Actual Orders:</span>
                                                                <span className="font-bold text-sky-600 dark:text-sky-400">
                                                                    {formatNumberOrDash(row.actualUnits)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-muted-foreground">Past Backtest:</span>
                                                                <span className="font-semibold">
                                                                    {formatNumberOrDash(row.backtestForecastUnits)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-muted-foreground">Error / Bias:</span>
                                                                <span className="font-medium">
                                                                    {formatPercentOrDash(row.wapePct)} /{" "}
                                                                    {formatPercentOrDash(row.biasPct, 1, true)}
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground pt-0.5">
                                                                {row.orderCount} sales order(s)
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-muted-foreground">Expected Demand:</span>
                                                                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                                                                    {formatNumberOrDash(row.forecastUnits)}
                                                                </span>
                                                            </div>
                                                            {hasScenarioShift && (
                                                                <div className="flex justify-between gap-4">
                                                                    <span className="text-muted-foreground">Scenario Demand:</span>
                                                                    <span className="font-bold text-violet-600 dark:text-violet-400">
                                                                        {formatNumberOrDash(row.scenarioForecastUnits)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-muted-foreground">
                                                                    {assumptions.confidenceLevel}% Range:
                                                                </span>
                                                                <span className="font-semibold">
                                                                    {formatNumberOrDash(row.activePiLower)} –{" "}
                                                                    {formatNumberOrDash(row.activePiUpper)}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        }}
                                    />

                                    {firstForecastLabel && (
                                        <ReferenceLine
                                            x={firstForecastLabel}
                                            stroke="#6366f1"
                                            strokeDasharray="4 4"
                                            strokeOpacity={0.7}
                                            label={{
                                                value: "Forecast →",
                                                position: "insideTopRight",
                                                fill: "#6366f1",
                                                fontSize: 10,
                                                fontWeight: 700
                                            }}
                                        />
                                    )}

                                    <Area
                                        type="monotone"
                                        dataKey="piBandRange"
                                        stroke="none"
                                        fill="url(#piBandFill)"
                                        isAnimationActive={true}
                                        animationDuration={550}
                                        connectNulls={false}
                                    />

                                    <Bar
                                        dataKey="actualUnits"
                                        fill="url(#actualBarFill)"
                                        radius={[6, 6, 0, 0]}
                                        maxBarSize={36}
                                        isAnimationActive={true}
                                        animationDuration={500}
                                    />

                                    <Line
                                        type="monotone"
                                        dataKey="backtestForecastUnits"
                                        stroke="#64748b"
                                        strokeWidth={2}
                                        strokeDasharray="5 4"
                                        dot={{ r: 2.5, fill: "#64748b" }}
                                        activeDot={{ r: 4 }}
                                        isAnimationActive={true}
                                        animationDuration={550}
                                    />

                                    <Line
                                        type="monotone"
                                        dataKey="forecastUnits"
                                        stroke="#4f46e5"
                                        strokeWidth={2.5}
                                        dot={{ r: 3.5, fill: "#4f46e5", strokeWidth: 1.5, stroke: "#ffffff" }}
                                        activeDot={{ r: 5 }}
                                        isAnimationActive={true}
                                        animationDuration={600}
                                    />

                                    {hasScenarioShift && (
                                        <Line
                                            type="monotone"
                                            dataKey="scenarioForecastUnits"
                                            stroke="#9333ea"
                                            strokeWidth={2.5}
                                            strokeDasharray="3 3"
                                            dot={{ r: 3.5, fill: "#9333ea" }}
                                            activeDot={{ r: 5 }}
                                            isAnimationActive={true}
                                            animationDuration={450}
                                        />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </motion.div>
                    )}
                </CardContent>
            </Card>

            {/* Bottom 2-Column Drivers Strip: Top Products & Top Regions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Product Demand Drivers */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Package className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                            Top Products by Expected Demand
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Click any product to inspect the underlying Sales Orders
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {topProducts.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-8 text-center rounded-xl border border-dashed">
                                No active product demand records for current filters.
                            </div>
                        ) : (
                            topProducts.map((prod, idx) => {
                                const matchedMatrix = payload.matrixRows.filter(
                                    (r) => r.productId === prod.productId
                                );
                                const evIds = Array.from(
                                    new Set(matchedMatrix.flatMap((r) => r.evidenceIds))
                                );
                                const totalEv = matchedMatrix.reduce(
                                    (s, r) => s + r.totalEvidenceCount,
                                    0
                                );
                                return (
                                    <motion.button
                                        key={prod.productId}
                                        type="button"
                                        initial={{ opacity: 0, y: -6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, delay: idx * 0.04 }}
                                        onClick={() =>
                                            onOpenProductRegionEvidence(
                                                `${prod.productName} (${prod.productCode})`,
                                                `Expected ${formatNumberOrDash(prod.forecastUnits)} ${prod.unitLabel} · Historical Actual ${formatNumberOrDash(prod.actualUnits)} ${prod.unitLabel}`,
                                                evIds,
                                                totalEv
                                            )
                                        }
                                        className="w-full text-left rounded-xl border border-border/60 bg-muted/20 hover:bg-accent/50 px-3 py-2.5 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-foreground truncate">
                                                    {prod.productName}
                                                </span>
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                                    {prod.productCode}
                                                </Badge>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                                                <span>
                                                    Actual: {formatNumberOrDash(prod.actualUnits)} {prod.unitLabel}
                                                </span>
                                                <span>·</span>
                                                <span>WAPE: {formatPercentOrDash(prod.wapePct)}</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                                                {formatNumberOrDash(prod.forecastUnits)} {prod.unitLabel}
                                            </div>
                                            <div className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground mt-0.5">
                                                {prod.trendDirection === "Rising" ? (
                                                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                                                ) : prod.trendDirection === "Cooling" ? (
                                                    <ArrowDownRight className="h-3 w-3 text-amber-500" />
                                                ) : null}
                                                <span>
                                                    {prod.trendDirection} ({formatPercentOrDash(prod.trendPct, 1, true)})
                                                </span>
                                            </div>
                                        </div>
                                    </motion.button>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                {/* Top Customer Region Drivers */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            Regional Demand Mix
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Share of expected demand and forecast accuracy by Customer Region
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        {topRegions.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-8 text-center rounded-xl border border-dashed">
                                No customer region demand records for current filters.
                            </div>
                        ) : (
                            topRegions.map((reg, idx) => {
                                const matchedMatrix = payload.matrixRows.filter(
                                    (r) => r.regionKey === reg.regionKey
                                );
                                const evIds = Array.from(
                                    new Set(matchedMatrix.flatMap((r) => r.evidenceIds))
                                );
                                const totalEv = matchedMatrix.reduce(
                                    (s, r) => s + r.totalEvidenceCount,
                                    0
                                );
                                const safeSharePct = Number.isFinite(reg.sharePct)
                                    ? Math.min(100, Math.max(0, reg.sharePct))
                                    : 0;
                                return (
                                    <motion.button
                                        key={reg.regionKey}
                                        type="button"
                                        initial={{ opacity: 0, y: -6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, delay: idx * 0.04 }}
                                        onClick={() =>
                                            onOpenProductRegionEvidence(
                                                `Region: ${reg.regionLabel}`,
                                                `Share: ${formatPercentOrDash(reg.sharePct)} · Expected ${formatNumberOrDash(reg.forecastUnits)} · WAPE ${formatPercentOrDash(reg.wapePct)}`,
                                                evIds,
                                                totalEv
                                            )
                                        }
                                        className="w-full text-left rounded-xl border border-border/60 bg-muted/20 hover:bg-accent/50 p-2.5 transition-colors space-y-1.5 cursor-pointer"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-bold text-foreground truncate">
                                                {reg.regionLabel}
                                            </span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-xs font-black text-foreground">
                                                    {formatNumberOrDash(reg.forecastUnits)}
                                                </span>
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                    {formatPercentOrDash(reg.sharePct)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${safeSharePct}%` }}
                                                transition={{ duration: 0.45, delay: idx * 0.05 }}
                                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span>Actual: {formatNumberOrDash(reg.actualUnits)}</span>
                                            <span>
                                                WAPE: {formatPercentOrDash(reg.wapePct)} · Bias:{" "}
                                                {formatPercentOrDash(reg.biasPct, 1, true)}
                                            </span>
                                        </div>
                                    </motion.button>
                                );
                            })
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
