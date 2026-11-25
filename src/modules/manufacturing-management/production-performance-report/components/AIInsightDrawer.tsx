"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    CheckCircle2,
    FileText,
    Lock,
    MessageSquare,
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
import { ProductionPerformanceChatBox } from "./ProductionPerformanceChatBox";

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
    const [activeView, setActiveView] = useState<"report" | "chat">("report");
    const aiTier = payload?.meta?.aiTier || analysis?.meta?.aiTier;
    const isExecutive = Boolean(aiTier && aiTier.tierLevel >= 3);

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
                        className="absolute inset-y-0 right-0 max-w-full w-full sm:w-[620px] bg-background border-l border-border/80 shadow-2xl flex flex-col"
                    >
                        {/* Header Container */}
                        <div className="p-4 sm:p-5 border-b bg-muted/20 shrink-0 space-y-3">
                            {/* Row 1: Title, Tier Badge, Close */}
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="h-8 w-8 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-base font-bold text-foreground">
                                            AI Operations & Quality
                                        </h2>
                                        {aiTier && (
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] px-2 py-0.5 border-violet-500/40 text-violet-700 dark:text-violet-300 font-semibold shrink-0"
                                            >
                                                {aiTier.tierName}
                                            </Badge>
                                        )}
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

                            {/* Row 2: Scope subtitle on Left, View switcher Tabs on Right */}
                            <div className="flex items-center justify-between gap-3 text-xs">
                                {payload ? (
                                    <p className="text-xs text-muted-foreground truncate">
                                        Scope: {payload.meta.dateLabel} · {payload.meta.productLabel}
                                    </p>
                                ) : (
                                    <div />
                                )}

                                <div className="flex items-center bg-muted/70 p-0.5 rounded-xl border border-border/70 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setActiveView("report")}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                            activeView === "report"
                                                ? "bg-background text-foreground shadow-xs font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <FileText className="h-3.5 w-3.5" />
                                        <span>Report</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveView("chat")}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                            activeView === "chat"
                                                ? "bg-background text-violet-600 dark:text-violet-400 shadow-xs font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        <span>AI Copilot</span>
                                        <span className="h-1.5 w-1.5 rounded-full bg-violet-600 dark:bg-violet-400 shrink-0" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Drawer Body Content */}
                        {activeView === "chat" ? (
                            isExecutive && payload ? (
                                <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
                                    <ProductionPerformanceChatBox payload={payload} />
                                </div>
                            ) : !payload ? (
                                <div className="flex-1 p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center space-y-3">
                                    <AlertTriangle className="h-8 w-8 text-amber-500" />
                                    <p>Please load production report data first before initiating AI Copilot conversation.</p>
                                </div>
                            ) : (
                                <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                                        <Lock className="h-6 w-6" />
                                    </div>
                                    <div className="max-w-md space-y-1.5">
                                        <h3 className="text-sm font-bold text-foreground">
                                            Executive AI Copilot Locked
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Interactive conversational AI is exclusive to the **Executive Tier (Level 3)**.
                                            This module is currently assigned to **{aiTier?.tierName || "Basic/Pro"}**.
                                        </p>
                                        <p className="text-[11px] text-muted-foreground/80 mt-2">
                                            Upgrade this module&apos;s AI Tier in System Settings &gt; Modules to unlock unlimited real-time conversational analysis.
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setActiveView("report")}
                                        className="h-8 text-xs gap-1.5 cursor-pointer"
                                    >
                                        <FileText className="h-3.5 w-3.5" />
                                        View Generated Report Instead
                                    </Button>
                                </div>
                            )
                        ) : (
                            /* Report Insights View */
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
                                            className="h-8 text-xs gap-1.5 cursor-pointer"
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
                                                    {analysis.meta.isFallback ? (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                                        >
                                                            Rule engine summary
                                                        </Badge>
                                                    ) : (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[9px] border-violet-500/30 text-violet-600 dark:text-violet-400"
                                                        >
                                                            {analysis.meta.modelUsed}
                                                        </Badge>
                                                    )}
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
                        )}

                        {/* Footer (shown in report view) */}
                        {activeView === "report" && (
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
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
