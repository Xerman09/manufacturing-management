"use client";

import React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Cpu, ShieldAlert, Sparkles, Wrench, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PredictiveAiCommentaryPayload, PredictiveMaintenanceReportPayload } from "../types";

interface AiFindingsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    commentary: PredictiveAiCommentaryPayload | null;
    reportPayload: PredictiveMaintenanceReportPayload;
    isLoading: boolean;
}

export function AiFindingsDrawer({
    isOpen,
    onClose,
    commentary,
    reportPayload,
    isLoading
}: AiFindingsDrawerProps) {
    if (!isOpen) return null;

    const aiTier = commentary?.aiTier || reportPayload.aiTier;

    // Unassigned Tier Gate
    if (!aiTier.assigned || aiTier.tierLevel === 0) {
        return (
            <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-background shadow-2xl border-l">
                <div className="flex items-center justify-between border-b px-5 py-4 bg-muted/20">
                    <div className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                        <span className="font-bold text-sm">AI Maintenance Analyst Unassigned</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div className="p-6 space-y-3 text-xs">
                    <p className="font-semibold text-foreground">
                        This module currently operates in Standard Reporting Mode.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                        No AI Tier has been assigned to <code className="bg-muted px-1.5 py-0.5 rounded">predictive-maintenance-report</code> in the system modules table.
                        Ask your system administrator to assign an AI Tier to unlock automated equipment diagnostics and risk synthesis.
                    </p>
                </div>
            </div>
        );
    }

    const kpis = reportPayload.kpis;
    const topHighRisk = reportPayload.assetRiskRows.filter((a) => a.predictedBreakdownRiskPct >= 40);

    return (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-background shadow-2xl border-l">
            {/* Header: AI Maintenance Analyst [Tier 2: Pro] */}
            <div className="flex items-center justify-between border-b px-5 py-3.5 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-background">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <Sparkles className="h-4 w-4 animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">AI Maintenance Analyst</span>
                            <Badge className="bg-purple-600 hover:bg-purple-600 text-white text-[10px] py-0 px-2 font-semibold">
                                Tier: {aiTier.tierName || "Pro"}
                            </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Real-time reliability intelligence and proactive operational recommendations
                        </p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Diagnostic Content Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                {/* Section Title */}
                <div>
                    <h3 className="text-base font-bold text-foreground">
                        Equipment Reliability Review & Diagnostics
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        Detailed diagnostic synthesis across fleet run-hours, MTBF, breakdown history, and risk forecasting.
                    </p>
                </div>

                {/* 1. OPERATIONAL OVERVIEW */}
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.03] p-4 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 block">
                        OPERATIONAL OVERVIEW
                    </span>
                    <p className="text-xs text-foreground/90 leading-relaxed">
                        {commentary?.executiveSummary || (isLoading ? "Generating operational equipment overview..." : "For the evaluation period, fleet breakdown risk is tracked at " + kpis.fleetRiskScore + "% with " + kpis.totalOperatingRunHours.toLocaleString() + " cumulative operating hours across " + kpis.totalAssetsEvaluated + " assets.")}
                    </p>
                </div>

                {/* 2. DETAILED PRODUCTION & EQUIPMENT ANALYSIS */}
                <div className="rounded-xl border bg-card p-4 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                        DETAILED PRODUCTION & EQUIPMENT ANALYSIS
                    </span>
                    <p className="text-xs text-foreground/90 leading-relaxed">
                        Fleet operations currently display an aggregate Mean Time Between Failures (MTBF) of{" "}
                        <strong>{kpis.fleetMtbfHours !== null ? `${kpis.fleetMtbfHours} hours` : "an unmeasured baseline"}</strong>, with{" "}
                        <strong>{kpis.totalBreakdownEpisodes} breakdown episode(s)</strong> logged in this reporting window.
                        {kpis.highRiskAssetCount > 0 ? (
                            <>
                                {" "}A critical risk concentration is observed on{" "}
                                <strong>{topHighRisk.slice(0, 2).map((a) => `${a.assetName} (${a.predictedBreakdownRiskPct}%)`).join(" and ")}</strong>,
                                driven by accumulated runtime without scheduled overhaul clearance.
                            </>
                        ) : (
                            <> All evaluated assets operate within the nominal failure probability envelope.</>
                        )}{" "}
                        Telemetry sensors operate in <strong>{kpis.telemetryMode}</strong> mode with {kpis.dataCoveragePct}% data completeness.
                    </p>
                </div>

                {/* 3. Side-by-Side: OPERATIONAL RISK FACTORS & RECOMMENDED ACTION PLAN */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Operational Risk Factors Column */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-4 w-4" />
                            <span>Operational Risk Factors</span>
                        </div>

                        {commentary?.hypotheses && commentary.hypotheses.length > 0 ? (
                            commentary.hypotheses.map((hyp, i) => (
                                <div
                                    key={hyp.id || i}
                                    className="rounded-xl border border-rose-500/20 bg-rose-500/[0.03] p-3.5 space-y-1.5"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                            {hyp.assetName || "EQUIPMENT WEAR"}
                                        </span>
                                        <Badge variant="outline" className="text-[9px] font-bold text-rose-600 border-rose-200">
                                            {hyp.priority || "HIGH IMPACT"}
                                        </Badge>
                                    </div>
                                    <h5 className="text-xs font-semibold text-foreground">{hyp.title}</h5>
                                    <p className="text-[11px] text-muted-foreground leading-snug">{hyp.observation}</p>
                                </div>
                            ))
                        ) : (
                            topHighRisk.slice(0, 2).map((asset) => (
                                <div
                                    key={asset.assetId}
                                    className="rounded-xl border border-rose-500/20 bg-rose-500/[0.03] p-3.5 space-y-1.5"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">
                                            {asset.workCenterName}
                                        </span>
                                        <Badge variant="outline" className="text-[9px] font-bold text-rose-600 border-rose-200">
                                            {asset.riskLevel} IMPACT
                                        </Badge>
                                    </div>
                                    <h5 className="text-xs font-semibold text-foreground">
                                        High breakdown risk on {asset.assetName}
                                    </h5>
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                        Probability of {asset.predictedBreakdownRiskPct}% with {asset.cumulativeRunHours} run-hours and {asset.breakdownCount} past incidents.
                                    </p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Recommended Action Plan Column */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Recommended Action Plan</span>
                        </div>

                        {reportPayload.actions && reportPayload.actions.length > 0 ? (
                            reportPayload.actions.map((act) => (
                                <div
                                    key={act.id}
                                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3.5 space-y-1.5"
                                >
                                    <Badge variant="outline" className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-200 bg-emerald-500/10">
                                        {act.owner || "Plant Maintenance Supervisor"}
                                    </Badge>
                                    <h5 className="text-xs font-semibold text-foreground">{act.title}</h5>
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                        Issue preventive maintenance work order for {act.assetName} before next production shift. Due: {act.dueDate}.
                                    </p>
                                </div>
                            ))
                        ) : (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3.5 space-y-1.5">
                                <Badge variant="outline" className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-200 bg-emerald-500/10">
                                    Plant Maintenance Supervisor
                                </Badge>
                                <h5 className="text-xs font-semibold text-foreground">Maintain Standard Shift Inspection</h5>
                                <p className="text-[11px] text-muted-foreground leading-snug">
                                    All equipment units operate within nominal thresholds. Conduct routine weekly lubrication.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Governance Footnote (EU AI Act Article 14) */}
                <div className="pt-2 border-t text-[10px] text-muted-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3 text-amber-500" />
                        Human Oversight Required • Advisory Only • Non-Autonomous
                    </span>
                    <span>Model: <strong>Deterministic Reliability Engine</strong></span>
                </div>
            </div>
        </div>
    );
}
