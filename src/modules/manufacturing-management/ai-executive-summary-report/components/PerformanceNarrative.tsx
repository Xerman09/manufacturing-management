"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, TrendingUp, CheckCircle } from "lucide-react";
import type { AIObservation } from "../types";

interface Props {
    executiveSummary: string;
    operationalHighlights: string[];
    topRisks: AIObservation[];
    topOpportunities: AIObservation[];
    aiTierName: string;
    aiTierLevel: number;
}

export const PerformanceNarrative: React.FC<Props> = ({
    executiveSummary,
    operationalHighlights,
    topRisks,
    topOpportunities,
    aiTierName,
    aiTierLevel
}) => {
    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Executive Synthesis */}
            <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-semibold">AI Executive Performance Narrative</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs">
                        Tier {aiTierLevel}: {aiTierName}
                    </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-foreground/90 leading-relaxed">
                        {executiveSummary}
                    </p>
                    <div className="rounded-lg border bg-muted/40 p-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Highlights</h4>
                        <ul className="space-y-1.5 text-xs text-foreground/80">
                            {operationalHighlights.map((highlight, index) => (
                                <li key={index} className="flex items-start gap-2">
                                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                                    <span>{highlight}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Top Risks & Upsides */}
            <div className="space-y-4">
                {/* Risks */}
                <Card className="border-rose-100 dark:border-rose-950">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                            <AlertTriangle className="h-4 w-4" />
                            <CardTitle className="text-xs font-semibold">Priority Operational Risks</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        {topRisks.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No critical operational risks identified.</p>
                        ) : (
                            topRisks.map((risk) => (
                                <div key={risk.id} className="rounded-md border border-rose-200/60 bg-rose-50/40 p-2.5 dark:bg-rose-950/20">
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                        <Badge className="bg-rose-600/10 text-rose-700 text-[10px] uppercase font-semibold">
                                            {risk.type}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground uppercase">{risk.category}</span>
                                    </div>
                                    <p className="text-xs text-foreground/90 font-medium leading-snug">{risk.finding}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground leading-tight">{risk.supportingEvidence}</p>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                {/* Opportunities */}
                <Card className="border-emerald-100 dark:border-emerald-950">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                            <TrendingUp className="h-4 w-4" />
                            <CardTitle className="text-xs font-semibold">Identified Upside Opportunities</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        {topOpportunities.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No immediate capacity or yield opportunities detected.</p>
                        ) : (
                            topOpportunities.map((opp) => (
                                <div key={opp.id} className="rounded-md border border-emerald-200/60 bg-emerald-50/40 p-2.5 dark:bg-emerald-950/20">
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                        <Badge className="bg-emerald-600/10 text-emerald-700 text-[10px] uppercase font-semibold">
                                            {opp.type}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground uppercase">{opp.category}</span>
                                    </div>
                                    <p className="text-xs text-foreground/90 font-medium leading-snug">{opp.finding}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground leading-tight">{opp.supportingEvidence}</p>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
