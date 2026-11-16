"use client";

import React from "react";
import { Star} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { SupplierBid, PassFailResult } from "../../types";
import { calculateSupplierLandedCost } from "../../engine/landed-cost-calculator";
import { cn } from "@/lib/utils";

interface QualityEvaluationFormProps {
    bid: SupplierBid;
}

export const QualityEvaluationForm: React.FC<QualityEvaluationFormProps> = ({ bid }) => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const items = currentProject.items || [];
    const criteria = currentProject.qualityCriteria || [];
    const scoredCriteria = criteria.filter((c) => c.criterionType === "SCORED");
    const passFailCriteria = criteria.filter((c) => c.criterionType === "PASS_FAIL");

    const landedResult = calculateSupplierLandedCost(currentProject, items, bid);

    const handleUpdatePassFail = (criterionId: string, result: PassFailResult) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => {
                if (b.id !== bid.id) return b;
                const existing = b.scores[criterionId] || { passFailResult: "NOT_CHECKED", score: null, evidenceRemarks: "" };
                return {
                    ...b,
                    scores: {
                        ...b.scores,
                        [criterionId]: { ...existing, passFailResult: result },
                    },
                };
            }),
        }));
    };

    const handleUpdateScore = (criterionId: string, score: number | null) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => {
                if (b.id !== bid.id) return b;
                const existing = b.scores[criterionId] || { passFailResult: "NOT_CHECKED", score: null, evidenceRemarks: "" };
                return {
                    ...b,
                    scores: {
                        ...b.scores,
                        [criterionId]: { ...existing, score },
                    },
                };
            }),
        }));
    };

    const handleUpdateRemarks = (criterionId: string, remarks: string) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => {
                if (b.id !== bid.id) return b;
                const existing = b.scores[criterionId] || { passFailResult: "NOT_CHECKED", score: null, evidenceRemarks: "" };
                return {
                    ...b,
                    scores: {
                        ...b.scores,
                        [criterionId]: { ...existing, evidenceRemarks: remarks },
                    },
                };
            }),
        }));
    };

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        2.5 Technical Quality Evaluation
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Evaluate mandatory compliance and score quality criteria (1–5).
                    </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 border-amber-300">
                        Score: <strong>{landedResult.qualityScore}</strong> / 100
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-5">
                {/* Mandatory Pass/Fail Table */}
                {passFailCriteria.length > 0 && (
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                            Mandatory Pass / Fail Checks
                        </span>
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                                    <tr>
                                        <th className="py-2 px-3">Requirement</th>
                                        <th className="py-2 px-3 w-44">Verification Status</th>
                                        <th className="py-2 px-3">Evidence / Verification Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {passFailCriteria.map((c) => {
                                        const scoreObj = bid.scores[c.id] || { passFailResult: "NOT_CHECKED", evidenceRemarks: "" };
                                        const status = scoreObj.passFailResult;

                                        return (
                                            <tr key={c.id} className={cn("transition-colors", status === "FAIL" && "bg-rose-50/50 dark:bg-rose-950/20")}>
                                                <td className="py-2 px-3 font-medium">
                                                    {c.criterionName}
                                                </td>
                                                <td className="py-2 px-3">
                                                    <Select
                                                        value={status}
                                                        onValueChange={(val: PassFailResult) => handleUpdatePassFail(c.id, val)}
                                                    >
                                                        <SelectTrigger className={cn(
                                                            "h-7 text-xs font-semibold",
                                                            status === "PASS" && "text-emerald-700 dark:text-emerald-400 border-emerald-300",
                                                            status === "FAIL" && "text-rose-700 dark:text-rose-400 border-rose-300 bg-rose-50 dark:bg-rose-950/40",
                                                            status === "NOT_CHECKED" && "text-muted-foreground"
                                                        )}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="PASS" className="text-xs text-emerald-600 font-medium">
                                                                Pass
                                                            </SelectItem>
                                                            <SelectItem value="FAIL" className="text-xs text-rose-600 font-medium">
                                                                Fail (Disqualify)
                                                            </SelectItem>
                                                            <SelectItem value="NOT_CHECKED" className="text-xs text-muted-foreground">
                                                                Not checked
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <Input
                                                        value={scoreObj.evidenceRemarks || ""}
                                                        onChange={(e) => handleUpdateRemarks(c.id, e.target.value)}
                                                        placeholder="e.g. BIR Form 2303 verified, SEC reg active"
                                                        className="h-7 text-xs"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Scored Criteria Table */}
                <div className="space-y-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                        Scored Criteria (Rating: 1 = Poor, 3 = Acceptable, 5 = Excellent)
                    </span>
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-muted/40 border-b font-semibold text-muted-foreground">
                                <tr>
                                    <th className="py-2 px-3">Criterion</th>
                                    <th className="py-2 px-3 w-16 text-center">Weight</th>
                                    <th className="py-2 px-3 w-48 text-center">Score (1–5)</th>
                                    <th className="py-2 px-3">Audit Evidence / Remarks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {scoredCriteria.map((c) => {
                                    const scoreObj = bid.scores[c.id] || { score: null, evidenceRemarks: "" };
                                    const currentScore = scoreObj.score;

                                    return (
                                        <tr key={c.id} className="hover:bg-muted/15 transition-colors">
                                            <td className="py-2 px-3 font-medium">
                                                {c.criterionName}
                                            </td>
                                            <td className="py-2 px-3 text-center text-muted-foreground font-mono">
                                                {c.weightPct}%
                                            </td>
                                            <td className="py-2 px-3">
                                                <div className="flex items-center justify-center gap-1">
                                                    {[1, 2, 3, 4, 5].map((starVal) => {
                                                        const isSelected = currentScore === starVal;
                                                        const isFilled = currentScore !== null && currentScore >= starVal;
                                                        return (
                                                            <Button
                                                                key={starVal}
                                                                type="button"
                                                                variant={isSelected ? "default" : "outline"}
                                                                size="sm"
                                                                onClick={() => handleUpdateScore(c.id, isSelected ? null : starVal)}
                                                                className={cn(
                                                                    "h-7 w-7 p-0 text-xs font-bold transition-all",
                                                                    isSelected
                                                                        ? "bg-amber-500 text-white hover:bg-amber-600 border-amber-600"
                                                                        : isFilled
                                                                            ? "text-amber-600 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"
                                                                            : "text-muted-foreground"
                                                                )}
                                                            >
                                                                {starVal}
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="py-2 px-3">
                                                <Input
                                                    value={scoreObj.evidenceRemarks || ""}
                                                    onChange={(e) => handleUpdateRemarks(c.id, e.target.value)}
                                                    placeholder="e.g. ISO 9001 certified, Lab test report #4912"
                                                    className="h-7 text-xs"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
