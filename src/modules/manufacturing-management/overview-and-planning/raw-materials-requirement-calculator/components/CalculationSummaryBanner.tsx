"use client";

import React from "react";
import {
    CheckCircle2,
    AlertTriangle,
    HelpCircle,
    Boxes,
    PackageCheck,
    PackageX,
    Gauge,
    Info,
} from "lucide-react";
import { CalculationResult } from "../types";

interface CalculationSummaryBannerProps {
    result: CalculationResult;
    onOpenAssumptions: () => void;
}

export const CalculationSummaryBanner: React.FC<CalculationSummaryBannerProps> = ({
    result,
    onOpenAssumptions,
}) => {
    const { verdict, summary, finishedGood, targetQuantity, targetUomShortcut } = result;

    const verdictConfig = {
        Sufficient: {
            bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
            icon: CheckCircle2,
            title: "Material Stock Sufficient",
            subtitle: "All raw ingredients and packaging materials are readily available in eligible on-hand inventory.",
            badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
        },
        Shortage: {
            bg: "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400",
            icon: AlertTriangle,
            title: "Material Shortage Detected",
            subtitle: `${summary.shortageCount} component${summary.shortageCount > 1 ? "s" : ""} require replenishment or purchase order creation.`,
            badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
        },
        "Incomplete Data": {
            bg: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
            icon: HelpCircle,
            title: "Incomplete Recipe Data",
            subtitle: "Missing BOM component lines, invalid batch size, or unsupported density conversions.",
            badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
        },
    }[verdict];

    const VerdictIcon = verdictConfig.icon;

    return (
        <div className="space-y-3">
            {/* 1. Main Feasibility Banner */}
            <div
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border ${verdictConfig.bg} shadow-2xs transition-all`}
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background/80 shadow-2xs">
                        <VerdictIcon className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold tracking-tight">
                                {verdictConfig.title}
                            </h3>
                            <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${verdictConfig.badge}`}
                            >
                                {verdict}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {verdictConfig.subtitle} Target output:{" "}
                            <span className="font-semibold text-foreground">
                                {targetQuantity.toLocaleString()} {targetUomShortcut}
                                {result.assumptions.packagingMultiplier && result.assumptions.packagingMultiplier > 1 ? (
                                    <span className="font-mono text-primary font-bold ml-1">
                                        (equiv. to {((result.effectiveTargetQuantity || (targetQuantity * result.assumptions.packagingMultiplier))).toLocaleString()} {finishedGood.baseUomShortcut || "Base Units"})
                                    </span>
                                ) : null}
                            </span>{" "}
                            of {finishedGood.productName} ({finishedGood.productCode})
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onOpenAssumptions}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/80 bg-background/80 hover:bg-background text-xs font-medium text-foreground shadow-2xs transition-all cursor-pointer shrink-0"
                >
                    <Info className="h-3.5 w-3.5 text-primary" />
                    <span>View Recipe Assumptions</span>
                </button>
            </div>

            {/* 2. Key Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Total Components */}
                <div className="bg-card border border-border/70 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Total Components
                        </p>
                        <p className="text-xl font-bold text-foreground mt-0.5">
                            {summary.totalComponents}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            {summary.rawMaterialsCount} Raw, {summary.packagingCount} Packaging
                        </p>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Boxes className="h-5 w-5" />
                    </div>
                </div>

                {/* Sufficient Items */}
                <div className="bg-card border border-border/70 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Sufficient Lines
                        </p>
                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {summary.sufficientCount}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Covered by current on-hand
                        </p>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <PackageCheck className="h-5 w-5" />
                    </div>
                </div>

                {/* Shortage Items */}
                <div className="bg-card border border-border/70 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Shortage Lines
                        </p>
                        <p className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                            {summary.shortageCount}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Requiring procurement
                        </p>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        <PackageX className="h-5 w-5" />
                    </div>
                </div>

                {/* Overall Fill Rate */}
                <div className="bg-card border border-border/70 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Material Readiness
                        </p>
                        <p className="text-xl font-bold text-foreground mt-0.5">
                            {summary.readinessPercentage}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Component fill rate
                        </p>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Gauge className="h-5 w-5" />
                    </div>
                </div>
            </div>
        </div>
    );
};
