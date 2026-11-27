"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CategoryBreakdownDistribution, DegradationTrendPoint } from "../types";

interface ConditionSignalsTabProps {
    trends: DegradationTrendPoint[];
    categories: CategoryBreakdownDistribution[];
}

export function ConditionSignalsTab({ trends, categories }: ConditionSignalsTabProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Degradation Trend Lookback */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold">Operational Degradation & Risk Trend</CardTitle>
                        <CardDescription className="text-xs">
                            Comparison of operating run-hours, breakdown events, and aggregate risk index over recent lookback periods.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {trends.map((t) => (
                                <div key={t.periodLabel} className="space-y-1.5 border-b pb-3 last:border-b-0">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">{t.periodLabel}</span>
                                        <span className="text-muted-foreground font-mono">
                                            {t.runHours} run-hrs | {t.breakdownEvents} breakdown(s)
                                        </span>
                                        <Badge variant="outline" className="font-mono text-xs">
                                            Risk: {t.riskIndex}%
                                        </Badge>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden flex">
                                        <div
                                            className="bg-indigo-600 h-2"
                                            style={{ width: `${Math.min(100, (t.runHours / 500) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Breakdown Category Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold">Breakdown Categories & Downtime Impact</CardTitle>
                        <CardDescription className="text-xs">
                            Distribution of historical downtime hours categorized from maintenance episode logs.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {categories.length === 0 ? (
                            <div className="h-36 flex items-center justify-center text-xs text-muted-foreground">
                                No breakdown category records logged in this period.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {categories.map((c) => (
                                    <div key={c.category} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-medium truncate">{c.category}</span>
                                            <span className="font-mono text-muted-foreground">
                                                {c.totalDowntimeHours} hrs ({c.pctOfDowntime}%)
                                            </span>
                                        </div>
                                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                            <div
                                                className="bg-amber-500 h-2"
                                                style={{ width: `${Math.min(100, c.pctOfDowntime)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
