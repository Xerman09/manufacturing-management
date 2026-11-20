"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis
} from "recharts";
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ExternalLink,
    Gauge,
    Scale
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DemandForecastReportPayload } from "../types";
import { formatNumberOrDash, formatPercentOrDash } from "../utils/scenarioMath";

interface AccuracyBiasTabProps {
    payload: DemandForecastReportPayload;
    onOpenEvidence: (
        title: string,
        subtitle: string,
        evidenceIds: string[],
        totalEvidenceCount: number
    ) => void;
}

export const AccuracyBiasTab: React.FC<AccuracyBiasTabProps> = ({
    payload,
    onOpenEvidence
}) => {
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);

    const accuracySeries = useMemo(
        () =>
            payload.timeSeries
                .filter((pt) => !pt.isForecast && pt.backtestForecastUnits !== null)
                .map((pt) => ({
                    label: pt.label,
                    wapePct: pt.wapePct,
                    biasPct: pt.biasPct,
                    actualUnits: pt.actualUnits,
                    backtestForecastUnits: pt.backtestForecastUnits,
                    absErrorUnits: pt.absErrorUnits
                })),
        [payload.timeSeries]
    );

    const errorSpotlight = useMemo(
        () =>
            [...payload.matrixRows]
                .filter((r) => r.absErrorUnits > 0 || r.wapePct !== null)
                .sort((a, b) => b.absErrorUnits - a.absErrorUnits),
        [payload.matrixRows]
    );

    const totalRows = errorSpotlight.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRows);

    const paginatedSpotlight = useMemo(
        () => errorSpotlight.slice(startIndex, endIndex),
        [errorSpotlight, startIndex, endIndex]
    );

    const visiblePageNumbers = useMemo(() => {
        if (totalPages <= 5) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        if (safePage <= 3) {
            return [1, 2, 3, 4, "ellipsis-end", totalPages] as const;
        }
        if (safePage >= totalPages - 2) {
            return [1, "ellipsis-start", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
        }
        return [1, "ellipsis-start", safePage - 1, safePage, safePage + 1, "ellipsis-end", totalPages] as const;
    }, [totalPages, safePage]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* WAPE % Trend Chart (always includes 15% Target line in Y-axis domain) */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            Forecast Error Trend — WAPE (%)
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Out-of-sample error over time (sum of absolute forecast errors ÷ evaluated actual demand × 100 · target ≤ 15%)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {accuracySeries.length === 0 ? (
                            <div className="py-14 text-center text-xs text-muted-foreground rounded-xl border border-dashed">
                                Need at least 2 historical periods with customer orders to chart forecast accuracy.
                            </div>
                        ) : (
                            <div className="h-[260px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={accuracySeries}
                                        margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                                    >
                                        <defs>
                                            <linearGradient id="wapeFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            vertical={false}
                                            stroke="hsl(var(--border))"
                                            opacity={0.5}
                                        />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            domain={[
                                                0,
                                                (dataMax: number) =>
                                                    Math.max(20, Math.ceil((Number.isFinite(dataMax) ? dataMax : 20) * 1.15))
                                            ]}
                                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v) => `${v}%`}
                                        />
                                        <ReferenceLine
                                            y={15}
                                            stroke="#f59e0b"
                                            strokeDasharray="4 4"
                                            label={{
                                                value: "15% Target",
                                                position: "insideTopRight",
                                                fill: "#f59e0b",
                                                fontSize: 10,
                                                fontWeight: 700
                                            }}
                                        />
                                        <RechartsTooltip
                                            content={({ active, payload: tipPayload, label }) => {
                                                if (!active || !tipPayload || tipPayload.length === 0) return null;
                                                const d = tipPayload[0]?.payload as (typeof accuracySeries)[number];
                                                return (
                                                    <div className="rounded-xl border border-border/80 bg-popover/95 p-2.5 shadow-lg text-xs space-y-1">
                                                        <div className="font-bold">{label}</div>
                                                        <div>
                                                            WAPE:{" "}
                                                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                                {formatPercentOrDash(d.wapePct)}
                                                            </span>
                                                        </div>
                                                        <div className="text-muted-foreground">
                                                            Abs Error: {formatNumberOrDash(d.absErrorUnits)} ÷ Actual:{" "}
                                                            {formatNumberOrDash(d.actualUnits)}
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="wapePct"
                                            stroke="#10b981"
                                            strokeWidth={2.5}
                                            fill="url(#wapeFill)"
                                            connectNulls
                                            isAnimationActive={true}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Forecast Bias % Diverging Bar Chart */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Scale className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            Forecast Bias Direction (%)
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Positive (+%) = running high (excess stock risk) · Negative (-%) = running low (stockout risk)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {accuracySeries.length === 0 ? (
                            <div className="py-14 text-center text-xs text-muted-foreground rounded-xl border border-dashed">
                                Need at least 2 historical periods with customer orders to evaluate directional bias.
                            </div>
                        ) : (
                            <div className="h-[260px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={accuracySeries}
                                        margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            vertical={false}
                                            stroke="hsl(var(--border))"
                                            opacity={0.5}
                                        />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
                                        />
                                        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} />
                                        <RechartsTooltip
                                            content={({ active, payload: tipPayload, label }) => {
                                                if (!active || !tipPayload || tipPayload.length === 0) return null;
                                                const d = tipPayload[0]?.payload as (typeof accuracySeries)[number];
                                                return (
                                                    <div className="rounded-xl border border-border/80 bg-popover/95 p-2.5 shadow-lg text-xs space-y-1">
                                                        <div className="font-bold">{label}</div>
                                                        <div>
                                                            Forecast Bias:{" "}
                                                            <span className="font-bold">
                                                                {formatPercentOrDash(d.biasPct, 1, true)}
                                                            </span>
                                                        </div>
                                                        <div className="text-muted-foreground">
                                                            Backtest {formatNumberOrDash(d.backtestForecastUnits)} vs Actual{" "}
                                                            {formatNumberOrDash(d.actualUnits)}
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="biasPct" radius={[4, 4, 4, 4]} maxBarSize={30} isAnimationActive={true}>
                                            {accuracySeries.map((entry, idx) => (
                                                <Cell
                                                    key={`bias-${idx}`}
                                                    fill={
                                                        entry.biasPct === null
                                                            ? "#94a3b8"
                                                            : entry.biasPct > 5
                                                            ? "#f59e0b"
                                                            : entry.biasPct < -5
                                                            ? "#ef4444"
                                                            : "#10b981"
                                                    }
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

            {/* Highest-Error Spotlight Table with Pagination */}
            <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-rose-500" />
                        <span>Largest Forecast Variance Drivers (Ranked by Error Volume)</span>
                        <Badge variant="secondary" className="text-[10px] font-bold tabular-nums">
                            {totalRows} pairs
                        </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Product-region pairs with the highest absolute forecast error — select any row to inspect the Sales Orders
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {totalRows === 0 ? (
                        <div className="py-10 text-center text-xs text-muted-foreground">
                            No backtest error outliers detected for the selected period.
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-y border-border/60 bg-muted/40 text-[11px] text-muted-foreground">
                                            <th className="py-2 px-3.5 text-left font-bold">Product</th>
                                            <th className="py-2 px-3 text-left font-bold">Region</th>
                                            <th className="py-2 px-3 text-right font-bold">Backtest Forecast</th>
                                            <th className="py-2 px-3 text-right font-bold">Evaluated Actual</th>
                                            <th className="py-2 px-3 text-right font-bold">Abs Error</th>
                                            <th className="py-2 px-3 text-right font-bold">WAPE</th>
                                            <th className="py-2 px-3 text-right font-bold">Bias Signal</th>
                                            <th className="py-2 px-3 text-right font-bold">Evidence</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {paginatedSpotlight.map((row, idx) => (
                                            <motion.tr
                                                key={row.rowKey}
                                                initial={{ opacity: 0, y: -5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.18, delay: Math.min(idx * 0.02, 0.3) }}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() =>
                                                    onOpenEvidence(
                                                        `Accuracy Audit: ${row.productName} × ${row.regionLabel}`,
                                                        `Abs Error ${formatNumberOrDash(row.absErrorUnits)} ÷ Evaluated Actual ${formatNumberOrDash(row.evaluatedActualUnits)} · WAPE ${formatPercentOrDash(row.wapePct)} · Bias ${formatPercentOrDash(row.biasPct, 1, true)}`,
                                                        row.evidenceIds,
                                                        row.totalEvidenceCount
                                                    )
                                                }
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        onOpenEvidence(
                                                            `Accuracy Audit: ${row.productName} × ${row.regionLabel}`,
                                                            `Abs Error ${formatNumberOrDash(row.absErrorUnits)} ÷ Evaluated Actual ${formatNumberOrDash(row.evaluatedActualUnits)} · WAPE ${formatPercentOrDash(row.wapePct)} · Bias ${formatPercentOrDash(row.biasPct, 1, true)}`,
                                                            row.evidenceIds,
                                                            row.totalEvidenceCount
                                                        );
                                                    }
                                                }}
                                                className="hover:bg-accent/45 focus-visible:bg-accent/60 focus-visible:outline-none transition-colors cursor-pointer"
                                            >
                                                <td className="py-2.5 px-3.5">
                                                    <div className="font-semibold">{row.productName}</div>
                                                    <div className="text-[10px] text-muted-foreground">{row.productCode}</div>
                                                </td>
                                                <td className="py-2.5 px-3 font-medium">{row.regionLabel}</td>
                                                <td className="py-2.5 px-3 text-right tabular-nums">
                                                    {formatNumberOrDash(row.backtestForecastUnits)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right tabular-nums">
                                                    {formatNumberOrDash(row.evaluatedActualUnits)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                                                    {formatNumberOrDash(row.absErrorUnits)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                                                    {formatPercentOrDash(row.wapePct)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] px-1.5 py-0 ${
                                                            row.biasPct === null
                                                                ? ""
                                                                : row.biasPct > 5
                                                                ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                                                                : row.biasPct < -5
                                                                ? "border-rose-500/40 text-rose-700 dark:text-rose-300"
                                                                : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                                        }`}
                                                    >
                                                        {row.biasPct === null
                                                            ? "-"
                                                            : `${formatPercentOrDash(row.biasPct, 1, true)} ${
                                                                  row.biasPct > 5
                                                                      ? "High"
                                                                      : row.biasPct < -5
                                                                      ? "Low"
                                                                      : "Balanced"
                                                              }`}
                                                    </Badge>
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                                        Audit
                                                        <ExternalLink className="h-3 w-3" />
                                                    </span>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-3.5 py-2.5 text-xs">
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <span className="tabular-nums">
                                        Showing{" "}
                                        <span className="font-semibold text-foreground">{startIndex + 1}</span>–
                                        <span className="font-semibold text-foreground">{endIndex}</span> of{" "}
                                        <span className="font-semibold text-foreground">{totalRows}</span> pairs
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <span>Rows:</span>
                                        <select
                                            aria-label="Rows per page"
                                            value={pageSize}
                                            onChange={(e) => {
                                                setPageSize(Number(e.target.value));
                                                setPage(1);
                                            }}
                                            className="h-7 rounded-lg border border-border/70 bg-background px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                                        >
                                            {[10, 20, 50, 100].map((size) => (
                                                <option key={size} value={size}>
                                                    {size}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 self-end sm:self-auto">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPage(1)}
                                        disabled={safePage <= 1}
                                        aria-label="First page"
                                        className="h-7 w-7 rounded-lg"
                                    >
                                        <ChevronsLeft className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPage(Math.max(1, safePage - 1))}
                                        disabled={safePage <= 1}
                                        aria-label="Previous page"
                                        className="h-7 w-7 rounded-lg"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                    </Button>

                                    <div className="flex items-center gap-1 px-1">
                                        {visiblePageNumbers.map((item) =>
                                            typeof item === "string" ? (
                                                <span
                                                    key={item}
                                                    className="px-1.5 text-muted-foreground select-none"
                                                >
                                                    …
                                                </span>
                                            ) : (
                                                <button
                                                    key={item}
                                                    type="button"
                                                    onClick={() => setPage(item)}
                                                    aria-current={safePage === item ? "page" : undefined}
                                                    className={`h-7 min-w-7 px-2 rounded-lg text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                                                        safePage === item
                                                            ? "bg-primary text-primary-foreground shadow-xs"
                                                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                                    }`}
                                                >
                                                    {item}
                                                </button>
                                            )
                                        )}
                                    </div>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                                        disabled={safePage >= totalPages}
                                        aria-label="Next page"
                                        className="h-7 w-7 rounded-lg"
                                    >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPage(totalPages)}
                                        disabled={safePage >= totalPages}
                                        aria-label="Last page"
                                        className="h-7 w-7 rounded-lg"
                                    >
                                        <ChevronsRight className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};