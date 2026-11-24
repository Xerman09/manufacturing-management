"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    RefreshCw,
    ShieldAlert,
    Sparkles,
    Target,
    X,
    Zap
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
    ProductionAIAnalysisPayload,
    ProductionPerformanceReportPayload
} from "../types";

interface AIInsightDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    payload: ProductionPerformanceReportPayload | null;
    analysis: ProductionAIAnalysisPayload | null;
    isLoading: boolean;
    error: string | null;
    onGenerateAnalysis: () => void;
}

export const AIInsightDrawer: React.FC<AIInsightDrawerProps> = ({
    isOpen,
    onClose,
    payload,
    analysis,
    isLoading,
    error,
    onGenerateAnalysis
}) => {
    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    const getSeverityBadge = (sev: string) => {
        switch (sev) {
            case "critical":
                return (
                    <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                        Critical
                    </Badge>
                );
            case "high":
                return (
                    <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                    >
                        High
                    </Badge>
                );
            case "medium":
                return (
                    <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    >
                        Medium
                    </Badge>
                );
            default:
                return (
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                        Low
                    </Badge>
                );
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Drawer Pane */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute inset-y-0 right-0 max-w-full w-full sm:w-[580px] bg-background border-l border-border/80 shadow-2xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-4 sm:p-5 border-b flex items-center justify-between gap-3 bg-muted/20 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-foreground">
                                        AI Quality & Operations Insights
                                    </h2>
                                    <p className="text-xs text-muted-foreground">
                                        Root cause diagnostics, bottleneck detection, and corrective actions
                                    </p>
                                </div>
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onClose}
                                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                            {isLoading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-24 w-full rounded-2xl" />
                                    <Skeleton className="h-32 w-full rounded-2xl" />
                                    <Skeleton className="h-32 w-full rounded-2xl" />
                                </div>
                            ) : error ? (
                                <div className="p-6 text-center text-xs text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-2xl bg-rose-500/5 space-y-3">
                                    <AlertTriangle className="h-8 w-8 mx-auto text-rose-500" />
                                    <div>{error}</div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={onGenerateAnalysis}
                                        className="h-8 text-xs gap-1.5"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        Retry Analysis
                                    </Button>
                                </div>
                            ) : !analysis ? (
                                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-2xl space-y-3">
                                    <Sparkles className="h-8 w-8 mx-auto text-violet-500" />
                                    <p>No AI analysis generated yet for the current filtered scope.</p>
                                    <Button
                                        size="sm"
                                        onClick={onGenerateAnalysis}
                                        className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
                                    >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        Run AI Analysis
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Executive Summary */}
                                    <Card className="rounded-2xl border-violet-500/30 bg-violet-500/5 shadow-none">
                                        <CardHeader className="pb-2">
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                                                    <Zap className="h-3.5 w-3.5" /> Executive Summary
                                                </CardTitle>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[9px] border-violet-500/30 text-violet-600 dark:text-violet-400"
                                                >
                                                    {analysis.meta.modelUsed}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0 text-xs leading-relaxed text-foreground/90">
                                            {analysis.executiveSummary}
                                        </CardContent>
                                    </Card>

                                    {/* Key Observations */}
                                    {analysis.keyObservations.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                Key Observations
                                            </h3>
                                            <div className="space-y-1.5">
                                                {analysis.keyObservations.map((obs, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-start gap-2 p-2.5 rounded-xl border border-border/60 bg-card text-xs text-foreground/90"
                                                    >
                                                        <span className="h-1.5 w-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />
                                                        <span>{obs}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Bottlenecks & Yield Drag */}
                                    {analysis.bottlenecks.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                                                Detected Bottlenecks & Loss Drivers
                                            </h3>
                                            <div className="space-y-2">
                                                {analysis.bottlenecks.map((btn) => (
                                                    <div
                                                        key={btn.id}
                                                        className="p-3 rounded-xl border border-border/70 bg-card space-y-1.5 shadow-sm"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs font-bold text-foreground">
                                                                {btn.area}
                                                            </span>
                                                            {getSeverityBadge(btn.severity)}
                                                        </div>
                                                        <p className="text-xs text-foreground/80 leading-relaxed">
                                                            {btn.impact}
                                                        </p>
                                                        <div className="text-[10px] text-muted-foreground italic">
                                                            Evidence: {btn.evidence}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Proposed Corrective Actions */}
                                    {analysis.correctiveActions.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                <Target className="h-3.5 w-3.5 text-emerald-500" />
                                                Proposed Corrective Actions
                                            </h3>
                                            <div className="space-y-2.5">
                                                {analysis.correctiveActions.map((act) => (
                                                    <div
                                                        key={act.id}
                                                        className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="font-semibold text-xs text-foreground">
                                                                {act.title}
                                                            </div>
                                                            <Badge
                                                                variant="outline"
                                                                className="text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                                                            >
                                                                {act.targetMetric}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                                            {act.description}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                                            <ArrowRight className="h-3.5 w-3.5" />
                                                            {act.expectedImprovement}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Risk Flags */}
                                    {analysis.riskFlags.length > 0 && (
                                        <div className="space-y-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                Risk Flags
                                            </h3>
                                            <div className="space-y-1.5">
                                                {analysis.riskFlags.map((risk) => (
                                                    <div
                                                        key={risk.id}
                                                        className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-start gap-2 text-xs"
                                                    >
                                                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                                        <div>
                                                            <strong className="text-foreground">
                                                                {risk.flag}:
                                                            </strong>{" "}
                                                            <span className="text-muted-foreground">
                                                                {risk.detail}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 sm:p-4 border-t bg-muted/20 flex items-center justify-between gap-2 text-[10px] text-muted-foreground shrink-0">
                            <span>Advisory decision support · Human review required</span>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={onGenerateAnalysis}
                                disabled={isLoading}
                                className="h-7 text-xs gap-1.5 cursor-pointer"
                            >
                                <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
                                Refresh Analysis
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
