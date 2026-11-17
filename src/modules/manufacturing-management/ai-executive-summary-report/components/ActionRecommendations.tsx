"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, ArrowUpRight } from "lucide-react";
import type { AIObservation } from "../types";

interface Props {
    actionPlan: AIObservation[];
}

export const ActionRecommendations: React.FC<Props> = ({ actionPlan }) => {
    if (actionPlan.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold">AI Operational Recommendations & Ownership</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {actionPlan.map((action) => (
                        <div key={action.id} className="rounded-lg border bg-muted/20 p-3 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between gap-1 mb-1.5">
                                    <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                                        {action.category}
                                    </Badge>
                                    <span className="text-[11px] font-semibold text-primary flex items-center gap-0.5">
                                        {action.suggestedOwner || "Plant Lead"}
                                    </span>
                                </div>
                                <p className="text-xs font-semibold text-foreground mb-1">{action.recommendedAction}</p>
                                <p className="text-[11px] text-muted-foreground">{action.finding}</p>
                            </div>
                            {action.targetModule && (
                                <div className="mt-3 pt-2 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span>Target Module: <strong className="font-mono">{action.targetModule}</strong></span>
                                    <span className="text-primary hover:underline flex items-center gap-0.5 cursor-pointer">
                                        View Module <ArrowUpRight className="h-2.5 w-2.5" />
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};
