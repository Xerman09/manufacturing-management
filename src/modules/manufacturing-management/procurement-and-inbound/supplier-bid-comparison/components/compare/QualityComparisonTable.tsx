"use client";

import React from "react";
import { Check, X, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { cn } from "@/lib/utils";

interface QualityComparisonTableProps {
    supplierFilter: "ALL" | "LOCAL" | "INTERNATIONAL";
}

export const QualityComparisonTable: React.FC<QualityComparisonTableProps> = ({ supplierFilter }) => {
    const { currentProject } = useBidComparisonStore();

    const passFailCriteria = React.useMemo(() => {
        if (!currentProject) return [];
        return (currentProject.qualityCriteria || []).filter((c) => c.criterionType === "PASS_FAIL");
    }, [currentProject]);

    const scoredCriteria = React.useMemo(() => {
        if (!currentProject) return [];
        return (currentProject.qualityCriteria || []).filter((c) => c.criterionType === "SCORED");
    }, [currentProject]);

    const summary = React.useMemo(
        () => (currentProject ? evaluateAndCompareSuppliers(currentProject) : null),
        [currentProject]
    );

    const bids = React.useMemo(() => {
        if (!currentProject) return [];
        return currentProject.bids.filter((b) => {
            if (supplierFilter === "LOCAL") return b.supplierType === "LOCAL";
            if (supplierFilter === "INTERNATIONAL") return b.supplierType === "INTERNATIONAL";
            return true;
        });
    }, [currentProject, supplierFilter]);

    if (!currentProject || !summary) return null;

    const getScoreBadgeColor = (score: number) => {
        if (score === 5) return "bg-emerald-500 text-white";
        if (score === 4) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300";
        if (score === 3) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300";
        if (score === 2) return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-300";
        return "bg-rose-500 text-white";
    };

    return (
        <TooltipProvider>
            <Card className="shadow-xs border-border/80">
                <CardHeader className="py-3 px-4 border-b bg-muted/20">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Award className="h-4 w-4 text-amber-500" />
                        3.2 Quality &amp; Compliance Comparison Matrix
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Audit of mandatory pass/fail requirements and scored criteria (1–5). Dots indicate audit evidence attached.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                            <tr>
                                <th className="py-2.5 px-3 min-w-[200px]">Evaluation Parameter</th>
                                <th className="py-2.5 px-3 w-20 text-center">Weight</th>
                                {bids.map((bid) => (
                                    <th key={bid.id} className="py-2.5 px-3 min-w-[130px] text-center font-bold text-foreground">
                                        <span className="truncate block">{bid.supplierName}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {/* Pass / Fail Section */}
                            {passFailCriteria.length > 0 && (
                                <>
                                    <tr className="bg-muted/30">
                                        <td colSpan={2 + bids.length} className="py-1.5 px-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">
                                            Mandatory Compliance Requirements
                                        </td>
                                    </tr>
                                    {passFailCriteria.map((c) => (
                                        <tr key={c.id} className="hover:bg-muted/15">
                                            <td className="py-2 px-3 font-medium">
                                                {c.criterionName}
                                            </td>
                                            <td className="py-2 px-3 text-center text-muted-foreground font-mono">
                                                Pass/Fail
                                            </td>
                                            {bids.map((bid) => {
                                                const s = bid.scores[c.id];
                                                const result = s?.passFailResult || "NOT_CHECKED";
                                                const hasEvidence = Boolean(s?.evidenceRemarks?.trim());

                                                const content = (
                                                    <div className="flex items-center justify-center gap-1 cursor-default">
                                                        {result === "PASS" ? (
                                                            <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                                                                <Check className="h-3.5 w-3.5" /> Pass
                                                            </span>
                                                        ) : result === "FAIL" ? (
                                                            <span className="inline-flex items-center gap-1 text-rose-600 font-bold bg-rose-50 dark:bg-rose-950 px-1.5 py-0.5 rounded">
                                                                <X className="h-3.5 w-3.5" /> Fail
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground italic">
                                                                Unchecked
                                                            </span>
                                                        )}
                                                        {hasEvidence && (
                                                            <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Evidence attached" />
                                                        )}
                                                    </div>
                                                );

                                                return (
                                                    <td key={bid.id} className={cn("py-2 px-3 text-center", result === "FAIL" && "bg-rose-50/50 dark:bg-rose-950/20")}>
                                                        {hasEvidence ? (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>{content}</TooltipTrigger>
                                                                <TooltipContent className="text-xs max-w-xs">
                                                                    <strong>Evidence:</strong> {s.evidenceRemarks}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        ) : (
                                                            content
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </>
                            )}

                            {/* Scored Criteria Section */}
                            <tr className="bg-muted/30">
                                <td colSpan={2 + bids.length} className="py-1.5 px-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">
                                    Technical Quality Criteria (Score 1 to 5)
                                </td>
                            </tr>
                            {scoredCriteria.map((c) => (
                                <tr key={c.id} className="hover:bg-muted/15">
                                    <td className="py-2 px-3 font-medium">
                                        {c.criterionName}
                                    </td>
                                    <td className="py-2 px-3 text-center text-muted-foreground font-mono">
                                        {c.weightPct}%
                                    </td>
                                    {bids.map((bid) => {
                                        const s = bid.scores[c.id];
                                        const score = s?.score;
                                        const hasEvidence = Boolean(s?.evidenceRemarks?.trim());

                                        const badge = (
                                            <div className="flex items-center justify-center gap-1 cursor-default">
                                                {score !== null && score !== undefined ? (
                                                    <span className={cn(
                                                        "h-6 w-6 rounded-md inline-flex items-center justify-center font-bold font-mono text-xs border",
                                                        getScoreBadgeColor(score)
                                                    )}>
                                                        {score}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                                {hasEvidence && (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                                )}
                                            </div>
                                        );

                                        return (
                                            <td key={bid.id} className="py-2 px-3 text-center">
                                                {hasEvidence ? (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>{badge}</TooltipTrigger>
                                                        <TooltipContent className="text-xs max-w-xs">
                                                            <strong>Evidence:</strong> {s.evidenceRemarks}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ) : (
                                                    badge
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}

                            {/* Quality Score Total Row */}
                            <tr className="bg-muted/40 font-bold border-t-2 border-border text-xs">
                                <td colSpan={2} className="py-2.5 px-3 uppercase tracking-wider text-foreground">
                                    Overall Quality Score (0–100)
                                </td>
                                {bids.map((bid) => {
                                    const res = summary.results[bid.id];
                                    return (
                                        <td key={bid.id} className="py-2.5 px-3 text-center font-mono font-bold text-xs">
                                            {res?.isDisqualified ? (
                                                <span className="text-rose-600">DQ</span>
                                            ) : res ? (
                                                <span className="text-primary">{res.qualityScore}</span>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </TooltipProvider>
    );
};
