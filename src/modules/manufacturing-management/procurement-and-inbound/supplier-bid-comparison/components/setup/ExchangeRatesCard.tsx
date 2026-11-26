"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, DollarSign, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NumericInputField } from "../shared/NumericInputField";
import { ComboboxSelect, ComboboxOption } from "../shared/ComboboxSelect";
import { useBidComparisonStore, isRfqProjectLocked } from "../../hooks/useBidComparisonState";
import { ExchangeRateEntry } from "../../types";
import { FRANKFURTER_CURRENCIES, CURRENCY_MAP, CurrencyInfo } from "../../constants/currencies";

export const ExchangeRatesCard: React.FC = () => {
    const {
        currentProject,
        updateProject,
        forexCache,
        isLoadingForex,
        fetchForexRates,
        countries,
        fetchCountries,
    } = useBidComparisonStore();

    const [newCurrency, setNewCurrency] = useState("");
    const [newRate, setNewRate] = useState<number>(1.0);

    const compCurr = currentProject?.comparisonCurrency || "PHP";
    const rates = useMemo(() => currentProject?.exchangeRates || [], [currentProject?.exchangeRates]);

    // Pre-fetch latest exchange rates and Flagdex country currencies on mount/change
    useEffect(() => {
        if (compCurr) {
            fetchForexRates(compCurr, false);
        }
        fetchCountries();
    }, [compCurr, fetchForexRates, fetchCountries]);

    // Merge ECB/Frankfurter currencies with all Flagdex world currencies (e.g., AFN, VND, TWD)
    const allCurrencyMap = useMemo(() => {
        const map = new Map<string, CurrencyInfo>();
        for (const c of FRANKFURTER_CURRENCIES) {
            map.set(c.code.toUpperCase(), c);
        }
        const extraCurrencies: CurrencyInfo[] = [];
        for (const country of countries || []) {
            for (const cur of country.currencies || []) {
                const code = (cur.code || "").trim().toUpperCase();
                if (!code || map.has(code)) continue;
                const info: CurrencyInfo = {
                    code,
                    name: cur.name || code,
                    symbol: cur.symbol,
                };
                map.set(code, info);
                extraCurrencies.push(info);
            }
        }
        return { map, extraCurrencies };
    }, [countries]);

    // Available ISO 4217 currencies excluding base currency and already added currencies
    const availableCurrencyOptions: ComboboxOption[] = useMemo(() => {
        const addedCodes = new Set(rates.map((r) => r.currencyCode.toUpperCase()));
        addedCodes.add(compCurr.toUpperCase());

        const combined = [
            ...FRANKFURTER_CURRENCIES,
            ...allCurrencyMap.extraCurrencies.sort((a, b) => a.code.localeCompare(b.code)),
        ];

        return combined
            .filter((c) => !addedCodes.has(c.code.toUpperCase()))
            .map((c) => ({
                value: c.code,
                label: `${c.code} — ${c.name}${c.symbol ? ` (${c.symbol})` : ""}`,
            }));
    }, [rates, compCurr, allCurrencyMap]);

    if (!currentProject) return null;

    const isLocked = isRfqProjectLocked(currentProject);

    const handleCurrencySelect = (code: string) => {
        setNewCurrency(code);
        if (!code) {
            setNewRate(1.0);
            return;
        }

        // Instant in-memory resolution from cached Frankfurter rates (0 network latency)
        const cachedRate = forexCache?.ratesToComparison?.[code];
        if (typeof cachedRate === "number" && cachedRate > 0) {
            setNewRate(cachedRate);
        } else {
            setNewRate(1.0);
        }
    };

    const handleAddCurrency = (e: React.FormEvent) => {
        e.preventDefault();
        const code = newCurrency.trim().toUpperCase();
        if (!code) return;
        if (rates.some((r) => r.currencyCode.toUpperCase() === code)) {
            toast.error(`Currency ${code} is already added in exchange rates.`);
            return;
        }

        const resolvedRate =
            (forexCache?.ratesToComparison?.[code] && forexCache.ratesToComparison[code] > 0)
                ? forexCache.ratesToComparison[code]
                : (newRate || 1.0);

        const newEntry: ExchangeRateEntry = {
            currencyCode: code,
            rateToComparison: resolvedRate,
        };

        updateProject((prev) => ({
            ...prev,
            exchangeRates: [...prev.exchangeRates, newEntry],
        }));

        setNewCurrency("");
        setNewRate(1.0);
    };

    const handleRemoveRate = (code: string) => {
        updateProject((prev) => ({
            ...prev,
            exchangeRates: prev.exchangeRates.filter((r) => r.currencyCode !== code),
        }));
    };

    const handleRefreshRates = async () => {
        const result = await fetchForexRates(compCurr, true);
        if (result.success) {
            toast.success(`Exchange rates refreshed from ECB (effective ${result.date || "today"}).`);
        } else {
            toast.error(`Failed to refresh exchange rates: ${result.error || "Network error"}`);
        }
    };

    return (
        <Card className="shadow-xs border-border/80 h-full flex flex-col">
            <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                        <span>1.7 Evaluation Exchange Rates</span>
                    </CardTitle>
                    <CardDescription className="text-xs truncate">
                        Official rates relative to 1 foreign unit = ? {compCurr}.
                        {forexCache?.date && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground/80 font-mono">
                                • ECB as of {forexCache.date}
                            </span>
                        )}
                    </CardDescription>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshRates}
                    disabled={isLoadingForex || isLocked}
                    className="h-7 text-xs gap-1.5 shrink-0"
                    title="Pull latest live exchange rates from Frankfurter (ECB)"
                >
                    <RefreshCw className={cn("h-3.5 w-3.5", isLoadingForex && "animate-spin")} />
                    Refresh Rates
                </Button>
            </CardHeader>
            <CardContent className="p-4 flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {/* Fixed Comparison Base Currency */}
                    <div className="p-2.5 rounded-lg border bg-muted/40 flex flex-col justify-between space-y-1.5">
                        <div className="flex items-center justify-between h-7">
                            <span className="font-bold text-xs font-mono">{compCurr}</span>
                            <span className="text-[10px] text-muted-foreground">Base Currency</span>
                        </div>
                        <div className="h-7 flex items-center px-2 rounded-md border border-transparent text-xs font-mono font-semibold">
                            1.0000
                        </div>
                    </div>

                    {rates.map((r) => {
                        const info = allCurrencyMap.map.get(r.currencyCode.toUpperCase()) || CURRENCY_MAP.get(r.currencyCode);
                        return (
                            <div
                                key={r.currencyCode}
                                className="p-2.5 rounded-lg border bg-card flex flex-col justify-between space-y-1.5"
                            >
                                <div className="flex items-center justify-between h-7">
                                    <div className="flex items-center gap-1 min-w-0">
                                        <span className="font-bold text-xs font-mono">{r.currencyCode}</span>
                                        {info?.symbol && (
                                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                                                {info.symbol}
                                            </span>
                                        )}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={isLocked}
                                        onClick={() => handleRemoveRate(r.currencyCode)}
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive disabled:opacity-40 shrink-0"
                                        title={`Remove ${r.currencyCode} from canvass rates`}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <NumericInputField
                                    value={r.rateToComparison}
                                    onChange={() => {}}
                                    precision={4}
                                    formatFixed
                                    disabled
                                    className="h-7 text-xs font-mono opacity-80 cursor-not-allowed bg-muted/20"
                                />
                            </div>
                        );
                    })}

                    {/* Add Currency Card Tile (matches currency card structure) */}
                    <form
                        onSubmit={handleAddCurrency}
                        className="p-2.5 rounded-lg border border-dashed border-border bg-muted/15 flex flex-col justify-between space-y-1.5"
                    >
                        <div className="flex items-center gap-1.5 h-7 min-w-0">
                            <div className="flex-1 min-w-0">
                                <ComboboxSelect
                                    options={availableCurrencyOptions}
                                    value={newCurrency}
                                    disabled={isLocked}
                                    onChange={(val) => handleCurrencySelect(val)}
                                    placeholder="Currency..."
                                    searchPlaceholder="Search ISO currency..."
                                    allowAdHoc={false}
                                    className="h-7 text-xs bg-background px-2"
                                />
                            </div>
                            <Button
                                type="submit"
                                size="sm"
                                variant="secondary"
                                disabled={isLocked || !newCurrency}
                                className="h-7 px-2 text-xs shrink-0 gap-1"
                                title="Add selected currency rate"
                            >
                                <Plus className="h-3 w-3" />
                                Add
                            </Button>
                        </div>
                        <NumericInputField
                            value={newRate}
                            onChange={(val) => setNewRate(val)}
                            placeholder="1.0000"
                            precision={4}
                            formatFixed
                            disabled
                            className="h-7 text-xs font-mono opacity-80 cursor-not-allowed bg-muted/20"
                        />
                    </form>
                </div>
            </CardContent>
        </Card>
    );
};
