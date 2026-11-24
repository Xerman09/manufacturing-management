"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    AlertOctagon,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Gauge,
    Info,
    ShieldCheck,
    Trash2
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@/components/ui/tooltip";
import type { PPRKpiMetrics } from "../types";

interface KpiSummaryStripProps {
    kpis: PPRKpiMetrics | null;
    hasError: boolean;
    onSelectCard?: (metricKey: string) => void;
}

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({
    kpis,
    hasError,
    onSelectCard
}) => {
    const formatPct = (val: number | null | undefined): string => {
        if (val === null || val === undefined || isNaN(val)) return "-";
        return `${val.toFixed(1)}%`;
    };

    const formatNum = (val: number | null | undefined, suffix: string = ""): string => {
        if (val === null || val === undefined || isNaN(val)) return "-";
        return `${val.toLocaleString()}${suffix}`;
    };

    const oee = kpis?.oeePct;
    const yieldRate = kpis?.avgYieldRatePct;
    const scrapRate = kpis?.avgScrapRatePct;
    const qaPass = kpis?.qaPassRatePct;

    const oeeTone =
        oee === null || oee === undefined
            ? "text-muted-foreground"
            : oee >= 85
            ? "text-emerald-600 dark:text-emerald-400"
            : oee >= 70
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400";

    const yieldTone =
        yieldRate === null || yieldRate === undefined
            ? "text-muted-foreground"
            : yieldRate >= 95
            ? "text-emerald-600 dark:text-emerald-400"
            : yieldRate >= 85
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400";

    const scrapTone =
        scrapRate === null || scrapRate === undefined
            ? "text-muted-foreground"
            : scrapRate <= 2
            ? "text-emerald-600 dark:text-emerald-400"
            : scrapRate <= 5
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400";

    const qaTone =
        qaPass === null || qaPass === undefined
            ? "text-muted-foreground"
            : qaPass >= 98
            ? "text-emerald-600 dark:text-emerald-400"
            : qaPass >= 90
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400";

    const cards = [
        {
            key: "oee",
            label: "Estimated OEE",
            value: formatPct(kpis?.oeePct),
            sub: kpis
                ? `Avail ${formatPct(kpis.availabilityPct)} · Perf ${formatPct(kpis.performancePct)}`
                : "-",
            icon: Gauge,
            iconColor: "text-violet-600 dark:text-violet-400",
            accent: "from-violet-500/15 via-violet-500/5 to-transparent border-violet-500/25",
            valueTone: oeeTone,
            explanation:
                "Overall Equipment Effectiveness: Availability × Performance × Quality. World-class benchmark is 85%+."
        },
        {
            key: "yield",
            label: "Avg Yield Rate",
            value: formatPct(kpis?.avgYieldRatePct),
            sub: kpis ? `${kpis.completedJobOrders} / ${kpis.totalJobOrders} batches completed` : "-",
            icon: CheckCircle2,
            iconColor: "text-emerald-600 dark:text-emerald-400",
            accent: "from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/25",
            valueTone: yieldTone,
            explanation:
                "Completed finished goods output as a percentage of target planned production. Higher is better."
        },
        {
            key: "scrap",
            label: "Avg Scrap Rate",
            value: formatPct(kpis?.avgScrapRatePct),
            sub: "Losses in process & stations",
            icon: Trash2,
            iconColor: "text-amber-600 dark:text-amber-400",
            accent: "from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/25",
            valueTone: scrapTone,
            explanation:
                "Total scrap generated divided by total yield + scrap. Lower is better; target is under 3.0%."
        },
        {
            key: "qa",
            label: "QA Pass Rate",
            value: formatPct(kpis?.qaPassRatePct),
            sub: "In-process & final releases",
            icon: ShieldCheck,
            iconColor: "text-sky-600 dark:text-sky-400",
            accent: "from-sky-500/15 via-sky-500/5 to-transparent border-sky-500/25",
            valueTone: qaTone,
            explanation:
                "Percentage of quality inspection parameters passed during production and release verification."
        },
        {
            key: "cycletime",
            label: "Avg Cycle Time",
            value: formatNum(kpis?.avgCycleTimeHrs, " hrs"),
            sub: "Start to complete duration",
            icon: Clock,
            iconColor: "text-indigo-600 dark:text-indigo-400",
            accent: "from-indigo-500/15 via-indigo-500/5 to-transparent border-indigo-500/25",
            valueTone: "text-foreground",
            explanation:
                "Average duration elapsed from job order production start to production completion."
        },
        {
            key: "downtime",
            label: "Asset Downtime",
            value: formatNum(kpis?.totalDowntimeHrs, " hrs"),
            sub: "Unplanned maintenance",
            icon: AlertOctagon,
            iconColor: "text-orange-600 dark:text-orange-400",
            accent: "from-orange-500/15 via-orange-500/5 to-transparent border-orange-500/25",
            valueTone: "text-foreground",
            explanation:
                "Total accumulated hours of asset breakdown and corrective maintenance during this period."
        }
    ];

    return (
        <TooltipProvider delayDuration={150}>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {cards.map((card, index) => {
                    const Icon = hasError ? AlertTriangle : card.icon;
                    return (
                        <motion.div
                            key={card.key}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.24, delay: index * 0.04 }}
                            onClick={() => onSelectCard?.(card.key)}
                            className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${
                                hasError
                                    ? "from-rose-500/10 via-card to-card border-rose-500/30"
                                    : card.accent
                            } bg-card p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer`}
                        >
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                                    {card.label}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={`About ${card.label}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/70 hover:text-foreground"
                                            >
                                                <Info className="h-3 w-3" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-[260px] text-xs leading-relaxed">
                                            {card.explanation}
                                        </TooltipContent>
                                    </Tooltip>
                                    <Icon className={`h-3.5 w-3.5 ${hasError ? "text-rose-500" : card.iconColor}`} />
                                </div>
                            </div>

                            <div
                                className={`text-xl font-black tracking-tight truncate ${
                                    hasError ? "text-rose-600 dark:text-rose-400" : card.valueTone
                                }`}
                            >
                                {card.value}
                            </div>

                            <div className="mt-1 text-[10px] text-muted-foreground truncate">
                                {card.sub}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </TooltipProvider>
    );
};
