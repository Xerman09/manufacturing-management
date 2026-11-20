"use client";

import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis
} from "recharts";
import {
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Columns3,
    ExternalLink,
    Search,
    Table2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";
import type {
    DemandForecastReportPayload,
    ProductRegionMatrixRow,
    ScenarioAssumptions
} from "../types";
import {
    formatNumberOrDash,
    formatPercentOrDash,
    getMatrixPredictionBounds
} from "../utils/scenarioMath";

interface ProductRegionTabProps {
    payload: DemandForecastReportPayload;
    assumptions: ScenarioAssumptions;
    onOpenEvidence: (
        title: string,
        subtitle: string,
        evidenceIds: string[],
        totalEvidenceCount: number
    ) => void;
}

type SortKey = "forecastUnits" | "historicalActualUnits" | "wapePct" | "biasPct" | "trendPct";
type OptionalColumnKey =
    | "sufficiency"
    | "policy"
    | "predictionInterval"
    | "wape"
    | "bias"
    | "trend"
    | "orders";

const OPTIONAL_COLUMNS: Array<{ key: OptionalColumnKey; label: string }> = [
    { key: "sufficiency", label: "Data Sufficiency" },
    { key: "policy", label: "FEFO / FIFO Rotation" },
    { key: "predictionInterval", label: "Expected Range" },
    { key: "wape", label: "WAPE %" },
    { key: "bias", label: "Forecast Bias %" },
    { key: "trend", label: "Demand Trend" },
    { key: "orders", label: "Sales Orders" }
];

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export const ProductRegionTab: React.FC<ProductRegionTabProps> = ({
    payload,
    assumptions,
    onOpenEvidence
}) => {
    const [chartDimension, setChartDimension] = useState<"product" | "region">("product");
    const [searchText, setSearchText] = useState("");
    const [sortBy, setSortBy] = useState<SortKey>("forecastUnits");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
    const [visibleColumns, setVisibleColumns] = useState<Record<OptionalColumnKey, boolean>>({
        sufficiency: true,
        policy: true,
        predictionInterval: true,
        wape: true,
        bias: true,
        trend: true,
        orders: false
    });

    const multiplier = Math.max(0, 1 + assumptions.demandAdjustmentPct / 100);

    const comparisonChartData = useMemo(() => {
        if (chartDimension === "region") {
            return payload.regionComparison.slice(0, 10).map((r) => ({
                name: r.regionLabel.length > 20 ? `${r.regionLabel.slice(0, 18)}…` : r.regionLabel,
                fullName: r.regionLabel,
                actual: r.actualUnits,
                forecast: r.forecastUnits !== null ? Math.round(r.forecastUnits * multiplier) : 0,
                wapePct: r.wapePct,
                biasPct: r.biasPct
            }));
        }
        return payload.productComparison.slice(0, 10).map((p) => ({
            name: p.productName.length > 20 ? `${p.productName.slice(0, 18)}…` : p.productName,
            fullName: `${p.productName} (${p.productCode})`,
            actual: p.actualUnits,
            forecast: p.forecastUnits !== null ? Math.round(p.forecastUnits * multiplier) : 0,
            wapePct: p.wapePct,
            biasPct: p.biasPct
        }));
    }, [chartDimension, payload.regionComparison, payload.productComparison, multiplier]);

    const filteredRows = useMemo(() => {
        const q = searchText.trim().toLowerCase();
        const list = payload.matrixRows.filter((row) => {
            if (!q) return true;
            return (
                row.productName.toLowerCase().includes(q) ||
                row.productCode.toLowerCase().includes(q) ||
                row.regionLabel.toLowerCase().includes(q) ||
                row.categoryName.toLowerCase().includes(q)
            );
        });

        return [...list].sort((a, b) => {
            const av = a[sortBy] ?? -Infinity;
            const bv = b[sortBy] ?? -Infinity;
            return sortDir === "desc" ? Number(bv) - Number(av) : Number(av) - Number(bv);
        });
    }, [payload.matrixRows, searchText, sortBy, sortDir]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * pageSize;
    const endIdx = Math.min(filteredRows.length, startIdx + pageSize);
    const pagedRows = useMemo(
        () => filteredRows.slice(startIdx, endIdx),
        [filteredRows, startIdx, endIdx]
    );

    const toggleSort = (key: SortKey) => {
        setPage(1);
        if (sortBy === key) {
            setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
        } else {
            setSortBy(key);
            setSortDir("desc");
        }
    };

    const toggleColumn = (key: OptionalColumnKey) => {
        setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleInspectRow = (row: ProductRegionMatrixRow) => {
        const bounds = getMatrixPredictionBounds(row, assumptions.confidenceLevel);
        const expectedText =
            row.forecastUnits !== null
                ? `Expected ${formatNumberOrDash(Math.round(row.forecastUnits * multiplier))} ${row.unitLabel}`
                : "Forecast: Insufficient History";
        const rangeText =
            bounds.lower !== null && bounds.upper !== null
                ? ` (${assumptions.confidenceLevel}% range: ${formatNumberOrDash(Math.round(bounds.lower * multiplier))}–${formatNumberOrDash(Math.round(bounds.upper * multiplier))})`
                : "";
        onOpenEvidence(
            `${row.productName} × ${row.regionLabel}`,
            `${expectedText}${rangeText} · WAPE ${formatPercentOrDash(row.wapePct)} · Evidence: ${row.dataSufficiency} (${row.observationCount} obs)`,
            row.evidenceIds,
            row.totalEvidenceCount
        );
    };

    return (
        <div className="space-y-4">
            {/* Switchable Product vs Customer Region Bar Chart */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <CardTitle className="text-sm font-bold">
                            Demand Comparison ({chartDimension === "product" ? "Top 10 Products" : "Top 10 Customer Regions"})
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Historical Sales Orders compared with reconciled expected demand
                        </CardDescription>
                    </div>
                    <div className="inline-flex items-center rounded-xl border border-border/70 bg-muted/50 p-0.5 self-start">
                        {(["product", "region"] as const).map((dim) => {
                            const active = chartDimension === dim;
                            return (
                                <button
                                    key={dim}
                                    type="button"
                                    onClick={() => setChartDimension(dim)}
                                    className={`relative px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="matrix-dim-pill"
                                            transition={{ type: "spring", stiffness: 420, damping: 32 }}
                                            className="absolute inset-0 rounded-lg bg-background shadow-sm border border-border/50"
                                        />
                                    )}
                                    <span className="relative z-10">
                                        {dim === "product" ? "By Product" : "By Customer Region"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </CardHeader>
                <CardContent>
                    {comparisonChartData.length === 0 ? (
                        <div className="py-12 text-center text-xs text-muted-foreground rounded-xl border border-dashed">
                            No comparison data available for the active filter scope.
                        </div>
                    ) : (
                        <motion.div
                            key={chartDimension}
                            initial={{ opacity: 0.4, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            className="h-[260px] w-full"
                        >
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={comparisonChartData}
                                    margin={{ top: 8, right: 16, left: 4, bottom: 16 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        stroke="hsl(var(--border))"
                                        opacity={0.5}
                                    />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <RechartsTooltip
                                        content={({ active, payload: tipPayload }) => {
                                            if (!active || !tipPayload || tipPayload.length === 0) return null;
                                            const d = tipPayload[0]?.payload as (typeof comparisonChartData)[number];
                                            return (
                                                <div className="rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-2.5 shadow-lg text-xs space-y-1">
                                                    <div className="font-bold text-foreground">{d.fullName}</div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Actual Orders:</span>
                                                        <span className="font-semibold text-sky-600 dark:text-sky-400">
                                                            {formatNumberOrDash(d.actual)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-4">
                                                        <span className="text-muted-foreground">Expected Demand:</span>
                                                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                                            {formatNumberOrDash(d.forecast)}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground pt-0.5">
                                                        WAPE: {formatPercentOrDash(d.wapePct)} · Bias:{" "}
                                                        {formatPercentOrDash(d.biasPct, 1, true)}
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar
                                        dataKey="actual"
                                        name="Actual Orders"
                                        fill="#0ea5e9"
                                        radius={[5, 5, 0, 0]}
                                        maxBarSize={26}
                                        isAnimationActive={true}
                                    />
                                    <Bar
                                        dataKey="forecast"
                                        name="Expected Demand"
                                        fill="#4f46e5"
                                        radius={[5, 5, 0, 0]}
                                        maxBarSize={26}
                                        isAnimationActive={true}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </motion.div>
                    )}
                </CardContent>
            </Card>

            {/* Product x Region Traceable Matrix Table with Full Pagination */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Table2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                            Product × Customer Region Forecast Matrix
                            <Badge variant="secondary" className="text-[10px]">
                                {filteredRows.length} total rows
                            </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Select any row to inspect underlying Sales Orders and accuracy records
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative w-[220px]">
                            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <Input
                                value={searchText}
                                onChange={(e) => {
                                    setSearchText(e.target.value);
                                    setPage(1);
                                }}
                                placeholder="Filter SKU or region..."
                                className="h-8 pl-8 text-xs bg-background"
                            />
                        </div>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1.5">
                                    <Columns3 className="h-3.5 w-3.5" />
                                    Columns
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52 p-2.5 rounded-xl" align="end">
                                <div className="text-[11px] font-bold text-muted-foreground mb-2 px-1">
                                    Toggle Visible Columns
                                </div>
                                <div className="space-y-1.5">
                                    {OPTIONAL_COLUMNS.map((col) => (
                                        <label
                                            key={col.key}
                                            className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-accent cursor-pointer text-xs"
                                        >
                                            <Checkbox
                                                checked={visibleColumns[col.key]}
                                                onCheckedChange={() => toggleColumn(col.key)}
                                            />
                                            <span>{col.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {filteredRows.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="py-12 px-4 text-center text-xs text-muted-foreground"
                        >
                            No product-region rows match your filter criteria.
                        </motion.div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-y border-border/60 bg-muted/40 text-[11px] text-muted-foreground">
                                            <th className="py-2.5 px-3.5 text-left font-bold">Product</th>
                                            <th className="py-2.5 px-3 text-left font-bold">Customer Region</th>
                                            <AnimatePresence initial={false}>
                                                {visibleColumns.sufficiency && (
                                                    <motion.th
                                                        key="th-sufficiency"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="py-2.5 px-3 text-center font-bold"
                                                    >
                                                        Data Sufficiency
                                                    </motion.th>
                                                )}
                                                {visibleColumns.policy && (
                                                    <motion.th
                                                        key="th-policy"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="py-2.5 px-3 text-center font-bold"
                                                    >
                                                        Rotation
                                                    </motion.th>
                                                )}
                                            </AnimatePresence>
                                            <th className="py-2.5 px-3 text-right font-bold">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSort("historicalActualUnits")}
                                                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                                                >
                                                    Actual Orders
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </button>
                                            </th>
                                            <th className="py-2.5 px-3 text-right font-bold">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSort("forecastUnits")}
                                                    className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                                                >
                                                    Expected Demand
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </button>
                                            </th>
                                            <AnimatePresence initial={false}>
                                                {visibleColumns.predictionInterval && (
                                                    <motion.th
                                                        key="th-pi"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="py-2.5 px-3 text-right font-bold"
                                                    >
                                                        {assumptions.confidenceLevel}% Range
                                                    </motion.th>
                                                )}
                                                {visibleColumns.wape && (
                                                    <motion.th
                                                        key="th-wape"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="py-2.5 px-3 text-right font-bold"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSort("wapePct")}
                                                            className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                                                        >
                                                            WAPE
                                                            <ArrowUpDown className="h-3 w-3" />
                                                        </button>
                                                    </motion.th>
                                                )}
                                                {visibleColumns.bias && (
                                                    <motion.th
                                                        key="th-bias"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="py-2.5 px-3 text-right font-bold"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSort("biasPct")}
                                                            className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                                                        >
                                                            Bias
                                                            <ArrowUpDown className="h-3 w-3" />
                                                        </button>
                                                    </motion.th>
                                                )}
                                                {visibleColumns.trend && (
                                                    <motion.th
                                                        key="th-trend"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="py-2.5 px-3 text-center font-bold"
                                                    >
                                                        Trend
                                                    </motion.th>
                                                )}
                                                {visibleColumns.orders && (
                                                    <motion.th
                                                        key="th-orders"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="py-2.5 px-3 text-right font-bold"
                                                    >
                                                        Orders
                                                    </motion.th>
                                                )}
                                            </AnimatePresence>
                                            <th className="py-2.5 px-3 text-right font-bold">Evidence</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {pagedRows.map((row, idx) => {
                                            const bounds = getMatrixPredictionBounds(
                                                row,
                                                assumptions.confidenceLevel
                                            );
                                            const scaledFc =
                                                row.forecastUnits !== null
                                                    ? Math.round(row.forecastUnits * multiplier)
                                                    : null;
                                            const scaledLower =
                                                bounds.lower !== null
                                                    ? Math.round(bounds.lower * multiplier)
                                                    : null;
                                            const scaledUpper =
                                                bounds.upper !== null
                                                    ? Math.round(bounds.upper * multiplier)
                                                    : null;

                                            return (
                                                <motion.tr
                                                    key={row.rowKey}
                                                    initial={{ opacity: 0, y: -5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{
                                                        duration: 0.16,
                                                        delay: Math.min(idx * 0.015, 0.25)
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => handleInspectRow(row)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            handleInspectRow(row);
                                                        }
                                                    }}
                                                    className="hover:bg-accent/45 focus-visible:bg-accent/60 focus-visible:outline-none transition-colors cursor-pointer"
                                                >
                                                    <td className="py-2.5 px-3.5">
                                                        <div className="font-semibold text-foreground">
                                                            {row.productName}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground">
                                                            {row.productCode} · {row.categoryName}
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3">
                                                        <div className="font-medium text-foreground">
                                                            {row.regionLabel}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground capitalize">
                                                            {row.regionSource === "unmapped"
                                                                ? "Unassigned"
                                                                : "Customer Location"}
                                                        </div>
                                                    </td>
                                                    {visibleColumns.sufficiency && (
                                                        <td className="py-2.5 px-3 text-center">
                                                            <Badge
                                                                variant="outline"
                                                                className={`text-[10px] px-1.5 py-0 ${
                                                                    row.dataSufficiency === "SUFFICIENT"
                                                                        ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                                                                        : row.dataSufficiency === "LIMITED"
                                                                        ? "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                                                                        : "border-slate-500/40 text-slate-600 dark:text-slate-400 bg-slate-500/10"
                                                                }`}
                                                                title={`Observations: ${row.observationCount}. Uncertainty method: ${row.uncertaintySource}`}
                                                            >
                                                                {row.dataSufficiency === "SUFFICIENT"
                                                                    ? `Sufficient (${row.observationCount})`
                                                                    : row.dataSufficiency === "LIMITED"
                                                                    ? `Limited (${row.observationCount}${row.uncertaintySource === "pooled" ? " · Pooled" : ""})`
                                                                    : `Insufficient (${row.observationCount})`}
                                                            </Badge>
                                                        </td>
                                                    )}
                                                    {visibleColumns.policy && (
                                                        <td className="py-2.5 px-3 text-center">
                                                            <Badge
                                                                variant="outline"
                                                                className={`text-[10px] px-1.5 py-0 ${
                                                                    row.inventoryPolicy === "FEFO"
                                                                        ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                                                                        : row.inventoryPolicy === "FIFO"
                                                                        ? "border-sky-500/40 text-sky-700 dark:text-sky-300"
                                                                        : "border-muted-foreground/30 text-muted-foreground"
                                                                }`}
                                                            >
                                                                {row.inventoryPolicy === "UNKNOWN" ? "Unknown" : row.inventoryPolicy}
                                                            </Badge>
                                                        </td>
                                                    )}
                                                    <td className="py-2.5 px-3 text-right font-medium tabular-nums">
                                                        {formatNumberOrDash(row.historicalActualUnits)}{" "}
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {row.unitLabel}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                                                        {formatNumberOrDash(scaledFc)}{" "}
                                                        {scaledFc !== null && (
                                                            <span className="text-[10px] font-normal text-muted-foreground">
                                                                {row.unitLabel}
                                                            </span>
                                                        )}
                                                    </td>
                                                    {visibleColumns.predictionInterval && (
                                                        <td className="py-2.5 px-3 text-right text-muted-foreground tabular-nums">
                                                            {scaledLower !== null && scaledUpper !== null
                                                                ? `${formatNumberOrDash(scaledLower)} – ${formatNumberOrDash(scaledUpper)}`
                                                                : "-"}
                                                        </td>
                                                    )}
                                                    {visibleColumns.wape && (
                                                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                                                            <span
                                                                className={
                                                                    row.wapePct === null
                                                                        ? "text-muted-foreground"
                                                                        : row.wapePct <= 15
                                                                        ? "text-emerald-600 dark:text-emerald-400"
                                                                        : row.wapePct <= 25
                                                                        ? "text-amber-600 dark:text-amber-400"
                                                                        : "text-rose-600 dark:text-rose-400"
                                                                }
                                                            >
                                                                {formatPercentOrDash(row.wapePct)}
                                                            </span>
                                                        </td>
                                                    )}
                                                    {visibleColumns.bias && (
                                                        <td className="py-2.5 px-3 text-right tabular-nums">
                                                            {formatPercentOrDash(row.biasPct, 1, true)}
                                                        </td>
                                                    )}
                                                    {visibleColumns.trend && (
                                                        <td className="py-2.5 px-3 text-center">
                                                            <Badge
                                                                variant="secondary"
                                                                className={`text-[10px] px-1.5 py-0 ${
                                                                    row.trendDirection === "Rising"
                                                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                                        : row.trendDirection === "Cooling"
                                                                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                                                        : row.trendDirection === "Volatile"
                                                                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                                                        : ""
                                                                }`}
                                                            >
                                                                {row.trendDirection === "Insufficient Data"
                                                                    ? "-"
                                                                    : row.trendDirection}
                                                            </Badge>
                                                        </td>
                                                    )}
                                                    {visibleColumns.orders && (
                                                        <td className="py-2.5 px-3 text-right tabular-nums">
                                                            {row.orderCount}
                                                        </td>
                                                    )}
                                                    <td className="py-2.5 px-3 text-right">
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                                            Inspect
                                                            <ExternalLink className="h-3 w-3" />
                                                        </span>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Full Pagination Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border/60 bg-muted/20 text-xs">
                                <div className="text-muted-foreground">
                                    Showing{" "}
                                    <span className="font-semibold text-foreground">
                                        {startIdx + 1}–{endIdx}
                                    </span>{" "}
                                    of{" "}
                                    <span className="font-semibold text-foreground">
                                        {filteredRows.length}
                                    </span>{" "}
                                    rows
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1">
                                        <span className="text-muted-foreground text-[11px]">Per page:</span>
                                        {PAGE_SIZE_OPTIONS.map((sz) => (
                                            <button
                                                key={sz}
                                                type="button"
                                                onClick={() => {
                                                    setPageSize(sz);
                                                    setPage(1);
                                                }}
                                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                                                    pageSize === sz
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-muted text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                {sz}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-1 ml-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={safePage <= 1}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            className="h-7 px-2 text-xs"
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                            Prev
                                        </Button>
                                        <span className="px-2 text-[11px] font-medium tabular-nums">
                                            Page {safePage} / {totalPages}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={safePage >= totalPages}
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            className="h-7 px-2 text-xs"
                                        >
                                            Next
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
