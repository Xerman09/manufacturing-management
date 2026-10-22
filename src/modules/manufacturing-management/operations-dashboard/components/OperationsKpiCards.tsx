"use client";

import React from "react";
import {
    FileCheck2,
    AlertTriangle,
    Boxes,
    Layers,
    ClipboardCheck,
    Truck,
} from "lucide-react";
import { KpiTotals, QueueTabKey } from "../types/operations-dashboard.types";

interface OperationsKpiCardsProps {
    totals?: KpiTotals;
    activeTab: QueueTabKey;
    onSelectTab: (tab: QueueTabKey) => void;
}

export const OperationsKpiCards: React.FC<OperationsKpiCardsProps> = ({
    totals,
    activeTab,
    onSelectTab,
}) => {
    const cards = [
        {
            key: "approvals" as QueueTabKey,
            title: "Orders Awaiting Approval",
            value: totals?.ordersAwaitingApproval ?? 0,
            subtitle: "Sales orders needing review",
            icon: FileCheck2,
            color: "text-amber-500",
            bgColor: "bg-amber-500/10",
            borderColor: "border-amber-500/20",
            activeBorder: "border-amber-500 ring-2 ring-amber-500/20",
        },
        {
            key: "shortages" as QueueTabKey,
            title: "Material Shortages",
            value: totals?.materialShortages ?? 0,
            subtitle: "Below minimum inventory threshold",
            icon: AlertTriangle,
            color: "text-rose-500",
            bgColor: "bg-rose-500/10",
            borderColor: "border-rose-500/20",
            activeBorder: "border-rose-500 ring-2 ring-rose-500/20",
        },
        {
            key: "active_jos" as QueueTabKey,
            title: "Active Job Orders",
            value: totals?.activeJobOrders ?? 0,
            subtitle: "Currently scheduled or running",
            icon: Boxes,
            color: "text-blue-500",
            bgColor: "bg-blue-500/10",
            borderColor: "border-blue-500/20",
            activeBorder: "border-blue-500 ring-2 ring-blue-500/20",
        },
        {
            key: "wip" as QueueTabKey,
            title: "Remaining WIP Units",
            value: totals?.remainingWipQuantity ?? 0,
            subtitle: "Work-in-progress on shop floor",
            icon: Layers,
            color: "text-indigo-500",
            bgColor: "bg-indigo-500/10",
            borderColor: "border-indigo-500/20",
            activeBorder: "border-indigo-500 ring-2 ring-indigo-500/20",
        },
        {
            key: "qa" as QueueTabKey,
            title: "QA Backlog Queues",
            value: totals?.pendingQaInspections ?? 0,
            subtitle: "Inspection lots awaiting sign-off",
            icon: ClipboardCheck,
            color: "text-violet-500",
            bgColor: "bg-violet-500/10",
            borderColor: "border-violet-500/20",
            activeBorder: "border-violet-500 ring-2 ring-violet-500/20",
        },
        {
            key: "fulfillment" as QueueTabKey,
            title: "Fulfillment Queues",
            value: totals?.readyForFulfillment ?? 0,
            subtitle: "Packed and ready for dispatch",
            icon: Truck,
            color: "text-emerald-500",
            bgColor: "bg-emerald-500/10",
            borderColor: "border-emerald-500/20",
            activeBorder: "border-emerald-500 ring-2 ring-emerald-500/20",
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {cards.map((card) => {
                const Icon = card.icon;
                const isSelected = activeTab === card.key;

                return (
                    <button
                        key={card.key}
                        type="button"
                        onClick={() => onSelectTab(card.key)}
                        className={`flex flex-col text-left p-3.5 rounded-xl border bg-card transition-all cursor-pointer hover:shadow-md ${
                            isSelected
                                ? card.activeBorder
                                : `${card.borderColor} hover:border-slate-300 dark:hover:border-slate-700`
                        }`}
                    >
                        <div className="flex items-center justify-between w-full mb-2">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider line-clamp-1">
                                {card.title}
                            </span>
                            <div className={`p-1.5 rounded-lg ${card.bgColor} ${card.color}`}>
                                <Icon className="h-4 w-4" />
                            </div>
                        </div>

                        <div className="mt-1">
                            <span className="text-2xl font-black text-foreground tracking-tight">
                                {card.value.toLocaleString()}
                            </span>
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="truncate">{card.subtitle}</span>
                            <span className="text-[10px] font-semibold text-primary/80 shrink-0 ml-1">
                                View queue &rarr;
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};
