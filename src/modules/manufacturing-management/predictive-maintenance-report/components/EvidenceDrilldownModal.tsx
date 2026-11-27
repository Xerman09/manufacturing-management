"use client";

import React from "react";
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Calculator,
    Clock,
    Cpu,
    UserCheck,
    Wrench
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
    LocalizedDialog,
    LocalizedDialogContent,
    LocalizedDialogHeader,
    LocalizedDialogTitle,
    LocalizedDialogDescription
} from "./ui/LocalizedDialog";
import type { AssetRiskRow, BreakdownEpisodeDetail } from "../types";

interface EvidenceDrilldownModalProps {
    asset: AssetRiskRow | null;
    episodes: BreakdownEpisodeDetail[];
    isOpen: boolean;
    onClose: () => void;
}

export function EvidenceDrilldownModal({
    asset,
    episodes,
    isOpen,
    onClose
}: EvidenceDrilldownModalProps) {
    if (!asset) return null;

    const assetEpisodes = episodes.filter((e) => e.assetId === asset.assetId);

    const getRiskBadgeColor = (level: string) => {
        switch (level) {
            case "Critical":
                return "bg-red-500 text-white";
            case "High":
                return "bg-amber-500 text-white";
            case "Medium":
                return "bg-yellow-500 text-black";
            default:
                return "bg-emerald-500 text-white";
        }
    };

    return (
        <LocalizedDialog open={isOpen} onOpenChange={onClose}>
            <LocalizedDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
                {/* Header with Machine Profile */}
                <LocalizedDialogHeader className="border-b px-6 py-4 pr-14 bg-muted/20 text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                                <Cpu className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <LocalizedDialogTitle className="text-base font-bold text-foreground leading-tight truncate">
                                    {asset.assetName}
                                </LocalizedDialogTitle>
                                <LocalizedDialogDescription className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <span>Station: <strong className="text-foreground">{asset.workCenterName}</strong></span>
                                    {asset.serial && <span>• SN: <code className="font-mono">{asset.serial}</code></span>}
                                    <span>• Condition:</span>
                                    <Badge
                                        variant="outline"
                                        className={
                                            asset.condition === "Bad" || asset.condition === "Under Maintenance"
                                                ? "text-red-600 border-red-300 py-0"
                                                : "text-emerald-600 border-emerald-300 py-0"
                                        }
                                    >
                                        {asset.condition}
                                    </Badge>
                                </LocalizedDialogDescription>
                            </div>
                        </div>

                        <div className="flex items-center shrink-0 mr-2">
                            <Badge className={`${getRiskBadgeColor(asset.riskLevel)} text-xs px-2.5 py-1 font-bold shadow-xs`}>
                                {asset.predictedBreakdownRiskPct}% — {asset.riskLevel} Risk
                            </Badge>
                        </div>
                    </div>
                </LocalizedDialogHeader>

                <div className="p-6 space-y-6">
                    {/* 4-Stat Metric Chips */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Card className="shadow-none border bg-card">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
                                    <span>Run-Hours</span>
                                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                                </div>
                                <div className="text-lg font-bold tracking-tight text-foreground">
                                    {asset.cumulativeRunHours.toFixed(1)}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">hrs</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">From route loads</span>
                            </CardContent>
                        </Card>

                        <Card className="shadow-none border bg-card">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
                                    <span>Incidents</span>
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                </div>
                                <div className="text-lg font-bold tracking-tight text-foreground">
                                    {asset.breakdownCount}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">tickets</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Maintenance logs</span>
                            </CardContent>
                        </Card>

                        <Card className="shadow-none border bg-card">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
                                    <span>MTBF</span>
                                    <Activity className="h-3.5 w-3.5 text-indigo-500" />
                                </div>
                                <div className="text-lg font-bold tracking-tight text-foreground">
                                    {asset.mtbfHours !== null ? asset.mtbfHours.toFixed(1) : "—"}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">hrs</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Mean Time Between</span>
                            </CardContent>
                        </Card>

                        <Card className="shadow-none border bg-card">
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
                                    <span>MTTR</span>
                                    <Wrench className="h-3.5 w-3.5 text-emerald-500" />
                                </div>
                                <div className="text-lg font-bold tracking-tight text-foreground">
                                    {asset.mttrHours !== null ? `${asset.mttrHours.toFixed(1)}h` : "—"}
                                </div>
                                <span className="text-[10px] text-muted-foreground">Mean Time to Repair</span>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Visual Reliability Calculation Breakdown */}
                    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calculator className="h-4 w-4 text-primary" />
                                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                                    Reliability Model & Weighting Factors
                                </span>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground">Exponential Wear Distribution</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                            <div className="p-2.5 rounded-lg border bg-background space-y-0.5">
                                <span className="text-[10px] text-muted-foreground block">Failure Rate Parameter</span>
                                <span className="font-mono font-bold text-foreground">
                                    {asset.mtbfHours ? `λ = (Load / ${asset.mtbfHours.toFixed(1)}h)` : "λ = Low Base Rate"}
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg border bg-background space-y-0.5">
                                <span className="text-[10px] text-muted-foreground block">Criticality Tier</span>
                                <Badge variant="outline" className="text-xs font-semibold py-0">
                                    {asset.criticality}
                                </Badge>
                            </div>

                            <div className="p-2.5 rounded-lg border bg-background space-y-0.5">
                                <span className="text-[10px] text-muted-foreground block">Condition Factor</span>
                                <span className="font-bold text-xs">
                                    {asset.condition === "Bad" ? "+30% High Wear Penalty" : asset.condition === "Under Maintenance" ? "+20% In-Service Check" : "Nominal"}
                                </span>
                            </div>
                        </div>

                        {asset.dataGapWarning && (
                            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>{asset.dataGapWarning}</span>
                            </div>
                        )}
                    </div>

                    {/* Recommended Planner Action Banner */}
                    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                            <Wrench className="h-4 w-4" />
                        </div>
                        <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">Recommended Preventive Action</span>
                                <Badge variant="outline" className="text-[10px] text-primary border-primary">
                                    Primary Basis: {asset.primaryFailureMode}
                                </Badge>
                            </div>
                            <p className="text-muted-foreground leading-relaxed">
                                {asset.suggestedAction}
                            </p>
                        </div>
                    </div>

                    {/* Historical Breakdown Episode Timeline */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Maintenance History Timeline ({assetEpisodes.length})
                            </h4>
                            <span className="text-[10px] text-muted-foreground">Directus History Records</span>
                        </div>

                        {assetEpisodes.length === 0 ? (
                            <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                                No historical breakdown records logged for this equipment unit.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {assetEpisodes.map((ep) => (
                                    <div
                                        key={ep.id}
                                        className="rounded-xl border bg-card p-3.5 space-y-2 hover:border-primary/40 transition-colors"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-slate-700 text-white text-[10px] font-semibold">
                                                    {ep.breakdownCategory}
                                                </Badge>
                                                <span className="font-semibold text-xs text-foreground">
                                                    {ep.startReason || "Unplanned Maintenance Stop"}
                                                </span>
                                            </div>
                                            <Badge variant="outline" className="font-mono text-[10px]">
                                                {ep.downtimeDurationHours}h downtime
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                            <div className="bg-muted/40 p-2 rounded-lg space-y-0.5">
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Root Cause</span>
                                                <p className="text-foreground">{ep.rootCause || "General mechanical fatigue"}</p>
                                            </div>
                                            <div className="bg-muted/40 p-2 rounded-lg space-y-0.5">
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Corrective Action</span>
                                                <p className="text-foreground">{ep.correctiveAction || "Part serviced / restored"}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                                            <span className="flex items-center gap-1">
                                                <UserCheck className="h-3 w-3 text-primary" />
                                                Technician: <strong className="text-foreground">{ep.technicianName}</strong>
                                            </span>
                                            <span>Restored: <strong className="text-foreground">{ep.restoredCondition}</strong></span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </LocalizedDialogContent>
        </LocalizedDialog>
    );
}
