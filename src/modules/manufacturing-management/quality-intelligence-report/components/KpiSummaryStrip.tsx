"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    AlertTriangle,
    Boxes,
    CheckCircle2,
    Layers,
    Repeat,
    ShieldAlert,
    TrendingDown
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { safeFormatNumber, safeFormatPercent } from "../utils/qualityMath";
import type { QualityKpiMetrics } from "../types";

interface KpiSummaryStripProps {
    kpis: QualityKpiMetrics;
    isLoading?: boolean;
}

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.06
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({ kpis, isLoading }) => {
    // Determine color badges
    const getDefectRateColor = (rate: number | null) => {
        if (rate === null) return "text-muted-foreground";
        if (rate <= 2) return "text-emerald-600 dark:text-emerald-400";
        if (rate <= 5) return "text-amber-600 dark:text-amber-400";
        return "text-rose-600 dark:text-rose-400";
    };

    const getFpyColor = (rate: number | null) => {
        if (rate === null) return "text-muted-foreground";
        if (rate >= 95) return "text-emerald-600 dark:text-emerald-400";
        if (rate >= 85) return "text-amber-600 dark:text-amber-400";
        return "text-rose-600 dark:text-rose-400";
    };

    const getScrapColor = (rate: number | null) => {
        if (rate === null) return "text-muted-foreground";
        if (rate <= 1.5) return "text-emerald-600 dark:text-emerald-400";
        if (rate <= 3.5) return "text-amber-600 dark:text-amber-400";
        return "text-rose-600 dark:text-rose-400";
    };

    const getQaHoldColor = (count: number) => {
        if (count === 0) return "text-emerald-600 dark:text-emerald-400";
        if (count <= 2) return "text-amber-600 dark:text-amber-400";
        return "text-rose-600 dark:text-rose-400";
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
        >
            {/* Card 1: Defect Rate */}
            <motion.div variants={itemVariants}>
                <Card className="rounded-2xl border-border/60 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-3.5">
                        <div className="flex items-center justify-between gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                            <span>Defect Rate</span>
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                        </div>
                        <div className={`text-xl font-extrabold tracking-tight mt-1 ${getDefectRateColor(kpis.defectRatePct)}`}>
                            {safeFormatPercent(kpis.defectRatePct)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {kpis.totalDefectiveUnits > 0
                                ? `${safeFormatNumber(kpis.totalDefectiveUnits)} defective units`
                                : "Zero defectives recorded"}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Card 2: First Pass Yield */}
            <motion.div variants={itemVariants}>
                <Card className="rounded-2xl border-border/60 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-3.5">
                        <div className="flex items-center justify-between gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                            <span>First Pass Yield</span>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        </div>
                        <div className={`text-xl font-extrabold tracking-tight mt-1 ${getFpyColor(kpis.fpyPct)}`}>
                            {safeFormatPercent(kpis.fpyPct)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            Passed with zero rework
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Card 3: Scrap Rate */}
            <motion.div variants={itemVariants}>
                <Card className="rounded-2xl border-border/60 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-3.5">
                        <div className="flex items-center justify-between gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                            <span>Scrap Rate</span>
                            <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                        <div className={`text-xl font-extrabold tracking-tight mt-1 ${getScrapColor(kpis.scrapRatePct)}`}>
                            {safeFormatPercent(kpis.scrapRatePct)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {safeFormatNumber(kpis.totalScrapUnits)} units scrapped
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Card 4: Repeat Defect Types */}
            <motion.div variants={itemVariants}>
                <Card className="rounded-2xl border-border/60 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-3.5">
                        <div className="flex items-center justify-between gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                            <span>Repeat Defects</span>
                            <Repeat className="h-3.5 w-3.5 text-blue-500" />
                        </div>
                        <div className="text-xl font-extrabold tracking-tight mt-1 text-foreground">
                            {kpis.repeatDefectCount}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            Occurring in 2+ batches
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Card 5: QA Hold Batches */}
            <motion.div variants={itemVariants}>
                <Card className="rounded-2xl border-border/60 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-3.5">
                        <div className="flex items-center justify-between gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                            <span>QA Hold Batches</span>
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                        <div className={`text-xl font-extrabold tracking-tight mt-1 ${getQaHoldColor(kpis.qaHoldBatchCount)}`}>
                            {kpis.qaHoldBatchCount}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {kpis.qaHoldBatchCount > 0 ? "Requiring QA clearance" : "Zero batches on hold"}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Card 6: Inspected Units */}
            <motion.div variants={itemVariants}>
                <Card className="rounded-2xl border-border/60 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-3.5">
                        <div className="flex items-center justify-between gap-1 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                            <span>Inspected Units</span>
                            <Boxes className="h-3.5 w-3.5 text-slate-500" />
                        </div>
                        <div className="text-xl font-extrabold tracking-tight mt-1 text-foreground">
                            {safeFormatNumber(kpis.totalInspectedUnits)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            Across {kpis.totalJobOrders} Job Orders
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div>
    );
};
