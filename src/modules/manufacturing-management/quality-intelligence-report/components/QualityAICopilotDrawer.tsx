"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    CheckCircle2,
    FileText,
    Lightbulb,
    MessageSquare,
    RefreshCw,
    ShieldAlert,
    Sparkles,
    X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityChatBox } from "./QualityChatBox";
import type {
    QualityAICommentaryPayload,
    QualityReportPayload
} from "../types";

interface QualityAICopilotDrawerProps {
    open: boolean;
    onClose: () => void;
    payload: QualityReportPayload;
    aiCommentary: QualityAICommentaryPayload | null;
    isLoading: boolean;
    error: string | null;
    onGenerateAnalysis: () => void;
}

export const QualityAICopilotDrawer: React.FC<QualityAICopilotDrawerProps> = ({
    open,
    onClose,
    payload,
    aiCommentary,
    isLoading,
    error,
    onGenerateAnalysis
}) => {
    const [activeView, setActiveView] = useState<"report" | "chat">("report");
    const tier = payload.meta.aiTier;

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute inset-y-0 right-0 w-full max-w-full sm:w-[640px] bg-background border-l border-border/80 shadow-2xl flex flex-col"
                    >
                        {/* Header: title + tier, then scope line + view switcher */}
                        <div className="p-4 sm:p-5 border-b border-border/60 bg-muted/20 shrink-0 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4" />
                                    </div>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <h2 className="truncate text-base font-bold text-foreground">
                                            Quality Intelligence AI Insight
                                        </h2>
                                        <Badge
                                            variant="outline"
                                            className="shrink-0 text-[10px] px-2 py-0.5 border-blue-500/40 text-blue-700 dark:text-blue-300 font-semibold"
                                        >
                                            {tier.tierName}
                                        </Badge>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onClose}
                                    aria-label="Close AI insight drawer"
                                    className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <p className="min-w-0 truncate text-xs text-muted-foreground">
                                    Scope: {payload.meta.dateLabel} · {payload.meta.productLabel} ·{" "}
                                    {payload.meta.workCenterLabel}
                                </p>

                                <div className="flex shrink-0 items-center bg-muted/70 p-0.5 rounded-xl border border-border/70">
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
                                                ? "bg-background text-blue-600 dark:text-blue-400 shadow-xs font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        <span>AI Copilot</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {activeView === "chat" ? (
                            <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4">
                                <QualityChatBox payload={payload} />
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
                                {isLoading ? (
                                    <div className="space-y-3">
                                        <Skeleton className="h-24 w-full rounded-2xl" />
                                        <Skeleton className="h-28 w-full rounded-2xl" />
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
                                ) : !aiCommentary ? (
                                    <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-2xl space-y-3">
                                        <Sparkles className="h-8 w-8 mx-auto text-blue-500" />
                                        <p>
                                            No AI analysis generated yet for the{" "}
                                            {payload.kpis.totalJobOrders} job order batches in the current
                                            filtered scope.
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={onGenerateAnalysis}
                                            className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                                        >
                                            <Sparkles className="h-3.5 w-3.5" />
                                            Run AI Analysis
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Executive Summary */}
                                        <Card className="rounded-2xl border-blue-500/30 bg-blue-500/5 shadow-none">
                                            <CardHeader className="pb-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                                                        <Sparkles className="h-3.5 w-3.5" /> Executive Summary
                                                    </CardTitle>
                                                    {aiCommentary.meta.isFallback ? (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                                        >
                                                            Rule-based summary — no AI used
                                                        </Badge>
                                                    ) : (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[9px] border-blue-500/30 text-blue-600 dark:text-blue-400"
                                                        >
                                                            {aiCommentary.meta.modelUsed}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </CardHeader>
                                            <CardContent className="pt-0 text-xs leading-relaxed text-foreground/90">
                                                {aiCommentary.executiveSummary}
                                            </CardContent>
                                        </Card>

                                        {/* Verified Findings */}
                                        {aiCommentary.verifiedFacts.length > 0 && (
                                            <div className="space-y-2">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                                    Verified Findings
                                                </h3>
                                                <div className="space-y-1.5">
                                                    {aiCommentary.verifiedFacts.map((fact, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-start gap-2 p-2.5 rounded-xl border border-border/60 bg-card text-xs text-foreground/90"
                                                        >
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                                            <span className="leading-relaxed">{fact}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Root-Cause Hypotheses */}
                                        {aiCommentary.hypotheses.length > 0 && (
                                            <div className="space-y-2">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                                                    Root-Cause Hypotheses
                                                </h3>
                                                <div className="space-y-2.5">
                                                    {aiCommentary.hypotheses.map((h) => (
                                                        <div
                                                            key={h.id}
                                                            className="p-3 rounded-xl border border-amber-500/30 bg-card space-y-1.5 shadow-sm"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-xs font-bold text-foreground">
                                                                    {h.title}
                                                                </span>
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[9px] uppercase font-bold shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                                                >
                                                                    {h.confidence} confidence
                                                                </Badge>
                                                            </div>
                                                            <p className="text-xs text-foreground/80 leading-relaxed">
                                                                <strong className="text-foreground">
                                                                    Fact:{" "}
                                                                </strong>
                                                                {h.observation}
                                                            </p>
                                                            <div className="p-2 rounded-lg bg-amber-500/10 text-xs leading-relaxed">
                                                                <strong className="text-amber-700 dark:text-amber-300">
                                                                    Hypothesis:{" "}
                                                                </strong>
                                                                <span className="text-foreground">
                                                                    {h.hypothesis}
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground italic">
                                                                Evidence: {h.evidence}
                                                            </div>
                                                            <div className="text-[11px] text-emerald-700 dark:text-emerald-300 pt-1.5 border-t border-border/50">
                                                                <strong>Proposed Action: </strong>
                                                                {h.proposedAction}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Containment Priorities */}
                                        {aiCommentary.containmentPriorities.length > 0 && (
                                            <div className="space-y-2">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                    <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                                                    Containment Action Priorities
                                                </h3>
                                                <div className="space-y-1.5">
                                                    {aiCommentary.containmentPriorities.map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-start gap-2 p-2.5 rounded-xl border border-border/60 bg-card text-xs text-foreground/90"
                                                        >
                                                            <span className="font-bold text-rose-600 dark:text-rose-400 shrink-0">
                                                                {idx + 1}.
                                                            </span>
                                                            <span className="leading-relaxed">{item}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Footer (report view only) */}
                        {activeView === "report" && (
                            <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-2 text-[10px] text-muted-foreground shrink-0">
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
