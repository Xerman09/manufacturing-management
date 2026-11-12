"use client";

import React, { useState } from "react";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { ExchangeRateEntry } from "../../types";

export const ExchangeRatesCard: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    const [newCurrency, setNewCurrency] = useState("");
    const [newRate, setNewRate] = useState<number>(1.0);

    if (!currentProject) return null;

    const rates = currentProject.exchangeRates || [];
    const compCurr = currentProject.comparisonCurrency || "PHP";

    const handleAddCurrency = (e: React.FormEvent) => {
        e.preventDefault();
        const code = newCurrency.trim().toUpperCase();
        if (!code) return;
        if (rates.some((r) => r.currencyCode.toUpperCase() === code)) {
            return;
        }

        const newEntry: ExchangeRateEntry = {
            currencyCode: code,
            rateToComparison: newRate || 1.0,
        };

        updateProject((prev) => ({
            ...prev,
            exchangeRates: [...prev.exchangeRates, newEntry],
        }));

        setNewCurrency("");
        setNewRate(1.0);
    };

    const handleUpdateRate = (code: string, val: number) => {
        updateProject((prev) => ({
            ...prev,
            exchangeRates: prev.exchangeRates.map((r) =>
                r.currencyCode === code ? { ...r, rateToComparison: val } : r
            ),
        }));
    };

    const handleRemoveRate = (code: string) => {
        updateProject((prev) => ({
            ...prev,
            exchangeRates: prev.exchangeRates.filter((r) => r.currencyCode !== code),
        }));
    };

    return (
        <Card className="shadow-xs border-border/80 h-full flex flex-col">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    1.6 Evaluation Exchange Rates
                </CardTitle>
                <CardDescription className="text-xs">
                    Base rates against 1 foreign unit = ? {compCurr}. Figures recalculate instantly across all bids.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4 flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                    {/* Fixed Comparison Currency */}
                    <div className="p-2.5 rounded-lg border bg-muted/40 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-xs font-mono">{compCurr}</span>
                            <span className="text-[10px] text-muted-foreground">Base Currency</span>
                        </div>
                        <span className="text-xs font-mono font-semibold mt-1">1.000000</span>
                    </div>

                    {rates.map((r) => (
                        <div
                            key={r.currencyCode}
                            className="p-2.5 rounded-lg border bg-card flex flex-col justify-between space-y-1.5"
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs font-mono">{r.currencyCode}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveRate(r.currencyCode)}
                                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                            <NumericInputField
                                value={r.rateToComparison}
                                onChange={(val) => handleUpdateRate(r.currencyCode, val)}
                                precision={4}
                                className="h-7 text-xs font-mono"
                            />
                        </div>
                    ))}
                </div>

                {/* Add Currency Row */}
                <form onSubmit={handleAddCurrency} className="flex flex-wrap items-center gap-2 pt-2 border-t max-w-md">
                    <Input
                        value={newCurrency}
                        onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                        placeholder="Currency (e.g. KRW)"
                        maxLength={5}
                        className="h-7 text-xs font-mono uppercase w-32"
                    />
                    <div className="w-28">
                        <NumericInputField
                            value={newRate}
                            onChange={(v) => setNewRate(v)}
                            placeholder="Rate"
                            precision={4}
                            className="h-7 text-xs font-mono"
                        />
                    </div>
                    <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs shrink-0">
                        <Plus className="h-3 w-3 mr-1" />
                        Add Rate
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};
