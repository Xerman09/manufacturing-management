"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, Cpu } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FleetRiskKpis } from "../types";

interface KpiSummaryStripProps {
    kpis: FleetRiskKpis;
}

export function KpiSummaryStrip({ kpis }: KpiSummaryStripProps) {
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Fleet Risk Score */}
            <Card className="shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Fleet Risk Score
                        </span>
                        <Badge className={getRiskBadgeColor(kpis.fleetRiskLevel)}>{kpis.fleetRiskLevel}</Badge>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tracking-tight">{kpis.fleetRiskScore}%</span>
                        <span className="text-xs text-muted-foreground">probability</span>
                    </div>
                    <div className="mt-1 flex items-center text-xs text-muted-foreground">
                        <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                        Across {kpis.totalAssetsEvaluated} evaluated assets
                    </div>
                </CardContent>
            </Card>

            {/* At-Risk Assets */}
            <Card className="shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            High Breakdown Risk
                        </span>
                        <AlertTriangle className={`h-4 w-4 ${kpis.highRiskAssetCount > 0 ? "text-amber-500" : "text-emerald-500"}`} />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tracking-tight">{kpis.highRiskAssetCount}</span>
                        <span className="text-xs text-muted-foreground">assets (&ge; 70%)</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {kpis.highRiskAssetCount > 0 ? "Requires scheduled inspection" : "All operating in safe envelope"}
                    </div>
                </CardContent>
            </Card>

            {/* Fleet MTBF */}
            <Card className="shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Fleet MTBF
                        </span>
                        <Clock className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tracking-tight">
                            {kpis.fleetMtbfHours !== null ? `${kpis.fleetMtbfHours}` : "N/A"}
                        </span>
                        <span className="text-xs text-muted-foreground">operating hrs</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {kpis.fleetMtbfHours !== null ? `MTTR: ${kpis.fleetMttrHours ?? 0} hrs` : "0 breakdowns recorded"}
                    </div>
                </CardContent>
            </Card>

            {/* Total Run Hours */}
            <Card className="shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Recorded Run-Hours
                        </span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tracking-tight">
                            {kpis.totalOperatingRunHours.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground">hrs</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        From route production load
                    </div>
                </CardContent>
            </Card>

            {/* Telemetry Status */}
            <Card className="shadow-sm">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Condition Telemetry
                        </span>
                        <Cpu className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-sm font-semibold truncate">{kpis.telemetryMode}</span>
                    </div>
                    <div className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-medium truncate">
                        Coverage: {kpis.dataCoveragePct}%
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
