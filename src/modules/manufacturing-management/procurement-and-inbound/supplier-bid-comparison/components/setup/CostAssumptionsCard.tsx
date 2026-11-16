"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";

export const CostAssumptionsCard: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    return (
        <Card className="shadow-xs border-border/80 h-full flex flex-col bg-card">
            <CardHeader className="py-3 px-4 border-b bg-muted/10">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <span>🧮</span>
                    <span>Cost assumptions</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                {/* Row 1: FX buffer, Cost of money, Default VAT */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">FX risk buffer %</Label>
                        <NumericInputField
                            value={currentProject.fxRiskBufferPct}
                            onChange={(val) => updateProject((prev) => ({ ...prev, fxRiskBufferPct: val }))}
                            min={0}
                            max={100}
                            className="h-8 text-xs bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Cost of money % / yr</Label>
                        <NumericInputField
                            value={currentProject.costOfMoneyPctPerYear}
                            onChange={(val) => updateProject((prev) => ({ ...prev, costOfMoneyPctPerYear: val }))}
                            min={0}
                            max={100}
                            className="h-8 text-xs bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Default VAT %</Label>
                        <NumericInputField
                            value={currentProject.defaultVatPct}
                            onChange={(val) => updateProject((prev) => ({ ...prev, defaultVatPct: val }))}
                            min={0}
                            max={100}
                            className="h-8 text-xs bg-background"
                        />
                    </div>
                </div>

                {/* Row 2: Checkbox */}
                <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                        id="count-vat-cost"
                        checked={currentProject.countVatAsCost}
                        onCheckedChange={(checked) =>
                            updateProject((prev) => ({ ...prev, countVatAsCost: Boolean(checked) }))
                        }
                    />
                    <label
                        htmlFor="count-vat-cost"
                        className="text-xs text-foreground font-medium cursor-pointer select-none"
                    >
                        Count VAT as a cost (untick if your company claims input VAT)
                    </label>
                </div>

                {/* Row 3: Explanatory note */}
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
                    The <strong className="text-foreground font-medium">FX buffer</strong> is added to every amount in a foreign currency, to cover exchange-rate movement before payment. <strong className="text-foreground font-medium">Cost of money</strong> prices the payment terms: paying a down payment early costs you, paying later (net terms) saves you.
                </p>
            </CardContent>
        </Card>
    );
};
