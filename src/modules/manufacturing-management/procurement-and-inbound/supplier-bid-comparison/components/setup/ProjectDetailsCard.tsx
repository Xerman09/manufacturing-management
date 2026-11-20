"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumericInputField } from "../shared/NumericInputField";
import { ComboboxSelect, ComboboxOption } from "../shared/ComboboxSelect";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { FRANKFURTER_CURRENCIES } from "../../constants/currencies";
import { AlertCircle } from "lucide-react";

export const ProjectDetailsCard: React.FC = () => {
    const {
        currentProject,
        updateProject,
        projectsList,
        saveError,
        fetchForexRates,
    } = useBidComparisonStore();

    const currencyOptions: ComboboxOption[] = React.useMemo(() => {
        return FRANKFURTER_CURRENCIES.map((c) => ({
            value: c.code,
            label: `${c.code} — ${c.name}${c.symbol ? ` (${c.symbol})` : ""}`,

        }));
    }, []);

    const isReferenceDuplicate = React.useMemo(() => {
        if (!currentProject?.rfqReference?.trim()) return false;
        const ref = currentProject.rfqReference.trim().toLowerCase();
        const round = currentProject.roundNo || 1;
        return projectsList.some(
            (p) =>
                p.id !== currentProject.id &&
                p.rfqReference?.trim().toLowerCase() === ref &&
                (p.roundNo || 1) === round
        );
    }, [currentProject, projectsList]);

    if (!currentProject) return null;

    const compCurr = currentProject.comparisonCurrency || "PHP";

    const isSaveErrorConflict = Boolean(
        saveError && (saveError.toLowerCase().includes("reference") || saveError.toLowerCase().includes("unique"))
    );

    const hasRefError = isReferenceDuplicate || isSaveErrorConflict;

    return (
        <Card className="shadow-xs border-border/80 h-full flex flex-col bg-card">
            <CardHeader className="py-3 px-4 border-b bg-muted/10">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <span className="text-amber-500 font-bold">📁</span>
                    <span>Project</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 flex-1">
                {/* Row 1: Title */}
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-medium">Project / RFQ title</Label>
                    <Input
                        value={currentProject.rfqTitle}
                        onChange={(e) => updateProject((prev) => ({ ...prev, rfqTitle: e.target.value }))}
                        placeholder="e.g. LED lighting retrofit — Warehouse B"
                        className="h-8 text-xs bg-background"
                    />
                </div>

                {/* Row 2: Reference no., Target date, Compare in, Budget */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <Label className={`text-xs font-medium ${hasRefError ? "text-destructive" : "text-muted-foreground"}`}>
                                Reference no.
                            </Label>
                            {hasRefError && (
                                <span className="text-[10px] text-destructive font-semibold">Already taken</span>
                            )}
                        </div>
                        <Input
                            value={currentProject.rfqReference}
                            onChange={(e) => updateProject((prev) => ({ ...prev, rfqReference: e.target.value }))}
                            placeholder="RFQ-2026-118"
                            disabled
                            className={`h-8 text-xs font-mono bg-background transition-colors ${
                                hasRefError
                                    ? "border-destructive text-destructive focus-visible:ring-destructive bg-destructive/5"
                                    : ""
                            }`}
                        />
                        {hasRefError && (
                            <p className="text-[11px] text-destructive font-medium flex items-center gap-1.5 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Reference is already in use by another RFQ project round.</span>
                            </p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Target date</Label>
                        <Input
                            type="date"
                            min="2000-01-01"
                            max="2099-12-31"
                            value={currentProject.targetDate ? currentProject.targetDate.slice(0, 10) : ""}
                            onChange={(e) => updateProject((prev) => ({ ...prev, targetDate: e.target.value }))}
                            className="h-8 text-xs font-mono bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Compare in</Label>
                        <ComboboxSelect
                            options={currencyOptions}
                            value={compCurr}
                            onChange={(val) => {
                                if (!val || val === compCurr) return;
                                updateProject((prev) => ({ ...prev, comparisonCurrency: val }));
                                fetchForexRates(val, true);
                            }}
                            placeholder="Select currency..."
                            searchPlaceholder="Search currency..."
                            allowAdHoc={false}
                            className="h-8 text-xs font-semibold bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">
                            Budget ({compCurr})
                        </Label>
                        <NumericInputField
                            value={currentProject.budget}
                            onChange={(val) => updateProject((prev) => ({ ...prev, budget: val }))}
                            min={0}
                            precision={4}
                            placeholder="0.0000"
                            className="h-8 text-xs font-mono font-semibold bg-background"
                        />
                    </div>
                </div>

                {/* Row 3: Notes */}
                <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground font-medium">Notes</Label>
                    <Textarea
                        value={currentProject.notes}
                        onChange={(e) => updateProject((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Sample project — duty rates and HS codes are illustrative; verify before use."
                        className="text-xs resize-none h-14 bg-background"
                    />
                </div>
            </CardContent>
        </Card>
    );
};
