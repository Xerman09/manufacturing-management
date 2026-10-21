import React from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, ArrowDownRight } from "lucide-react";
import { StockProjectionKpis, ProjectionStatus } from "../types";

interface StockProjectionKpiCardsProps {
    kpis: StockProjectionKpis;
    loading: boolean;
    onSelectStatusFilter: (status: ProjectionStatus | "ALL") => void;
}

export default function StockProjectionKpiCards({
    kpis,
    loading,
    onSelectStatusFilter,
}: StockProjectionKpiCardsProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse p-4" />
                ))}
            </div>
        );
    }

    const cards = [
        {
            title: "Critical Runout Risk",
            subtitle: "≤ 3 working days remaining",
            count: kpis.critical_supply_count,
            status: "CRITICAL_SUPPLY" as ProjectionStatus,
            icon: AlertTriangle,
            bgClass: "bg-red-500/10 hover:bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-400",
            iconClass: "text-red-500 bg-red-500/20",
        },
        {
            title: "Low Stock Watch",
            subtitle: "≤ 14 working days remaining",
            count: kpis.low_supply_count,
            status: "LOW_SUPPLY" as ProjectionStatus,
            icon: ArrowDownRight,
            bgClass: "bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400",
            iconClass: "text-amber-500 bg-amber-500/20",
        },
        {
            title: "Adequate Supply",
            subtitle: "> 14 working days remaining",
            count: kpis.adequate_supply_count,
            status: "ESTIMATED_SUPPLY" as ProjectionStatus,
            icon: CheckCircle2,
            bgClass: "bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
            iconClass: "text-emerald-500 bg-emerald-500/20",
        },
        {
            title: "Data Readiness Gap",
            subtitle: "Insufficient history or no usage",
            count: kpis.insufficient_history_count + kpis.no_consumption_count,
            status: "INSUFFICIENT_HISTORY" as ProjectionStatus,
            icon: HelpCircle,
            bgClass: "bg-purple-500/10 hover:bg-purple-500/15 border-purple-500/30 text-purple-700 dark:text-purple-400",
            iconClass: "text-purple-500 bg-purple-500/20",
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                return (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => onSelectStatusFilter(card.status)}
                        className={`text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${card.bgClass}`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {card.title}
                            </span>
                            <div className={`p-1.5 rounded-lg ${card.iconClass}`}>
                                <Icon className="h-4 w-4" />
                            </div>
                        </div>

                        <div className="mt-2 flex items-baseline justify-between">
                            <div className="text-2xl font-bold tracking-tight text-foreground">
                                {card.count}
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                                {card.subtitle}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
