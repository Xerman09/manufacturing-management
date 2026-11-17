"use client";

import React from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MetricCardData } from "../types";

interface Props {
    kpis: {
        output: MetricCardData;
        plantOee: MetricCardData;
        scrapRate: MetricCardData;
        downtimeMinutes: MetricCardData;
        otif: MetricCardData;
        costVariance: MetricCardData;
    };
    onSelectKpi?: (kpiKey: string) => void;
}

interface StatProps {
    label: string;
    value: string;
    sub: string;
    unit?: string;
    delta?: string;
    isPositiveDelta?: boolean;
    type: "output" | "oee" | "scrap" | "downtime" | "otif" | "cost";
    status: MetricCardData["status"];
    targetBasis: string;
    onClick?: () => void;
    explanation?: MetricCardData["explanation"];
}

const Stat: React.FC<StatProps> = ({
    label,
    value,
    sub,
    unit,
    delta,
    isPositiveDelta,
    type,
    status,
    targetBasis,
    onClick,
    explanation
}) => {
    // Color-themed card styling and intensified theme hover colors (no scale/shadow twitching)
    const styles = {
        output: {
            border: "border-blue-500/20 hover:border-blue-500/70",
            bg: "bg-gradient-to-br from-blue-500/[0.04] hover:from-blue-500/[0.1] via-transparent to-transparent",
            text: "text-blue-600 dark:text-blue-400"
        },
        oee: {
            border: status === "good" ? "border-emerald-500/20 hover:border-emerald-500/70" : (status === "warning" ? "border-amber-500/20 hover:border-amber-500/70" : "border-rose-500/20 hover:border-rose-500/70"),
            bg: status === "good"
                ? "bg-gradient-to-br from-emerald-500/[0.04] hover:from-emerald-500/[0.1] via-transparent to-transparent"
                : (status === "warning" ? "bg-gradient-to-br from-amber-500/[0.04] hover:from-amber-500/[0.1] via-transparent to-transparent" : "bg-gradient-to-br from-rose-500/[0.04] hover:from-rose-500/[0.1] via-transparent to-transparent"),
            text: status === "good" ? "text-emerald-600 dark:text-emerald-400" : (status === "warning" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")
        },
        scrap: {
            border: status === "good" ? "border-emerald-500/20 hover:border-emerald-500/70" : "border-rose-500/20 hover:border-rose-500/70",
            bg: status === "good"
                ? "bg-gradient-to-br from-emerald-500/[0.04] hover:from-emerald-500/[0.1] via-transparent to-transparent"
                : "bg-gradient-to-br from-rose-500/[0.04] hover:from-rose-500/[0.1] via-transparent to-transparent",
            text: status === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        },
        downtime: {
            border: status === "good" ? "border-emerald-500/20 hover:border-emerald-500/70" : "border-amber-500/20 hover:border-amber-500/70",
            bg: status === "good"
                ? "bg-gradient-to-br from-emerald-500/[0.04] hover:from-emerald-500/[0.1] via-transparent to-transparent"
                : "bg-gradient-to-br from-amber-500/[0.04] hover:from-amber-500/[0.1] via-transparent to-transparent",
            text: status === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
        },
        otif: {
            border: "border-purple-500/20 hover:border-purple-500/70",
            bg: "bg-gradient-to-br from-purple-500/[0.04] hover:from-purple-500/[0.1] via-transparent to-transparent",
            text: "text-purple-600 dark:text-purple-400"
        },
        cost: {
            border: "border-indigo-500/20 hover:border-indigo-500/70",
            bg: "bg-gradient-to-br from-indigo-500/[0.04] hover:from-indigo-500/[0.1] via-transparent to-transparent",
            text: "text-indigo-600 dark:text-indigo-400"
        }
    }[type];

    return (
        <div
            onClick={onClick}
            className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors duration-150 ${styles.border} ${styles.bg} relative overflow-hidden cursor-pointer bg-card`}
        >
            <div className="flex items-center justify-between gap-1 z-10">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground truncate" title={label}>
                    {label}
                </span>

                {explanation && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-0.5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
                                title="Calculation formula & business context"
                            >
                                <Info className="h-3 w-3" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-80 p-3.5 border border-border bg-popover text-popover-foreground shadow-xl rounded-xl z-50 text-xs"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="space-y-2">
                                <div className="font-bold text-xs border-b pb-1 flex items-center justify-between">
                                    <span>{label}</span>
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold uppercase">
                                        Executive Metric
                                    </span>
                                </div>
                                <p className="text-[11px] font-mono bg-muted/60 p-1.5 rounded text-foreground font-medium">
                                    {explanation.formula}
                                </p>
                                <div className="space-y-1 text-[10px] text-muted-foreground pt-1">
                                    <div className="flex justify-between">
                                        <span>{explanation.numeratorLabel}:</span>
                                        <span className="font-bold text-foreground">{explanation.numeratorValue.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>{explanation.denominatorLabel}:</span>
                                        <span className="font-bold text-foreground">{explanation.denominatorValue.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t">
                                        <span>Business Source:</span>
                                        <span className="font-medium text-foreground text-right">{explanation.dataSource}</span>
                                    </div>
                                    <div className="flex justify-between pt-0.5">
                                        <span>Target Basis:</span>
                                        <span className="font-medium text-primary text-right">{targetBasis}</span>
                                    </div>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
            </div>

            <div className="mt-2 flex items-baseline gap-1 z-10">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                    {value}
                </span>
                {unit && <span className="text-xs font-semibold text-muted-foreground">{unit}</span>}
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground z-10 pt-1 border-t border-border/40">
                <span className="truncate">{sub}</span>
                {delta && (
                    <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isPositiveDelta
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}
                    >
                        {delta}
                    </span>
                )}
            </div>
        </div>
    );
};

export const MetricKPICards: React.FC<Props> = ({ kpis, onSelectKpi }) => {
    return (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 w-full">
            <Stat
                label="Output vs Target"
                value={kpis.output.actual !== null ? kpis.output.actual.toLocaleString() : "N/A"}
                unit={kpis.output.unit}
                sub={`Target: ${kpis.output.target?.toLocaleString() ?? 0}`}
                delta={kpis.output.variancePercent !== null ? `${kpis.output.variancePercent > 0 ? "+" : ""}${kpis.output.variancePercent}%` : undefined}
                isPositiveDelta={(kpis.output.variancePercent ?? 0) >= 0}
                type="output"
                status={kpis.output.status}
                targetBasis={kpis.output.targetBasis}
                explanation={kpis.output.explanation}
                onClick={() => onSelectKpi?.("output")}
            />

            <Stat
                label="Plant OEE (Weighted)"
                value={kpis.plantOee.actual !== null ? `${kpis.plantOee.actual}%` : "N/A"}
                sub={`Target: ${kpis.plantOee.target}%`}
                delta={kpis.plantOee.variance !== null ? `${kpis.plantOee.variance > 0 ? "+" : ""}${kpis.plantOee.variance}%` : undefined}
                isPositiveDelta={(kpis.plantOee.variance ?? 0) >= 0}
                type="oee"
                status={kpis.plantOee.status}
                targetBasis={kpis.plantOee.targetBasis}
                explanation={kpis.plantOee.explanation}
                onClick={() => onSelectKpi?.("plantOee")}
            />

            <Stat
                label="Scrap & Defect Rate"
                value={kpis.scrapRate.actual !== null ? `${kpis.scrapRate.actual}%` : "N/A"}
                sub={`Target: ≤ ${kpis.scrapRate.target}%`}
                delta={kpis.scrapRate.variance !== null ? `${kpis.scrapRate.variance > 0 ? "+" : ""}${kpis.scrapRate.variance}%` : undefined}
                isPositiveDelta={(kpis.scrapRate.variance ?? 0) <= 0}
                type="scrap"
                status={kpis.scrapRate.status}
                targetBasis={kpis.scrapRate.targetBasis}
                explanation={kpis.scrapRate.explanation}
                onClick={() => onSelectKpi?.("scrapRate")}
            />

            <Stat
                label="Unplanned Downtime"
                value={kpis.downtimeMinutes.actual !== null ? kpis.downtimeMinutes.actual.toLocaleString() : "0"}
                unit={kpis.downtimeMinutes.unit}
                sub={`Target: ≤ ${kpis.downtimeMinutes.target} M`}
                delta={kpis.downtimeMinutes.variance !== null ? `${kpis.downtimeMinutes.variance > 0 ? "+" : ""}${kpis.downtimeMinutes.variance} M` : undefined}
                isPositiveDelta={(kpis.downtimeMinutes.variance ?? 0) <= 0}
                type="downtime"
                status={kpis.downtimeMinutes.status}
                targetBasis={kpis.downtimeMinutes.targetBasis}
                explanation={kpis.downtimeMinutes.explanation}
                onClick={() => onSelectKpi?.("downtimeMinutes")}
            />

            <Stat
                label="On-Time In-Full"
                value={kpis.otif.actual !== null ? `${kpis.otif.actual}%` : "N/A"}
                sub={`Target: ${kpis.otif.target}%`}
                delta={kpis.otif.variance !== null ? `${kpis.otif.variance > 0 ? "+" : ""}${kpis.otif.variance}%` : undefined}
                isPositiveDelta={(kpis.otif.variance ?? 0) >= 0}
                type="otif"
                status={kpis.otif.status}
                targetBasis={kpis.otif.targetBasis}
                explanation={kpis.otif.explanation}
                onClick={() => onSelectKpi?.("otif")}
            />

            <Stat
                label="Material Variance"
                value={kpis.costVariance.actual !== null ? `${kpis.costVariance.actual > 0 ? "+" : ""}${kpis.costVariance.actual}%` : "N/A"}
                sub="vs BOM Standard"
                delta={kpis.costVariance.variance !== null ? `${kpis.costVariance.variance > 0 ? "+" : ""}${kpis.costVariance.variance}%` : undefined}
                isPositiveDelta={(kpis.costVariance.variance ?? 0) <= 0}
                type="cost"
                status={kpis.costVariance.status}
                targetBasis={kpis.costVariance.targetBasis}
                explanation={kpis.costVariance.explanation}
                onClick={() => onSelectKpi?.("costVariance")}
            />
        </div>
    );
};
