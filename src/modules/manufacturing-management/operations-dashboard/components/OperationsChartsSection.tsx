/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useMemo } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    PieChart,
    Pie,
    Cell,
} from "recharts";
import { BarChart3, PieChart as PieChartIcon, Layers } from "lucide-react";
import { OperationsDashboardData } from "../types/operations-dashboard.types";

interface OperationsChartsSectionProps {
    data: OperationsDashboardData | null;
}

const QUEUE_COLOR_MAP: Record<string, string> = {
    "Awaiting Approval": "#f59e0b", // Amber
    "Material Shortages": "#f43f5e", // Rose
    "Active Job Orders": "#3b82f6", // Blue
    "Active WIP Runs": "#6366f1",   // Indigo
    "QA Backlog": "#8b5cf6",        // Violet
    "Ready Fulfillment": "#10b981", // Emerald
};

interface TooltipPayloadItem {
    name?: string;
    value?: number | string;
    payload?: Record<string, any>;
    [key: string]: unknown;
}

interface CustomBarTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadItem[];
}

const CustomBarTooltip: React.FC<CustomBarTooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length && payload[0]?.payload) {
        const item = payload[0].payload;
        const planned = Number(item.Planned) || 0;
        const completed = Number(item.Completed) || 0;
        const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;

        return (
            <div className="bg-popover border border-border p-3 rounded-xl shadow-2xl space-y-1.5 text-xs min-w-[200px] z-[999]">
                <div className="font-bold text-foreground line-clamp-1 border-b border-border/60 pb-1">
                    {String(item.fullName || "")}
                </div>
                <div className="space-y-1 pt-0.5">
                    <div className="flex items-center justify-between text-muted-foreground gap-3">
                        <span className="flex items-center gap-1.5 shrink-0">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            Planned Target:
                        </span>
                        <span className="font-mono font-bold text-foreground">
                            {planned.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground gap-3">
                        <span className="flex items-center gap-1.5 shrink-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Completed Output:
                        </span>
                        <span className="font-mono font-bold text-foreground">
                            {completed.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Completion Rate:</span>
                        <span className={`font-mono font-extrabold ${pct >= 100 ? "text-emerald-500" : pct >= 50 ? "text-primary" : "text-amber-500"}`}>
                            {pct}%
                        </span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

const CustomWipTooltip: React.FC<CustomBarTooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length && payload[0]?.payload) {
        const item = payload[0].payload;
        const units = Number(item.Units) || 0;
        const jobs = Number(item.Jobs) || 0;
        return (
            <div className="bg-popover border border-border p-3 rounded-xl shadow-2xl space-y-2 text-xs min-w-[220px] z-[999]">
                <div className="font-bold text-foreground line-clamp-1 border-b border-border/60 pb-1">
                    {String(item.station || "")}
                </div>
                <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-muted-foreground gap-3">
                        <span className="flex items-center gap-1.5 shrink-0">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            Remaining WIP:
                        </span>
                        <span className="font-mono font-bold text-indigo-500 text-right">
                            {units.toLocaleString()}&nbsp;units
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[10px] gap-3">
                        <span>Active Job Orders:</span>
                        <span className="font-mono font-semibold text-foreground text-right">
                            {jobs}&nbsp;jobs
                        </span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

const CustomDonutTooltip: React.FC<CustomBarTooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length && payload[0]) {
        const item = payload[0];
        const name = String(item.name || "");
        const color = QUEUE_COLOR_MAP[name] || "#6366f1";
        return (
            <div className="bg-popover border border-border p-2.5 rounded-xl shadow-2xl text-xs space-y-1 min-w-[180px] z-[999]">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="truncate">{name}</span>
                </div>
                <div className="flex items-center justify-between pt-0.5 text-muted-foreground gap-3">
                    <span>Backlog Tasks:</span>
                    <span className="font-mono font-bold text-foreground">
                        {Number(item.value || 0).toLocaleString()}&nbsp;tasks
                    </span>
                </div>
            </div>
        );
    }
    return null;
};

export const OperationsChartsSection: React.FC<OperationsChartsSectionProps> = ({ data }) => {
    // 1. Bar Chart Data: Top 5 Active Job Orders (Target vs Completed)
    const productionChartData = useMemo(() => {
        const jos = data?.queues?.activeJobOrders || [];
        return jos.slice(0, 5).map((jo) => ({
            name: jo.joNumber.length > 12 ? `${jo.joNumber.slice(0, 10)}...` : jo.joNumber,
            fullName: `${jo.joNumber} - ${jo.productName}`,
            Planned: Math.round(jo.quantity),
            Completed: Math.round(jo.completedQuantity),
        }));
    }, [data?.queues?.activeJobOrders]);

    // 2. WIP Workstation Load & Bottleneck Breakdown (Mapped from `manufacturing_work_centers`)
    const wipBottleneckData = useMemo(() => {
        const wipItems = data?.queues?.remainingWip || [];
        if (wipItems.length === 0) return [];

        const map = new Map<string, { units: number; jobs: number }>();
        wipItems.forEach((w) => {
            const st = w.stationName || "Shop Floor Assembly";
            const cur = map.get(st) || { units: 0, jobs: 0 };
            map.set(st, {
                units: cur.units + Math.round(w.wipQuantity),
                jobs: cur.jobs + 1,
            });
        });

        // Top 5 stations by load
        const arr = Array.from(map.entries())
            .map(([station, stat]) => ({
                name: station.length > 13 ? `${station.slice(0, 11)}...` : station,
                station,
                Units: stat.units,
                Jobs: stat.jobs,
            }))
            .sort((a, b) => b.Units - a.Units)
            .slice(0, 5);

        return arr;
    }, [data?.queues?.remainingWip]);

    // 3. Donut Chart Data: Operational Queue Task Counts (Normalized to counts)
    const backlogDistributionData = useMemo(() => {
        const totals = data?.totals;
        if (!totals) return [];

        const list = [
            { name: "Awaiting Approval", value: Math.round(totals.ordersAwaitingApproval || 0), color: QUEUE_COLOR_MAP["Awaiting Approval"] },
            { name: "Material Shortages", value: Math.round(totals.materialShortages || 0), color: QUEUE_COLOR_MAP["Material Shortages"] },
            { name: "Active Job Orders", value: Math.round(totals.activeJobOrders || 0), color: QUEUE_COLOR_MAP["Active Job Orders"] },
            { name: "Active WIP Runs", value: Math.round(totals.activeWipJobs || data?.queues?.remainingWip?.length || 0), color: QUEUE_COLOR_MAP["Active WIP Runs"] },
            { name: "QA Backlog", value: Math.round(totals.pendingQaInspections || 0), color: QUEUE_COLOR_MAP["QA Backlog"] },
            { name: "Ready Fulfillment", value: Math.round(totals.readyForFulfillment || 0), color: QUEUE_COLOR_MAP["Ready Fulfillment"] },
        ];

        return list.filter((item) => item.value > 0);
    }, [data?.totals, data?.queues?.remainingWip?.length]);

    const totalBacklogTasks = useMemo(() => {
        return backlogDistributionData.reduce((acc, curr) => acc + curr.value, 0);
    }, [backlogDistributionData]);

    if (!data) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 📊 Chart 1: Active Production Execution Bar Chart */}
            <div className="bg-card border border-border/80 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                            <BarChart3 className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground">
                                Production Output
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
                                Planned vs. completed on active JOs
                            </p>
                        </div>
                    </div>
                </div>

                <div className="h-[210px] w-full">
                    {productionChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={productionChartData}
                                margin={{ top: 10, right: 5, left: -20, bottom: 0 }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="hsl(var(--border))"
                                    opacity={0.4}
                                />
                                <XAxis
                                    dataKey="name"
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={10}
                                    tickLine={false}
                                />
                                <YAxis
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={10}
                                    tickLine={false}
                                />
                                <Tooltip
                                    content={<CustomBarTooltip />}
                                    cursor={{ fill: "hsl(var(--muted)/0.25)", radius: 6 }}
                                />
                                <Legend
                                    wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }}
                                />
                                <Bar
                                    dataKey="Planned"
                                    fill="#3b82f6"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={22}
                                />
                                <Bar
                                    dataKey="Completed"
                                    fill="#10b981"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={22}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                            No active production job orders to graph.
                        </div>
                    )}
                </div>
            </div>

            {/* 🏭 Chart 2: WIP Workstation Load & Bottlenecks */}
            <div className="bg-card border border-border/80 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                            <Layers className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground">
                                WIP Workstation Load
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
                                Unfinished WIP queued across stages
                            </p>
                        </div>
                    </div>
                </div>

                <div className="h-[210px] w-full">
                    {wipBottleneckData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={wipBottleneckData}
                                margin={{ top: 10, right: 5, left: -15, bottom: 0 }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="hsl(var(--border))"
                                    opacity={0.4}
                                />
                                <XAxis
                                    dataKey="name"
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={10}
                                    tickLine={false}
                                />
                                <YAxis
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={10}
                                    tickLine={false}
                                />
                                <Tooltip
                                    content={<CustomWipTooltip />}
                                    cursor={{ fill: "hsl(var(--muted)/0.25)", radius: 6 }}
                                />
                                <Bar
                                    dataKey="Units"
                                    fill="#6366f1"
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={28}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                            No remaining WIP queued at workstations.
                        </div>
                    )}
                </div>
            </div>

            {/* 🍩 Chart 3: Queue Distribution Donut Chart (Non-overlapping Tooltip & Text) */}
            <div className="bg-card border border-border/80 rounded-xl p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-2">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                            <PieChartIcon className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-foreground">
                                Queue Distribution
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
                                Proportion of tasks across active queues
                            </p>
                        </div>
                    </div>
                    {/* Position total counter in header to prevent donut overlap */}
                    <div className="flex flex-col items-end shrink-0">
                        <span className="text-sm font-black text-foreground font-mono leading-none">
                            {totalBacklogTasks.toLocaleString()}
                        </span>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground">
                            Active Tasks
                        </span>
                    </div>
                </div>

                {/* Donut Graphic */}
                <div className="relative h-[160px] w-full flex items-center justify-center">
                    {backlogDistributionData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={backlogDistributionData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={46}
                                    outerRadius={68}
                                    paddingAngle={3}
                                    dataKey="value"
                                    stroke="hsl(var(--card))"
                                    strokeWidth={2.5}
                                >
                                    {backlogDistributionData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.color}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={<CustomDonutTooltip />}
                                    wrapperStyle={{ zIndex: 1000 }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="text-xs text-muted-foreground italic">
                            No active queue backlog items.
                        </div>
                    )}
                </div>

                {/* Compact Multi-Color Legend */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-2 border-t border-border/50 text-[10px]">
                    {backlogDistributionData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-1 min-w-0">
                            <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                <span className="truncate">{item.name}</span>
                            </span>
                            <span className="font-mono font-bold text-foreground shrink-0">
                                {item.value}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
