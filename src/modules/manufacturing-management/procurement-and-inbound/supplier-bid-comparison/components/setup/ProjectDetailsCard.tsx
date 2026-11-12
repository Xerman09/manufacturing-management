"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";

const CURRENCIES = ["PHP", "USD", "CNY", "EUR", "JPY", "SGD", "GBP", "AUD"];

export const ProjectDetailsCard: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const compCurr = currentProject.comparisonCurrency || "PHP";

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

                {/* Row 2: Reference no., Compare in, Budget */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Reference no.</Label>
                        <Input
                            value={currentProject.rfqReference}
                            onChange={(e) => updateProject((prev) => ({ ...prev, rfqReference: e.target.value }))}
                            placeholder="RFQ-2026-118"
                            className="h-8 text-xs font-mono bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Compare in</Label>
                        <Select
                            value={compCurr}
                            onValueChange={(val) =>
                                updateProject((prev) => ({ ...prev, comparisonCurrency: val }))
                            }
                        >
                            <SelectTrigger className="h-8 text-xs font-semibold bg-background">
                                <SelectValue placeholder="PHP" />
                            </SelectTrigger>
                            <SelectContent>
                                {CURRENCIES.map((c) => (
                                    <SelectItem key={c} value={c} className="text-xs font-mono font-medium">
                                        {c}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">
                            Budget ({compCurr})
                        </Label>
                        <NumericInputField
                            value={currentProject.budget}
                            onChange={(val) => updateProject((prev) => ({ ...prev, budget: val }))}
                            placeholder="0.00"
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
