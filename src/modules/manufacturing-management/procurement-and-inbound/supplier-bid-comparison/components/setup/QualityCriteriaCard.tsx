"use client";

import React from "react";
import { Plus, Trash2, Award, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { QualityCriterion } from "../../types";

export const QualityCriteriaCard: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const criteria = currentProject.qualityCriteria || [];
    const scoredCriteria = criteria.filter((c) => c.criterionType === "SCORED");
    const passFailCriteria = criteria.filter((c) => c.criterionType === "PASS_FAIL");

    const totalWeight = scoredCriteria.reduce((sum, c) => sum + (c.weightPct || 0), 0);

    const handleAddScoredCriterion = () => {
        const newCrit: QualityCriterion = {
            id: "crit-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            criterionType: "SCORED",
            criterionName: "",
            weightPct: 15,
            sortOrder: criteria.length + 1,
        };
        updateProject((prev) => ({
            ...prev,
            qualityCriteria: [...prev.qualityCriteria, newCrit],
        }));
    };

    const handleAddPassFailCriterion = () => {
        const newCrit: QualityCriterion = {
            id: "pf-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            criterionType: "PASS_FAIL",
            criterionName: "",
            weightPct: 0,
            sortOrder: criteria.length + 1,
        };
        updateProject((prev) => ({
            ...prev,
            qualityCriteria: [...prev.qualityCriteria, newCrit],
        }));
    };

    const handleRemoveCriterion = (id: string) => {
        updateProject((prev) => ({
            ...prev,
            qualityCriteria: prev.qualityCriteria.filter((c) => c.id !== id),
            // Clean up scores from all bids
            bids: prev.bids.map((b) => {
                const newScores = { ...b.scores };
                delete newScores[id];
                return { ...b, scores: newScores };
            }),
        }));
    };

    const handleUpdateCriterion = (id: string, patch: Partial<QualityCriterion>) => {
        updateProject((prev) => ({
            ...prev,
            qualityCriteria: prev.qualityCriteria.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Scored Criteria */}
            <Card className="shadow-xs border-border/80">
                <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                            <Award className="h-4 w-4 text-amber-500" />
                            1.4 Scored Quality Criteria
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Graded 1 to 5 per supplier. Weights are normalized (Sum: {totalWeight}%).
                        </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleAddScoredCriterion} className="h-7 text-xs gap-1">
                        <Plus className="h-3 w-3" />
                        Add Criterion
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 border-b text-muted-foreground font-semibold">
                            <tr>
                                <th className="py-2 px-3">Criterion Name</th>
                                <th className="py-2 px-3 w-24 text-right">Weight (%)</th>
                                <th className="py-2 px-3 w-20 text-right">Normalized</th>
                                <th className="py-2 px-2 w-8"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {scoredCriteria.map((c) => {
                                const normPct = totalWeight > 0 ? ((c.weightPct / totalWeight) * 100).toFixed(1) : "0.0";
                                return (
                                    <tr key={c.id} className="hover:bg-muted/20">
                                        <td className="py-1.5 px-3">
                                            <Input
                                                value={c.criterionName}
                                                onChange={(e) => handleUpdateCriterion(c.id, { criterionName: e.target.value })}
                                                placeholder="e.g. Meets technical specifications"
                                                className="h-7 text-xs"
                                            />
                                        </td>
                                        <td className="py-1.5 px-3">
                                            <NumericInputField
                                                value={c.weightPct}
                                                onChange={(val) => handleUpdateCriterion(c.id, { weightPct: val })}
                                                min={1}
                                                max={100}
                                                suffix="%"
                                                className="h-7 text-xs font-mono text-right"
                                            />
                                        </td>
                                        <td className="py-1.5 px-3 text-right text-muted-foreground font-mono">
                                            {normPct}%
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveCriterion(c.id)}
                                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Pass / Fail Requirements */}
            <Card className="shadow-xs border-border/80">
                <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                            <ShieldAlert className="h-4 w-4 text-rose-500" />
                            1.5 Pass/Fail Mandatory Requirements
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Non-negotiable criteria. Failing any one disqualifies the supplier.
                        </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleAddPassFailCriterion} className="h-7 text-xs gap-1">
                        <Plus className="h-3 w-3" />
                        Add Requirement
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 border-b text-muted-foreground font-semibold">
                            <tr>
                                <th className="py-2 px-3">Requirement Description</th>
                                <th className="py-2 px-2 w-8"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {passFailCriteria.length === 0 ? (
                                <tr>
                                    <td colSpan={2} className="py-6 text-center text-muted-foreground">
                                        No pass/fail requirements added.
                                    </td>
                                </tr>
                            ) : (
                                passFailCriteria.map((c) => (
                                    <tr key={c.id} className="hover:bg-muted/20">
                                        <td className="py-1.5 px-3">
                                            <Input
                                                value={c.criterionName}
                                                onChange={(e) => handleUpdateCriterion(c.id, { criterionName: e.target.value })}
                                                placeholder="e.g. Complete eligibility documents (SEC, BIR)"
                                                className="h-7 text-xs"
                                            />
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveCriterion(c.id)}
                                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
};
