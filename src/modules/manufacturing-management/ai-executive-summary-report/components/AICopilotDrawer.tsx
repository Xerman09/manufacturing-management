"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, X, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight, Lock, MessageSquare, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AIInsightsPayload, AiTierInfo, AIExecutiveReportPayload } from "../types";
import { ExecutiveChatBox } from "./ExecutiveChatBox";

interface Props {
    insights: AIInsightsPayload | null;
    reportPayload?: AIExecutiveReportPayload | null;
    aiTier: AiTierInfo;
    isLoading: boolean;
    error: string | null;
    onClose: () => void;
}

export const AICopilotDrawer: React.FC<Props> = ({
    insights,
    reportPayload,
    aiTier,
    isLoading,
    error,
    onClose
}) => {
    const [activeTab, setActiveTab] = useState<"report" | "chat">("report");

    // If AI tier is unassigned, render the Tier Gate explanation
    if (!aiTier.assigned || aiTier.tierLevel === 0) {
        return (
            <motion.div
                initial={{ height: 0, opacity: 0, marginTop: -8 }}
                animate={{ height: "auto", opacity: 1, marginTop: 4 }}
                exit={{ height: 0, opacity: 0, marginTop: -8 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
            >
                <div className="bg-card border border-border/80 shadow-md rounded-xl p-4 relative overflow-hidden">
                    <div className="flex items-center justify-between border-b pb-2">
                        <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                AI Copilot Unlicensed / Unassigned
                            </h3>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground rounded-full"
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>

                    <div className="py-4 space-y-2 text-xs">
                        <p className="text-foreground/90 font-medium">
                            This module currently operates in <strong>Standard Reporting Mode</strong>.
                        </p>
                        <p className="text-muted-foreground leading-relaxed">
                            No AI Tier (Basic, Pro, or Executive) has been assigned to <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">ai-executive-summary-report</code> in the system modules table.
                            Please ask your system administrator to configure the <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">ai_tier</code> column to unlock automated executive synthesis and predictive risk modeling.
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    const isExecutive = aiTier.tierLevel >= 3;

    return (
        <motion.div
            initial={{ height: 0, opacity: 0, marginTop: -8 }}
            animate={{ height: "auto", opacity: 1, marginTop: 4 }}
            exit={{ height: 0, opacity: 0, marginTop: -8 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
        >
            <div className="bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-background border border-purple-500/30 shadow-md shadow-purple-500/5 rounded-xl p-4 sm:p-5 space-y-3.5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

                {/* Header with Governance & Disclaimers */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-500/15 pb-2.5 z-10 relative">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-pulse" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                            AI Executive Insight
                        </h3>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="hidden md:inline-flex items-center gap-1 text-[9px] text-muted-foreground bg-background/80 px-2 py-0.5 rounded border border-border/60">
                            <ShieldAlert className="h-2.5 w-2.5 text-amber-500" />
                            EU AI Act Article 14 Human Oversight Required • Advisory Only
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-purple-500/10 rounded-full"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Executive Tier Top Navigation Tabs */}
                {isExecutive && (
                    <div className="flex items-center gap-2 border-b border-purple-500/15 pb-2">
                        <button
                            onClick={() => setActiveTab("report")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === "report"
                                    ? "bg-purple-600 text-white shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-purple-500/10"
                            }`}
                        >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Strategic Report</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("chat")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === "chat"
                                    ? "bg-purple-600 text-white shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-purple-500/10"
                            }`}
                        >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>Copilot Chat</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                Live Q&A
                            </span>
                        </button>
                    </div>
                )}

                {/* Chat Tab View (Executive Tier Only) */}
                {isExecutive && activeTab === "chat" && reportPayload && (
                    <div className="pt-1">
                        <ExecutiveChatBox reportPayload={reportPayload} />
                    </div>
                )}

                {/* Strategic Report View (All Tiers) */}
                {(activeTab === "report" || !isExecutive) && (
                    <>
                        {isLoading && (
                            <div className="py-8 flex flex-col items-center justify-center space-y-2 text-xs text-muted-foreground">
                                <Sparkles className="h-6 w-6 text-purple-500 animate-spin" />
                                <p>Synthesizing operational metrics through Centralized AI Core...</p>
                                <p className="text-[10px] text-muted-foreground/80">Executing GDPR Dual-Pass sanitization pipeline</p>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-600">
                                {error}
                            </div>
                        )}

                        {!isLoading && insights && (
                            <div className="space-y-4">
                                {/* Executive Summary */}
                                <div className="rounded-lg bg-background/60 border border-purple-500/20 p-3">
                                    <p className="text-xs sm:text-sm leading-relaxed text-foreground/90 font-medium">
                                        {typeof insights.summary === "string"
                                            ? insights.summary
                                            : ((insights.summary as unknown as { performanceOverview?: string })?.performanceOverview || JSON.stringify(insights.summary))}
                                    </p>
                                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                                        <span>Model: <strong className="font-mono">{insights.meta.governance.modelUsed}</strong></span>
                                        <span>•</span>
                                        <span>Advisory Status: <strong>Verified Safe</strong></span>
                                    </div>
                                </div>

                                {/* Tier 1 (Basic): Strictly 2-4 General Bullet Points */}
                                {aiTier.tierLevel === 1 && insights.keyHighlights && insights.keyHighlights.length > 0 && (
                                    <div className="rounded-lg border border-purple-500/20 bg-background/40 p-3 space-y-2">
                                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
                                            Operational Highlights
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {insights.keyHighlights.slice(0, 4).map((hl, idx) => (
                                                <li key={idx} className="flex items-start gap-2 text-xs text-foreground/90 leading-snug">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                                                    <span>{hl}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Tier 2 (Pro): Detailed Diagnostic Analysis */}
                                {aiTier.tierLevel === 2 && insights.detailedAnalysis && (
                                    <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1.5">
                                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                                            Precise Operational Diagnostics
                                        </h4>
                                        <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">
                                            {insights.detailedAnalysis}
                                        </p>
                                    </div>
                                )}

                                {/* Tier 3 (Executive): Strategic C-Suite Pillars */}
                                {isExecutive && insights.pillars && (
                                    <div className="grid gap-3 grid-cols-1 md:grid-cols-3 pt-1">
                                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Pillar 1</span>
                                                <Badge variant="outline" className={`text-[9px] font-bold ${insights.pillars.throughputAndCapacity.riskScore === "HIGH" ? "text-rose-600 border-rose-200" : "text-emerald-600 border-emerald-200"}`}>
                                                    {insights.pillars.throughputAndCapacity.riskScore} RISK
                                                </Badge>
                                            </div>
                                            <h4 className="text-xs font-semibold text-foreground">{insights.pillars.throughputAndCapacity.title}</h4>
                                            <p className="text-[11px] text-muted-foreground leading-snug">{insights.pillars.throughputAndCapacity.analysis}</p>
                                        </div>

                                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Pillar 2</span>
                                                <Badge variant="outline" className={`text-[9px] font-bold ${insights.pillars.qualityAndScrap.riskScore === "HIGH" ? "text-rose-600 border-rose-200" : "text-emerald-600 border-emerald-200"}`}>
                                                    {insights.pillars.qualityAndScrap.riskScore} RISK
                                                </Badge>
                                            </div>
                                            <h4 className="text-xs font-semibold text-foreground">{insights.pillars.qualityAndScrap.title}</h4>
                                            <p className="text-[11px] text-muted-foreground leading-snug">{insights.pillars.qualityAndScrap.analysis}</p>
                                        </div>

                                        <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Pillar 3</span>
                                                <Badge variant="outline" className={`text-[9px] font-bold ${insights.pillars.financialAndFulfillment.riskScore === "HIGH" ? "text-rose-600 border-rose-200" : "text-emerald-600 border-emerald-200"}`}>
                                                    {insights.pillars.financialAndFulfillment.riskScore} RISK
                                                </Badge>
                                            </div>
                                            <h4 className="text-xs font-semibold text-foreground">{insights.pillars.financialAndFulfillment.title}</h4>
                                            <p className="text-[11px] text-muted-foreground leading-snug">{insights.pillars.financialAndFulfillment.analysis}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Tier 3 (Executive): Priority Decisions */}
                                {isExecutive && insights.priorityDecisions && insights.priorityDecisions.length > 0 && (
                                    <div className="rounded-lg border border-purple-500/20 bg-purple-500/[0.04] p-3 space-y-1.5">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                            Executive Decisions Requiring Sign-Off
                                        </h4>
                                        <ul className="space-y-1">
                                            {insights.priorityDecisions.map((dec, idx) => (
                                                <li key={idx} className="flex items-start gap-2 text-xs text-foreground/90">
                                                    <span className="font-bold text-purple-600 dark:text-purple-400">#{idx + 1}</span>
                                                    <span>{dec}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Key Exposures & Strategic Actions (Tiers 2 & 3) */}
                                {aiTier.tierLevel >= 2 && (insights.keyExposures.length > 0 || insights.strategicActions.length > 0) && (
                                    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 pt-1">
                                        {/* Exposures */}
                                        <div className="space-y-2">
                                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                                                <AlertTriangle className="h-3 w-3" /> Key Operational Exposures
                                            </h4>
                                            <div className="space-y-2">
                                                {insights.keyExposures.map((exp) => (
                                                    <div key={exp.id} className="rounded-md border border-rose-500/20 bg-rose-500/[0.03] p-2.5 text-xs space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-mono font-bold uppercase px-1 rounded bg-rose-500/10 text-rose-600">
                                                                [{exp.type === "fact" ? "VERIFIED FACT" : "HYPOTHESIS"}]
                                                            </span>
                                                            <span className="text-[9px] text-muted-foreground uppercase">{exp.category}</span>
                                                        </div>
                                                        <p className="font-semibold text-foreground">{exp.finding}</p>
                                                        <p className="text-[11px] text-muted-foreground">{exp.supportingEvidence}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Strategic Actions */}
                                        <div className="space-y-2">
                                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                                                <CheckCircle2 className="h-3 w-3" /> Strategic Actions &amp; Ownership
                                            </h4>
                                            <div className="space-y-2">
                                                {insights.strategicActions.map((act) => (
                                                    <div key={act.id} className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.03] p-2.5 text-xs space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-1">
                                                                <ArrowRight className="h-2.5 w-2.5" /> Owner: {act.suggestedOwner || "Plant Lead"}
                                                            </span>
                                                            {act.targetModule && (
                                                                <span className="text-[9px] font-mono text-muted-foreground">
                                                                    {act.targetModule}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="font-semibold text-foreground">{act.recommendedAction}</p>
                                                        <p className="text-[11px] text-muted-foreground">{act.finding}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </motion.div>
    );
};

