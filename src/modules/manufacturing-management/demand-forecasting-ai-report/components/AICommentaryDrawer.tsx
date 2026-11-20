"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    CheckCircle2,
    FileSearch,
    FileText,
    Info,
    MessageSquare,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    X
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
    DemandAICommentaryPayload,
    DemandForecastReportPayload,
    ScenarioAssumptions
} from "../types";
import { DemandForecastingChatBox } from "./DemandForecastingChatBox";

interface AICommentaryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    payload: DemandForecastReportPayload | null;
    assumptions: ScenarioAssumptions;
    commentary: DemandAICommentaryPayload | null;
    isLoading: boolean;
    error: string | null;
    reviewedIds: Record<string, boolean>;
    onToggleReviewed: (id: string) => void;
    onGenerateCommentary: () => void;
    onOpenEvidence: (
        title: string,
        subtitle: string,
        evidenceIds: string[],
        totalEvidenceCount?: number
    ) => void;
}

export const AICommentaryDrawer: React.FC<AICommentaryDrawerProps> = ({
    isOpen,
    onClose,
    payload,
    assumptions,
    commentary,
    isLoading,
    error,
    reviewedIds,
    onToggleReviewed,
    onGenerateCommentary,
    onOpenEvidence
}) => {
    const isExecutive = Boolean(payload?.meta?.aiTier && payload.meta.aiTier.tierLevel >= 3);
    const [activeView, setActiveView] = useState<"report" | "chat">("report");

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    const reviewedCount = commentary
        ? commentary.commentaryItems.filter((item) => reviewedIds[item.id]).length
        : 0;
    const totalItems = commentary ? commentary.commentaryItems.length : 0;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                    />

                    {/* Drawer Panel */}
                    <motion.aside
                        role="dialog"
                        aria-modal="true"
                        aria-label="AI Demand Planning Commentary"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 280 }}
                        className="relative z-50 w-full max-w-2xl sm:max-w-2xl md:max-w-3xl h-full bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Drawer Header */}
                        <div className="px-5 py-3 border-b border-border/80 bg-muted/20 shrink-0 space-y-2.5">
                            {/* Row 1: Title & Main Actions (Clean single line, never wraps) */}
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4" />
                                    </div>
                                    <h2 className="text-sm font-bold text-foreground truncate">
                                        AI Demand Planning Commentary
                                    </h2>
                                    {payload?.meta?.aiTier && (
                                        <Badge
                                            variant="outline"
                                            className="text-[10px] px-1.5 py-0 border-violet-500/40 text-violet-700 dark:text-violet-300 shrink-0"
                                        >
                                            {payload.meta.aiTier.tierName}
                                        </Badge>
                                    )}
                                </div>

                                {/* Top-Right Fixed Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                    {activeView === "report" && commentary && (
                                        <Badge
                                            variant="secondary"
                                            className="text-[11px] font-semibold hidden sm:inline-flex"
                                        >
                                            Reviewed {reviewedCount}/{totalItems}
                                        </Badge>
                                    )}
                                    {activeView === "report" && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={isLoading}
                                            onClick={onGenerateCommentary}
                                            className="h-8 text-xs gap-1.5 rounded-xl cursor-pointer"
                                        >
                                            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                                            <span className="hidden sm:inline">Refresh</span>
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={onClose}
                                        className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Row 2: Scope subtitle on Left, Executive Tabs on Right */}
                            <div className="flex items-center justify-between gap-3 text-xs">
                                {payload ? (
                                    <p className="text-xs text-muted-foreground truncate">
                                        Scope: {payload.meta.periodLabel} · {payload.meta.branchLabel} · {payload.meta.productLabel}
                                    </p>
                                ) : (
                                    <div />
                                )}

                                {isExecutive && (
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
                                            <span>Commentary Report</span>
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
                                            <span>Ask AI Chatbot</span>
                                            <span className="h-1.5 w-1.5 rounded-full bg-violet-600 dark:bg-violet-400 shrink-0" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Drawer Body Content */}
                        {activeView === "chat" && isExecutive && payload ? (
                            <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
                                <DemandForecastingChatBox payload={payload} assumptions={assumptions} />
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                            {isLoading ? (
                                <Card className="rounded-2xl border-border/60 shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <Sparkles className="h-4 w-4 text-violet-500 animate-spin" />
                                            Synthesizing Evidence-Linked Demand Commentary...
                                        </CardTitle>
                                        <CardDescription className="text-xs">
                                            Analyzing Sales Order history, WAPE/bias patterns, usable inventory, and labor trade-offs
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <Skeleton className="h-20 w-full rounded-xl" />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <Skeleton className="h-28 w-full rounded-xl" />
                                            <Skeleton className="h-28 w-full rounded-xl" />
                                        </div>
                                        <Skeleton className="h-32 w-full rounded-xl" />
                                    </CardContent>
                                </Card>
                            ) : error ? (
                                <Card className="rounded-2xl border-rose-500/35 bg-rose-500/5 shadow-sm">
                                    <CardContent className="py-10 flex flex-col items-center text-center gap-3">
                                        <AlertTriangle className="h-8 w-8 text-rose-500" />
                                        <div>
                                            <p className="text-sm font-bold text-foreground">AI Commentary Unavailable</p>
                                            <p className="text-xs text-muted-foreground max-w-md mt-1">{error}</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={onGenerateCommentary}
                                            className="gap-1.5 text-xs rounded-xl"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5" />
                                            Retry Analysis
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : !commentary ? (
                                <Card className="rounded-2xl border-dashed border-border/80 bg-card/60 shadow-sm">
                                    <CardContent className="py-14 flex flex-col items-center text-center gap-3">
                                        <div className="h-11 w-11 rounded-2xl bg-violet-500/15 flex items-center justify-center">
                                            <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-foreground">
                                                Generate Reviewable AI Demand Commentary
                                            </p>
                                            <p className="text-xs text-muted-foreground max-w-md mt-1">
                                                Synthesizes demand forecast trajectories, out-of-sample backtest diagnostics, and Inventory/Production/Labor recommendations linked to audit evidence.
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={onGenerateCommentary}
                                            className="gap-2 text-xs rounded-xl bg-violet-600 hover:bg-violet-700 text-white mt-1"
                                        >
                                            <Sparkles className="h-3.5 w-3.5" />
                                            Generate Commentary
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="space-y-4">
                                    {/* Governance & Review Progress Header */}
                                    <Card className="rounded-2xl border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-card to-card shadow-sm">
                                        <CardHeader className="pb-2 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                                    <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                                                    Executive Summary
                                                </CardTitle>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] border-violet-500/40 text-violet-700 dark:text-violet-300"
                                                >
                                                    {commentary.meta.governance.modelUsed}
                                                </Badge>
                                                {commentary.meta.governance.isFallback && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                                    >
                                                        Deterministic Mode
                                                    </Badge>
                                                )}
                                            </div>
                                            <CardDescription className="text-xs flex items-center gap-1.5">
                                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                <span>{commentary.meta.governance.disclaimer}</span>
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-3 pt-1">
                                            <p className="text-xs sm:text-sm leading-relaxed text-foreground/95">
                                                {commentary.executiveSummary}
                                            </p>

                                            {commentary.keyHighlights.length > 0 && (
                                                <div className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-1.5">
                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                        Key Demand Highlights
                                                    </div>
                                                    <ul className="space-y-1">
                                                        {commentary.keyHighlights.map((hl, idx) => (
                                                            <li
                                                                key={idx}
                                                                className="text-xs text-foreground/90 flex items-start gap-2"
                                                            >
                                                                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />
                                                                <span>{hl}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                                <div className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-1">
                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                        Accuracy & Bias Diagnosis
                                                    </div>
                                                    <p className="text-xs leading-relaxed text-foreground/90">
                                                        {commentary.accuracyDiagnosis}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-border/60 bg-background/70 p-3 space-y-1">
                                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                        Scenario Risk Assessment
                                                    </div>
                                                    <p className="text-xs leading-relaxed text-foreground/90">
                                                        {commentary.scenarioRiskAssessment}
                                                    </p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Actionable Category Cards */}
                                    <div className="space-y-3">
                                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                                            Tactical & Strategic Recommendations ({commentary.commentaryItems.length})
                                        </div>

                                        {commentary.commentaryItems.map((item, idx) => {
                                            const isReviewed = Boolean(reviewedIds[item.id]);
                                            const validEvidence = payload
                                                ? item.evidenceIds.filter((id) => Boolean(payload.evidenceRegistry[id]))
                                                : [];

                                            return (
                                                <motion.div
                                                    key={item.id}
                                                    initial={{ opacity: 0, y: -6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                                                >
                                                    <Card
                                                        className={`rounded-2xl shadow-sm transition-colors ${
                                                            isReviewed
                                                                ? "border-emerald-500/40 bg-emerald-500/[0.03]"
                                                                : item.severity === "critical"
                                                                ? "border-rose-500/35"
                                                                : item.severity === "warning"
                                                                ? "border-amber-500/35"
                                                                : "border-border/60"
                                                        }`}
                                                    >
                                                        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
                                                            <div className="space-y-1 min-w-0">
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <Badge variant="outline" className="text-[10px] uppercase">
                                                                        {item.category}
                                                                    </Badge>
                                                                    <Badge
                                                                        variant="secondary"
                                                                        className={`text-[10px] uppercase ${
                                                                            item.severity === "critical"
                                                                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                                                                : item.severity === "warning"
                                                                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                                                                : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                                                        }`}
                                                                    >
                                                                        {item.severity}
                                                                    </Badge>
                                                                </div>
                                                                <CardTitle className="text-sm font-bold leading-snug">
                                                                    {item.title}
                                                                </CardTitle>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant={isReviewed ? "default" : "outline"}
                                                                size="sm"
                                                                onClick={() => onToggleReviewed(item.id)}
                                                                className={`h-7 px-2.5 text-[11px] gap-1 shrink-0 rounded-lg ${
                                                                    isReviewed
                                                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                        : ""
                                                                }`}
                                                            >
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                {isReviewed ? "Reviewed" : "Mark Reviewed"}
                                                            </Button>
                                                        </CardHeader>
                                                        <CardContent className="space-y-2.5 text-xs">
                                                            <p className="text-muted-foreground leading-relaxed">
                                                                {item.analysis}
                                                            </p>
                                                            <div className="rounded-xl bg-muted/40 border border-border/50 p-2.5 space-y-1">
                                                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                                    Recommended Action · Owner: {item.owner}
                                                                </div>
                                                                <p className="font-medium text-foreground leading-snug">
                                                                    {item.recommendedAction}
                                                                </p>
                                                            </div>

                                                            {validEvidence.length > 0 && payload && (
                                                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                                    <span className="text-[10px] font-semibold text-muted-foreground inline-flex items-center gap-1 mr-1">
                                                                        <FileSearch className="h-3 w-3" />
                                                                        Evidence:
                                                                    </span>
                                                                    {validEvidence.slice(0, 4).map((evId) => {
                                                                        const ev = payload.evidenceRegistry[evId];
                                                                        if (!ev) return null;
                                                                        return (
                                                                            <button
                                                                                key={evId}
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    onOpenEvidence(
                                                                                        `Evidence for: ${item.title}`,
                                                                                        `${validEvidence.length} linked operational record(s)`,
                                                                                        validEvidence
                                                                                    )
                                                                                }
                                                                                className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300 transition-colors cursor-pointer"
                                                                            >
                                                                                {ev.reference}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                    {validEvidence.length > 4 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                onOpenEvidence(
                                                                                    `Evidence for: ${item.title}`,
                                                                                    `${validEvidence.length} linked operational record(s)`,
                                                                                    validEvidence
                                                                                )
                                                                            }
                                                                            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                                                                        >
                                                                            +{validEvidence.length - 4} more
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </CardContent>
                                                    </Card>
                                                </motion.div>
                                            );
                                        })}
                                    </div>

                                    {/* Planning Priorities Footer */}
                                    {commentary.planningPriorities.length > 0 && (
                                        <Card className="rounded-2xl border-border/60 shadow-sm">
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                    Next-Cycle Demand Planner Priorities
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-1.5">
                                                {commentary.planningPriorities.map((p, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-start gap-2 text-xs text-foreground/90"
                                                    >
                                                        <span className="h-4 w-4 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                                            {idx + 1}
                                                        </span>
                                                        <span>{p}</span>
                                                    </div>
                                                ))}
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    </motion.aside>
                </div>
            )}
        </AnimatePresence>
    );
};
