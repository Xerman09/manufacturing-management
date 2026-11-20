"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    Activity,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    Gauge,
    Info,
    Minus,
    Scale,
    Target,
    TrendingUp
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { KpiSummaryMetrics, ScenarioAssumptions } from "../types";
import { formatNumberOrDash, formatPercentOrDash } from "../utils/scenarioMath";

interface KpiSummaryStripProps {
    kpis: KpiSummaryMetrics | null;
    assumptions: ScenarioAssumptions;
    hasError: boolean;
    onInspectMetric: (metricKey: "forecast" | "interval" | "wape" | "bias" | "trend") => void;
}

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({
    kpis,
    assumptions,
    hasError,
    onInspectMetric
}) => {
    const multiplier = Math.max(0, 1 + assumptions.demandAdjustmentPct / 100);
    const hasScenarioShift = assumptions.demandAdjustmentPct !== 0;

    const baseForecast = !hasError && kpis ? kpis.forecastUnits : null;
    const activeForecast =
        baseForecast !== null ? Math.round(baseForecast * multiplier) : null;

    const rawLower =
        !hasError && kpis
            ? assumptions.confidenceLevel === 80
                ? kpis.piLower80
                : assumptions.confidenceLevel === 95
                ? kpis.piLower95
                : kpis.piLower90
            : null;
    const rawUpper =
        !hasError && kpis
            ? assumptions.confidenceLevel === 80
                ? kpis.piUpper80
                : assumptions.confidenceLevel === 95
                ? kpis.piUpper95
                : kpis.piUpper90
            : null;

    const activeLower = rawLower !== null ? Math.round(rawLower * multiplier) : null;
    const activeUpper = rawUpper !== null ? Math.round(rawUpper * multiplier) : null;

    const wape = !hasError && kpis ? kpis.wapePct : null;
    const bias = !hasError && kpis ? kpis.biasPct : null;
    const trendPct = !hasError && kpis ? kpis.trendPct : null;
    const trendDirection = !hasError && kpis ? kpis.trendDirection : "Insufficient Data";

    const singleUnit = kpis && !kpis.isMixedUnits && kpis.activeUnits.length === 1 ? kpis.activeUnits[0] : null;
    const mixedUnitsNote =
        kpis && kpis.isMixedUnits ? `Mixed (${kpis.activeUnits.slice(0, 3).join(", ")}${kpis.activeUnits.length > 3 ? "…" : ""})` : null;

    const wapeTone =
        wape === null
            ? "text-muted-foreground"
            : wape <= 15
            ? "text-emerald-600 dark:text-emerald-400"
            : wape <= 25
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400";

    const biasTone =
        bias === null
            ? "text-muted-foreground"
            : Math.abs(bias) <= 5
            ? "text-emerald-600 dark:text-emerald-400"
            : Math.abs(bias) <= 15
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400";

    const trendTone =
        trendDirection === "Rising"
            ? "text-emerald-600 dark:text-emerald-400"
            : trendDirection === "Cooling"
            ? "text-amber-600 dark:text-amber-400"
            : trendDirection === "Volatile"
            ? "text-rose-600 dark:text-rose-400"
            : "text-sky-600 dark:text-sky-400";

    const cards = [
        {
            key: "forecast" as const,
            label: hasScenarioShift ? "Scenario Demand" : "Expected Demand",
            value:
                activeForecast !== null
                    ? `${formatNumberOrDash(activeForecast)}${singleUnit ? ` ${singleUnit}` : ""}`
                    : "-",
            sub: hasError
                ? "Unable to load forecast"
                : hasScenarioShift && baseForecast !== null
                ? `Baseline: ${formatNumberOrDash(baseForecast)} (${assumptions.demandAdjustmentPct > 0 ? "+" : ""}${assumptions.demandAdjustmentPct}%)`
                : kpis
                ? `Next ${kpis.horizonPeriods} planning periods (reconciled)`
                : "-",
            badge: hasError
                ? { text: "Error", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300" }
                : mixedUnitsNote
                ? { text: mixedUnitsNote, tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" }
                : hasScenarioShift
                ? { text: "Scenario", tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300" }
                : null,
            accent: "from-blue-500/15 via-blue-500/5 to-transparent border-blue-500/25",
            iconColor: "text-blue-600 dark:text-blue-400",
            valueTone: "text-foreground",
            icon: Target,
            explanation:
                "Total expected customer demand across the selected forecast period, summed from every product and customer region so all tables and totals match."
        },
        {
            key: "interval" as const,
            label: `Expected Range (${assumptions.confidenceLevel}%)`,
            value:
                activeLower !== null && activeUpper !== null
                    ? `${formatNumberOrDash(activeLower)} – ${formatNumberOrDash(activeUpper)}`
                    : "-",
            sub: hasError
                ? "Unable to load range"
                : activeLower !== null && activeUpper !== null && activeForecast
                ? `Typical swing: ±${Math.round(((activeUpper - activeLower) / 2 / Math.max(1, activeForecast)) * 100)}% around forecast`
                : "Insufficient history for prediction interval",
            badge: null,
            accent: "from-indigo-500/15 via-indigo-500/5 to-transparent border-indigo-500/25",
            iconColor: "text-indigo-600 dark:text-indigo-400",
            valueTone: "text-foreground",
            icon: Activity,
            explanation: `Low-to-high demand range at ${assumptions.confidenceLevel}% confidence, calibrated from past out-of-sample forecast errors.`
        },
        {
            key: "wape" as const,
            label: "Forecast Error (WAPE)",
            value: formatPercentOrDash(wape),
            sub: hasError
                ? "Unable to load accuracy"
                : wape !== null && kpis
                ? `${formatNumberOrDash(kpis.sumAbsoluteErrorUnits)} error ÷ ${formatNumberOrDash(kpis.evaluatedActualUnits)} evaluated actual`
                : "Need more order history to measure",
            badge: null,
            accent: "from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/25",
            iconColor: "text-emerald-600 dark:text-emerald-400",
            valueTone: wapeTone,
            icon: Gauge,
            explanation:
                "Measures how close past forecasts were to actual customer orders (total absolute error ÷ evaluated actual demand × 100). Lower is better; target is 15% or less."
        },
        {
            key: "bias" as const,
            label: "Forecast Bias",
            value: formatPercentOrDash(bias, 1, true),
            sub: hasError
                ? "Unable to load bias"
                : bias === null
                ? "Need more order history to measure"
                : Math.abs(bias) <= 5
                ? "Balanced (close to actuals)"
                : bias > 0
                ? "Running high (excess stock risk)"
                : "Running low (stockout risk)",
            badge: null,
            accent: "from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/25",
            iconColor: "text-amber-600 dark:text-amber-400",
            valueTone: biasTone,
            icon: Scale,
            explanation:
                "Shows whether past forecasts consistently ran too high (+) or too low (-) compared to actual customer orders."
        },
        {
            key: "trend" as const,
            label: "Demand Trend",
            value: trendDirection === "Insufficient Data" ? "-" : trendDirection,
            sub: hasError
                ? "Unable to load trend"
                : trendPct !== null
                ? `${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}% average change per period`
                : "Need at least 2 active periods",
            badge: null,
            accent: "from-cyan-500/15 via-cyan-500/5 to-transparent border-cyan-500/25",
            iconColor: "text-cyan-600 dark:text-cyan-400",
            valueTone: trendTone,
            icon:
                trendDirection === "Rising"
                    ? ArrowUpRight
                    : trendDirection === "Cooling"
                    ? ArrowDownRight
                    : trendDirection === "Stable"
                    ? Minus
                    : TrendingUp,
            explanation:
                "Overall direction of customer order volume across recent periods (Rising, Stable, Cooling, or Volatile)."
        }
    ];

    return (
        <TooltipProvider delayDuration={150}>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {cards.map((card, index) => {
                    const Icon = hasError ? AlertTriangle : card.icon;
                    return (
                        <motion.div
                            key={card.key}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.24, delay: index * 0.04 }}
                            role="button"
                            tabIndex={0}
                            onClick={() => onInspectMetric(card.key)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onInspectMetric(card.key);
                                }
                            }}
                            className={`group text-left relative overflow-hidden rounded-2xl border bg-gradient-to-br ${
                                hasError
                                    ? "from-rose-500/10 via-card to-card border-rose-500/30"
                                    : card.accent
                            } bg-card p-3.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all cursor-pointer`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-[11px] font-bold tracking-tight text-muted-foreground truncate">
                                    {card.label}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={`About ${card.label}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <Info className="h-3.5 w-3.5" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-[270px] text-xs leading-relaxed">
                                            {card.explanation}
                                        </TooltipContent>
                                    </Tooltip>
                                    <Icon
                                        className={`h-4 w-4 ${
                                            hasError ? "text-rose-500" : card.iconColor
                                        }`}
                                    />
                                </div>
                            </div>

                            <motion.div
                                key={`${card.key}-${card.value}`}
                                initial={{ opacity: 0.5, y: 3 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className={`text-xl font-black tracking-tight truncate ${
                                    hasError ? "text-rose-600 dark:text-rose-400" : card.valueTone
                                }`}
                            >
                                {card.value}
                            </motion.div>

                            <div className="mt-1.5 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-muted-foreground truncate">
                                    {card.sub}
                                </span>
                                {card.badge && (
                                    <Badge
                                        variant="secondary"
                                        className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${card.badge.tone}`}
                                    >
                                        {card.badge.text}
                                    </Badge>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </TooltipProvider>
    );
};
