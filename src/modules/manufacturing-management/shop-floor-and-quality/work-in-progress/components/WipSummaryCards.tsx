"use client";

import { motion } from "framer-motion";
import {
    AlertTriangle,
    Boxes,
    ClipboardList,
    Factory,
    Flame
} from "lucide-react";
import type { WipSummaryMetrics } from "../types";
import { formatQty } from "../utils/wip-calculations";

interface WipSummaryCardsProps {
    metrics: WipSummaryMetrics;
    loading?: boolean;
}

export default function WipSummaryCards({ metrics, loading = false }: WipSummaryCardsProps) {
    const cards = [
        {
            title: "Active Job Orders",
            value: loading ? "-" : metrics.totalActiveJobOrders.toLocaleString(),
            subtitle: "JOs with committed materials",
            icon: ClipboardList,
            iconColor: "text-blue-500",
            bgGradient: "from-blue-500/10 via-blue-500/5 to-transparent",
            borderColor: "border-blue-500/20",
        },
        {
            title: "Warehouse Reservations",
            value: loading ? "-" : formatQty(metrics.totalReservedQuantity),
            subtitle: "Earmarked stock in storage",
            icon: Boxes,
            iconColor: "text-amber-500",
            bgGradient: "from-amber-500/10 via-amber-500/5 to-transparent",
            borderColor: "border-amber-500/20",
        },
        {
            title: "Issued to Floor (WIP Input)",
            value: loading ? "-" : formatQty(metrics.totalIssuedQuantity),
            subtitle: "Physically staged on line",
            icon: Factory,
            iconColor: "text-indigo-500",
            bgGradient: "from-indigo-500/10 via-indigo-500/5 to-transparent",
            borderColor: "border-indigo-500/20",
        },
        {
            title: "Consumed in Production",
            value: loading ? "-" : formatQty(metrics.totalConsumedQuantity),
            subtitle: "Absorbed during shift runs",
            icon: Flame,
            iconColor: "text-emerald-500",
            bgGradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
            borderColor: "border-emerald-500/20",
        },
        {
            title: "Net Remaining Floor WIP",
            value: loading ? "-" : formatQty(metrics.totalRemainingWipQuantity),
            subtitle: "Active unfinished material",
            icon: Boxes,
            iconColor: "text-cyan-500",
            bgGradient: "from-cyan-500/10 via-cyan-500/5 to-transparent",
            borderColor: "border-cyan-500/20",
            highlight: true,
        },
        {
            title: "Exceptions / Negative WIP",
            value: loading ? "-" : metrics.totalExceptionsCount.toString(),
            subtitle: metrics.totalExceptionsCount > 0 ? "Requires investigation" : "All reconciliations balanced",
            icon: AlertTriangle,
            iconColor: metrics.totalExceptionsCount > 0 ? "text-rose-500" : "text-emerald-500",
            bgGradient: metrics.totalExceptionsCount > 0 ? "from-rose-500/15 via-rose-500/5 to-transparent" : "from-emerald-500/10 via-emerald-500/5 to-transparent",
            borderColor: metrics.totalExceptionsCount > 0 ? "border-rose-500/40" : "border-emerald-500/20",
            isWarning: metrics.totalExceptionsCount > 0,
        },
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.08,
            },
        },
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 15 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.35, ease: "easeOut" as const },
        },
    };

    return (
        <motion.div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {cards.map((c) => {
                const Icon = c.icon;
                return (
                    <motion.div
                        key={c.title}
                        variants={cardVariants}
                        className={`relative overflow-hidden rounded-xl border bg-card p-3.5 shadow-xs transition-all hover:shadow-md ${c.borderColor} ${
                            c.highlight ? "ring-1 ring-cyan-500/30" : ""
                        }`}
                    >
                        <div className={`absolute inset-0 bg-gradient-to-br ${c.bgGradient} pointer-events-none`} />
                        <div className="relative z-10 flex flex-col justify-between h-full gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider line-clamp-1">
                                    {c.title}
                                </span>
                                <div className={`p-1.5 rounded-lg bg-background/80 shadow-xs border ${c.iconColor}`}>
                                    <Icon className="h-4 w-4" />
                                </div>
                            </div>
                            <div>
                                <div
                                    className={`text-xl sm:text-2xl font-bold tracking-tight ${
                                        c.isWarning ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                                    }`}
                                >
                                    {c.value}
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{c.subtitle}</p>
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
