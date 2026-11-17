"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
    Sparkles,
    X,
    MessageSquare,
    FileText,
    Download,
    RefreshCw,
    ShieldAlert,
    AlertTriangle,
    CheckCircle2,
    Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AIInsightsPayload, AiTierInfo, AIExecutiveReportPayload } from "../types";
import { ExecutiveChatBox } from "./ExecutiveChatBox";

interface Props {
    isOpen: boolean;
    insights: AIInsightsPayload | null;
    reportPayload: AIExecutiveReportPayload | null;
    aiTier: AiTierInfo;
    isLoading: boolean;
    error: string | null;
    onClose: () => void;
    onRegenerate: () => void;
    onDownloadPdf?: () => void;
}

export const AICopilotSideDrawer: React.FC<Props> = ({
    isOpen,
    insights,
    reportPayload,
    aiTier,
    isLoading,
    error,
    onClose,
    onRegenerate,
    onDownloadPdf
}) => {
    const [activeTab, setActiveTab] = useState<"report" | "chat">("report");

    if (!isOpen) return null;

    const isExecutive = aiTier.tierLevel >= 3;
    const isPro = aiTier.tierLevel === 2;
    const isBasic = aiTier.tierLevel === 1;

    // Unassigned Tier
    if (!aiTier.assigned || aiTier.tierLevel === 0) {
        return (
            <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
                <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 220 }}
                    className="w-full max-w-lg bg-background border-l shadow-2xl flex flex-col h-full"
                >
                    <div className="p-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                                AI Copilot Unassigned
                            </h3>
                        </div>
                        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0 rounded-full">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="p-6 space-y-3 text-xs leading-relaxed text-muted-foreground flex-1">
                        <p className="font-semibold text-foreground">
                            This module currently operates in Standard Reporting Mode.
                        </p>
                        <p>
                            No AI Tier has been assigned to <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">ai-executive-summary-report</code>.
                            Configure the <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">ai_tier</code> column in system modules to unlock automated executive synthesis and predictive modeling.
                        </p>
                    </div>
                </motion.div>
            </div>
        );
    }

    const execReport = insights?.executiveReport;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Slide-over Drawer Body */}
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 240 }}
                className="relative w-full max-w-2xl bg-background border-l shadow-2xl flex flex-col h-full z-10 overflow-hidden"
            >
                {/* 1. Header with Icon, Title, Subtitle, Tabs, and Close */}
                <div className="p-4 sm:p-5 border-b bg-muted/20 flex flex-col gap-3 shrink-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-purple-600/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20 shadow-sm">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                                        AI Executive Analyst
                                    </h2>
                                    <Badge variant="outline" className="text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
                                        Tier {aiTier.tierLevel}: {aiTier.tierName}
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Real-time intelligence and interactive operational recommendations
                                </p>
                            </div>
                        </div>

                        {/* Top Pill Tab Switcher (Executive Tier Only) */}
                        <div className="flex items-center gap-2">
                            {isExecutive && (
                                <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/60">
                                    <button
                                        onClick={() => setActiveTab("report")}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                                            activeTab === "report"
                                                ? "bg-background text-foreground shadow-xs font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <FileText className="h-3.5 w-3.5" />
                                        <span>Executive Report</span>
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("chat")}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                                            activeTab === "chat"
                                                ? "bg-background text-purple-600 dark:text-purple-400 shadow-xs font-bold"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        <span>Ask AI Chatbot</span>
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-600 dark:bg-purple-400 shrink-0" />
                                    </button>
                                </div>
                            )}

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClose}
                                className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 2. Body Content (Report View has padding and scroll; Chat View spans full height edge-to-edge) */}
                {activeTab === "chat" && isExecutive && reportPayload ? (
                    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
                        {error && (
                            <div className="m-4 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3.5 text-xs text-rose-600 flex items-start gap-2.5">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">AI Synthesis Unavailable</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{error}</p>
                                </div>
                            </div>
                        )}
                        {isLoading ? (
                            <div className="py-20 flex flex-col items-center justify-center space-y-3 text-xs text-muted-foreground text-center">
                                <Sparkles className="h-8 w-8 text-purple-600 animate-spin" />
                                <p className="font-semibold text-foreground text-sm">Connecting to AI Executive Analyst...</p>
                            </div>
                        ) : (
                            <ExecutiveChatBox reportPayload={reportPayload} />
                        )}
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {/* Error Banner */}
                        {error && (
                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3.5 text-xs text-rose-600 flex items-start gap-2.5">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">AI Synthesis Unavailable</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{error}</p>
                                </div>
                            </div>
                        )}

                        {/* Loading State */}
                        {isLoading && (
                            <div className="py-20 flex flex-col items-center justify-center space-y-3 text-xs text-muted-foreground text-center">
                                <Sparkles className="h-8 w-8 text-purple-600 animate-spin" />
                                <p className="font-semibold text-foreground text-sm">Synthesizing Executive Operational Report...</p>
                                <p className="text-[11px] text-muted-foreground max-w-xs">
                                    Evaluating verified Job Order output, plant OEE, downtime episodes, and BOM recipe variance.
                                </p>
                            </div>
                        )}

                        {/* VIEW B: Report Tab (Strictly Divided by Tier) */}
                        {!isLoading && insights && (
                            <div className="space-y-6 text-foreground">
                            {/* ============================================================== */}
                            {/* 1. TIER 3: EXECUTIVE STRATEGIC VIEW (Strictly Executive Only)  */}
                            {/* ============================================================== */}
                            {isExecutive && (
                                <>
                                    {/* Report Document Title Banner */}
                                    <div className="border-b pb-4 space-y-1.5">
                                        <h1 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                                            {execReport?.reportTitle || "Plant Operations & Manufacturing Executive Performance Report"}
                                        </h1>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Prepared By: <strong className="text-foreground">{execReport?.preparedBy || "Super Intelligent AI Operations Analyst"}</strong> • Focus: <span className="font-medium text-foreground">{execReport?.focus || "Production Yield, Line Bottlenecks, and Fulfillment Velocity"}</span>
                                        </p>
                                    </div>

                                    {/* Section 1: Executive Summary */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                            1. Executive Summary &amp; Overview
                                        </h3>
                                        <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-normal">
                                            {execReport?.executiveSummary || insights.summary}
                                        </p>

                                        {/* Key Metrics Overview Table */}
                                        <div className="rounded-xl border bg-card overflow-hidden shadow-xs mt-3">
                                            <div className="bg-muted/40 px-3.5 py-2 border-b">
                                                <h4 className="text-[11px] font-bold text-foreground">Key Metrics Overview</h4>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-muted/20 border-b text-[10px] uppercase font-bold text-muted-foreground">
                                                        <tr>
                                                            <th className="px-3.5 py-2">Operational Vector</th>
                                                            <th className="px-3 py-2">Actual Value</th>
                                                            <th className="px-3 py-2">Target / Benchmark</th>
                                                            <th className="px-3 py-2">Performance Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/60">
                                                        {(execReport?.metricsTable || [
                                                            { category: "Production Output", actual: `${reportPayload?.kpiCards.output.actual?.toLocaleString() ?? 0} units`, target: `${reportPayload?.kpiCards.output.target?.toLocaleString() ?? 0} units`, status: (reportPayload?.kpiCards.output.variancePercent ?? 0) >= 0 ? "Favorable" : "Under Target" },
                                                            { category: "Plant OEE (Weighted)", actual: `${reportPayload?.kpiCards.plantOee.actual ?? 0}%`, target: "85.0% Benchmark", status: Number(reportPayload?.kpiCards.plantOee.actual ?? 0) >= 85 ? "Optimal" : "Needs Review" },
                                                            { category: "Scrap & Defect Rate", actual: `${reportPayload?.kpiCards.scrapRate.actual ?? 0}%`, target: "≤ 2.0% Ceiling", status: Number(reportPayload?.kpiCards.scrapRate.actual ?? 0) <= 2.0 ? "Controlled" : "Elevated Risk" },
                                                            { category: "Unplanned Line Downtime", actual: `${reportPayload?.kpiCards.downtimeMinutes.actual ?? 0} mins`, target: "≤ 120 mins SLA", status: Number(reportPayload?.kpiCards.downtimeMinutes.actual ?? 0) <= 120 ? "Optimal" : "SLA Exceeded" },
                                                            { category: "Customer Fulfillment (OTIF)", actual: `${reportPayload?.kpiCards.otif.actual ?? 0}%`, target: "95.0% SLA", status: Number(reportPayload?.kpiCards.otif.actual ?? 0) >= 95 ? "Excellent" : "Dispatch Lag" },
                                                            { category: "Material Consumption Variance", actual: `${reportPayload?.kpiCards.costVariance.actual ?? 0}%`, target: "0.0% Recipe BOM", status: Number(reportPayload?.kpiCards.costVariance.actual ?? 0) <= 0 ? "Favorable" : "Cost Overage" }
                                                        ]).map((m, idx) => (
                                                            <tr key={`metric-row-${idx}-${m.category}`} className="hover:bg-muted/30">
                                                                <td className="px-3.5 py-2 font-medium text-foreground">{m.category}</td>
                                                                <td className="px-3 py-2 font-semibold">{m.actual}</td>
                                                                <td className="px-3 py-2 text-muted-foreground">{m.target}</td>
                                                                <td className="px-3 py-2">
                                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                                        m.status.includes("Favorable") || m.status.includes("Optimal") || m.status.includes("Excellent") || m.status.includes("Controlled")
                                                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                                                    }`}>
                                                                        {m.status}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 2: Bottleneck Analysis & Performance Findings */}
                                    <div className="space-y-3.5">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                            2. Bottleneck Analysis &amp; Performance Findings
                                        </h3>

                                        {/* A. High-Efficiency Phases */}
                                        <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3.5">
                                            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                A. High-Efficiency Operational Phases
                                            </h4>
                                            <ul className="space-y-1 text-xs text-foreground/80 list-disc list-inside">
                                                {(execReport?.bottleneckFindings.highEfficiency || [
                                                    `Quality acceptance logged ${reportPayload?.kpiCards.output.actual?.toLocaleString() ?? 0} QA-passed units in compliance with finished goods specification.`,
                                                    `Equipment line run-time was sustained with ${reportPayload?.kpiCards.downtimeMinutes.actual ?? 0} minutes of total downtime.`
                                                ]).map((item, idx) => (
                                                    <li key={`eff-${idx}-${String(item).slice(0, 15)}`} className="leading-relaxed">{item}</li>
                                                ))}
                                            </ul>
                                        </div>

                                        {/* B. Primary Operational Bottlenecks */}
                                        <div className="space-y-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3.5">
                                            <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                B. Primary Operational Bottlenecks
                                            </h4>
                                            <ul className="space-y-1 text-xs text-foreground/80 list-disc list-inside">
                                                {(execReport?.bottleneckFindings.primaryBottlenecks || [
                                                    `Throughput Volume Gap: Output variance settled at ${reportPayload?.kpiCards.output.variancePercent ?? 0}% against scheduled production orders.`,
                                                    `Quality Scrap Loss: Scrap rate is currently at ${reportPayload?.kpiCards.scrapRate.actual ?? 0}%, requiring containment.`
                                                ]).map((item, idx) => (
                                                    <li key={`btn-${idx}-${String(item).slice(0, 15)}`} className="leading-relaxed">{item}</li>
                                                ))}
                                            </ul>
                                        </div>

                                        {/* C. Critical Delays Assessment */}
                                        <div className="space-y-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3.5">
                                            <h4 className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                                                <ShieldAlert className="h-3.5 w-3.5" />
                                                C. Critical Risk &amp; Delay Assessment
                                            </h4>
                                            <ul className="space-y-1 text-xs text-foreground/80 list-disc list-inside">
                                                {(execReport?.bottleneckFindings.criticalDelays || [
                                                    `Customer dispatch fulfillment stands at ${reportPayload?.kpiCards.otif.actual ?? 0}% (vs 95% SLA commitment). Staging lag prevents immediate carrier release.`
                                                ]).map((item, idx) => (
                                                    <li key={`crit-${idx}-${String(item).slice(0, 15)}`} className="leading-relaxed">{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    {/* Section 3: Summary / Key Takeaways (Bullet Form Callout) */}
                                    <div className="rounded-xl border border-purple-500/30 bg-purple-500/[0.06] p-4 space-y-2">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                            3. Summary / Key Takeaways
                                        </h3>
                                        {Array.isArray(execReport?.keyTakeaways) ? (
                                            <ul className="space-y-1.5 text-xs text-foreground/90">
                                                {execReport.keyTakeaways.map((takeaway, idx) => (
                                                    <li key={`takeaway-${idx}-${takeaway.slice(0, 15)}`} className="flex items-start gap-2">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-600 dark:bg-purple-400 mt-1.5 shrink-0" />
                                                        <span className="leading-relaxed font-medium">{takeaway}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <ul className="space-y-1.5 text-xs text-foreground/90">
                                                {(execReport?.keyTakeaways || insights.summary || "")
                                                    .split("\n")
                                                    .filter((line) => line.trim().length > 0)
                                                    .map((line, idx) => (
                                                        <li key={`takeaway-line-${idx}-${line.slice(0, 15)}`} className="flex items-start gap-2">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-purple-600 dark:bg-purple-400 mt-1.5 shrink-0" />
                                                            <span className="leading-relaxed font-medium">{line.replace(/^[•\-\*]\s*/, "")}</span>
                                                        </li>
                                                    ))}
                                            </ul>
                                        )}
                                    </div>

                                    {/* Section 4: Recommended Action Plan */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                            4. Recommended Action Plan
                                        </h3>
                                        <div className="space-y-2.5">
                                            {(execReport?.strategicRecommendations || [
                                                {
                                                    title: "Forensic MES Telemetry & Downtime Sensor Audit",
                                                    description: `Instruct the IT/OT Systems Lead and Maintenance Supervisor to conduct an immediate diagnostic audit of line sensors and MES state-change reporting to determine why machine downtime logged 0 minutes during an output slump.`,
                                                    owner: "IT/OT Systems Lead & Maintenance Supervisor"
                                                },
                                                {
                                                    title: "Procurement Realignment & BOM Cost Containment",
                                                    description: `Meet with the Procurement Lead (Materials Management) to freeze unallocated supplier purchase orders, reconcile actual raw ingredient scrap with BOM recipes, and halt spot-buying to arrest the cost variance.`,
                                                    owner: "Procurement Lead (Materials Management)"
                                                },
                                                {
                                                    title: "Expedited Customer Dispatch & OTIF Recovery",
                                                    description: `Direct the Logistics & Warehouse Manager to immediately inspect all staged finished goods inventory, cross-reference pending purchase orders, and book priority carrier dispatch to recover OTIF toward the 95.0% SLA benchmark.`,
                                                    owner: "Logistics & Warehouse Manager"
                                                }
                                            ]).map((rec, idx) => (
                                                <div key={`rec-${idx}-${rec.title}`} className="rounded-lg border bg-card p-3.5 space-y-1.5 shadow-xs">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="h-5 w-5 rounded-full bg-purple-600/10 text-purple-600 dark:text-purple-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                                                                {idx + 1}
                                                            </span>
                                                            <h5 className="text-xs font-bold text-foreground">{rec.title}</h5>
                                                        </div>
                                                        {rec.owner && (
                                                            <Badge variant="outline" className="text-[10px] text-purple-700 dark:text-purple-300 bg-purple-500/5 border-purple-500/20 font-semibold shrink-0">
                                                                {rec.owner}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                                                        {rec.description}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ============================================================== */}
                            {/* 2. TIER 2: PRO DIAGNOSTIC VIEW (Operational Review Only)       */}
                            {/* ============================================================== */}
                            {isPro && (
                                <div className="space-y-5">
                                    <div className="border-b pb-3 space-y-1">
                                        <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                                            Operational Performance Review &amp; Diagnostics
                                        </h2>
                                        <p className="text-xs text-muted-foreground">
                                            Detailed diagnostic synthesis across volume pacing, equipment availability, quality yield, and BOM variances.
                                        </p>
                                    </div>

                                    {/* Operational Summary */}
                                    <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                            Operational Overview
                                        </h3>
                                        <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                                            {insights.summary}
                                        </p>
                                    </div>

                                    {/* Detailed Narrative Analysis */}
                                    {insights.detailedAnalysis && (
                                        <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                                Detailed Production &amp; Equipment Analysis
                                            </h3>
                                            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">
                                                {insights.detailedAnalysis}
                                            </p>
                                        </div>
                                    )}

                                    {/* Operational Risk Factors & Recommended Action Plan */}
                                    {(insights.keyExposures?.length > 0 || insights.strategicActions?.length > 0) && (
                                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 pt-1">
                                            {/* Operational Risk Factors */}
                                            <div className="space-y-2">
                                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
                                                    <AlertTriangle className="h-3 w-3" /> Operational Risk Factors
                                                </h4>
                                                <div className="space-y-2">
                                                    {insights.keyExposures.map((exp, expIdx) => (
                                                        <div key={`exp-${expIdx}-${exp.id || expIdx}`} className="rounded-lg border border-rose-500/20 bg-rose-500/[0.03] p-3 text-xs space-y-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[9px] text-muted-foreground uppercase font-bold">{exp.category}</span>
                                                                <Badge variant="outline" className={`text-[8px] uppercase font-bold ${exp.impactLevel === "high" ? "text-rose-600 border-rose-300" : "text-amber-600 border-amber-300"}`}>
                                                                    {exp.impactLevel} Impact
                                                                </Badge>
                                                            </div>
                                                            <p className="font-semibold text-foreground">{exp.finding}</p>
                                                            <p className="text-[11px] text-muted-foreground">{exp.supportingEvidence}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Recommended Action Plan */}
                                            <div className="space-y-2">
                                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                                                    <CheckCircle2 className="h-3 w-3" /> Recommended Action Plan
                                                </h4>
                                                <div className="space-y-2">
                                                    {insights.strategicActions.map((act, actIdx) => (
                                                        <div key={`act-${actIdx}-${act.id || actIdx}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3 text-xs space-y-1.5">
                                                            <div className="flex items-center justify-between gap-1.5">
                                                                <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                                    {act.department || act.suggestedOwner || "Production Operations"}
                                                                </span>
                                                            </div>
                                                            <p className="font-semibold text-foreground text-xs leading-snug">
                                                                {act.recommendedAction || act.finding}
                                                            </p>
                                                            {act.finding && act.recommendedAction && act.finding !== act.recommendedAction && (
                                                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                                    {act.finding}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ============================================================== */}
                            {/* 3. TIER 1: BASIC OPERATIONAL VIEW (Summary + 2-4 Bullets Only) */}
                            {/* ============================================================== */}
                            {isBasic && (
                                <div className="space-y-4">
                                    <div className="border-b pb-3 space-y-1">
                                        <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                                            Operational Summary
                                        </h2>
                                        <p className="text-xs text-muted-foreground">
                                            General overview of plant performance and key operational highlights.
                                        </p>
                                    </div>

                                    <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                            Summary
                                        </h3>
                                        <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                                            {insights.summary}
                                        </p>
                                    </div>

                                    {insights.keyHighlights && (
                                        <div className="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-600">
                                                Key Operational Highlights
                                            </h4>
                                            <ul className="space-y-2 text-xs text-foreground/90">
                                                {insights.keyHighlights.slice(0, 4).map((hl, i) => (
                                                    <li key={`basic-hl-${i}-${String(hl).slice(0, 10)}`} className="flex items-start gap-2">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                                                        <span className="leading-relaxed">{hl}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                )}

                {/* 3. Footer Action Bar (Matches Reference: Only rendered when viewing the Executive Report tab) */}
                {activeTab === "report" && (
                    <div className="p-3.5 sm:p-4 border-t bg-muted/30 flex items-center justify-between gap-2 shrink-0">
                        <div>
                            {isExecutive && (
                                <button
                                    onClick={() => setActiveTab("chat")}
                                    className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1.5 transition-colors"
                                >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    <span>Chat about this report &rarr;</span>
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {onDownloadPdf && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onDownloadPdf}
                                    className="h-8 text-xs flex items-center gap-1.5"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    <span>Download PDF</span>
                                </Button>
                            )}

                            <Button
                                variant="default"
                                size="sm"
                                onClick={onRegenerate}
                                disabled={isLoading}
                                className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                                <span>Regenerate</span>
                            </Button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};
