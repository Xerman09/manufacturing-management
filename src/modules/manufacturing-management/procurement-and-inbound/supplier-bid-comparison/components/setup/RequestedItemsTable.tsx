"use client";

import React from "react";
import { Plus, Trash2, Box, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ComboboxSelect, ComboboxOption } from "../shared/ComboboxSelect";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { RequestedItem } from "../../types";
import { calculateCbm, convertToKg } from "../../constants/uom-conversions";

export const RequestedItemsTable: React.FC = () => {
    const { currentProject, updateProject, lookups } = useBidComparisonStore();

    const productOptions: ComboboxOption[] = React.useMemo(() => {
        return (lookups.products || []).map((p) => ({
            value: p.productName,
            label: p.productName,
            subLabel: `${p.productCode ? p.productCode + " · " : ""}${p.uom} · Target: ₱${p.targetUnitPrice}`,
            extra: p,
        }));
    }, [lookups.products]);

    const unitOptions: ComboboxOption[] = React.useMemo(() => {
        const fallback = [
            { unitId: 1, unitName: "Pieces", unitShortcut: "pcs" },
            { unitId: 2, unitName: "Sets", unitShortcut: "set" },
            { unitId: 3, unitName: "Boxes", unitShortcut: "box" },
            { unitId: 4, unitName: "Rolls", unitShortcut: "roll" },
            { unitId: 5, unitName: "Meters", unitShortcut: "m" },
            { unitId: 6, unitName: "Kilograms", unitShortcut: "kg" },
            { unitId: 7, unitName: "Liters", unitShortcut: "L" },
            { unitId: 8, unitName: "Units", unitShortcut: "unit" },
            { unitId: 9, unitName: "Lengths", unitShortcut: "length" },
        ];
        const source = lookups.units && lookups.units.length > 0 ? lookups.units : fallback;
        return source.map((u) => ({
            value: u.unitShortcut || u.unitName,
            label: u.unitShortcut || u.unitName,
            subLabel: u.unitName && u.unitName !== u.unitShortcut ? u.unitName : undefined,
        }));
    }, [lookups.units]);

    if (!currentProject) return null;

    const items = currentProject.items || [];
    const compCurr = currentProject.comparisonCurrency || "PHP";
    const budget = currentProject.budget || 0;

    const handleAddItem = () => {
        const newItem: RequestedItem = {
            id: "item-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            itemName: "",
            specifications: "",
            quantity: 100,
            uom: "pcs",
            targetUnitPrice: 0,
            hsCode: "",
            dutyPct: 0,
            weightPerUnitKg: 0,
            cbmPerUnit: 0,
            sortOrder: items.length + 1,
        };

        updateProject((prev) => ({
            ...prev,
            items: [...prev.items, newItem],
        }));
    };

    const handleRemoveItem = (itemId: string) => {
        updateProject((prev) => ({
            ...prev,
            items: prev.items.filter((it) => it.id !== itemId),
            // Remove quotations for this item from all bids
            bids: prev.bids.map((bid) => {
                const newQuotes = { ...bid.quotations };
                delete newQuotes[itemId];
                return { ...bid, quotations: newQuotes };
            }),
            // Remove award for this item
            awards: prev.awards.filter((a) => a.rfqItemId !== itemId),
        }));
    };

    const handleUpdateItem = (itemId: string, patch: Partial<RequestedItem>) => {
        updateProject((prev) => ({
            ...prev,
            items: prev.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
        }));
    };

    const handleProductSelect = (itemId: string, selectedName: string, option?: ComboboxOption) => {
        if (option && option.extra) {
            const p = option.extra as {
                productId?: number;
                cbmLength?: number;
                cbmWidth?: number;
                cbmHeight?: number;
                weightKg?: number;
                uom?: string;
                targetUnitPrice?: number;
            };
            const cbm = calculateCbm(p.cbmLength || 0, p.cbmWidth || 0, p.cbmHeight || 0);
            const kg = convertToKg(p.weightKg || 0);

            handleUpdateItem(itemId, {
                itemName: selectedName,
                productId: p.productId,
                uom: p.uom || "pcs",
                targetUnitPrice: p.targetUnitPrice || 0,
                weightPerUnitKg: kg,
                cbmPerUnit: cbm,
            });
        } else {
            handleUpdateItem(itemId, { itemName: selectedName });
        }
    };

    // Calculate total target price across all items
    const totalTargetPrice = items.reduce(
        (sum, it) => sum + (it.quantity || 0) * (it.targetUnitPrice || 0),
        0
    );

    // Variance vs approved budget
    const budgetVariance = budget - totalTargetPrice;
    const variancePct = budget > 0 ? (budgetVariance / budget) * 100 : 0;
    const isWithinBudget = budgetVariance >= 0;

    return (
        <Card className="shadow-xs border-border/80 w-full bg-card">
            <CardHeader className="py-3 px-4 border-b bg-muted/10 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                        <Box className="h-4 w-4 text-primary" />
                        <span>1.3 Requested Items</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Specify all items for suppliers to quote. Weights and volumes feed into freight &amp; container sizing.
                    </CardDescription>
                </div>
                <Button size="sm" onClick={handleAddItem} className="h-7 text-xs gap-1.5 bg-primary text-primary-foreground">
                    <Plus className="h-3.5 w-3.5" />
                    Add Item
                </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted/40 border-b text-muted-foreground font-semibold">
                        <tr>
                            <th className="py-2 px-2.5 w-8 text-center">#</th>
                            <th className="py-2 px-2.5 min-w-[200px]">Item Name / Catalog</th>
                            <th className="py-2 px-2.5 min-w-[160px]">Specifications</th>
                            <th className="py-2 px-2.5 w-24">Qty</th>
                            <th className="py-2 px-2.5 w-22">UOM</th>
                            <th className="py-2 px-2.5 w-28">Target Price ({compCurr})</th>
                            <th className="py-2 px-2.5 w-32 text-right">Total Target ({compCurr})</th>
                            <th className="py-2 px-2.5 w-26">HS Code</th>
                            <th className="py-2 px-2.5 w-18">Duty %</th>
                            <th className="py-2 px-2.5 w-21">kg / unit</th>
                            <th className="py-2 px-2.5 w-24">m³ / unit</th>
                            <th className="py-2 px-2 w-10 text-center"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={12} className="py-8 text-center text-muted-foreground">
                                    No items added yet. Click &ldquo;Add Item&rdquo; above to list required materials or products.
                                </td>
                            </tr>
                        ) : (
                            items.map((item, idx) => {
                                const rowTotalTarget = (item.quantity || 0) * (item.targetUnitPrice || 0);

                                return (
                                    <tr key={item.id} className="hover:bg-muted/15 transition-colors">
                                        <td className="py-2 px-2 text-center text-muted-foreground font-mono">
                                            {idx + 1}
                                        </td>
                                        <td className="py-2 px-2.5">
                                            <ComboboxSelect
                                                options={productOptions}
                                                value={item.itemName}
                                                onChange={(val, opt) => handleProductSelect(item.id, val, opt)}
                                                placeholder="Select product or type..."
                                                className="h-7 text-xs bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2.5">
                                            <Input
                                                value={item.specifications}
                                                onChange={(e) => handleUpdateItem(item.id, { specifications: e.target.value })}
                                                placeholder="Specs / model / dimensions"
                                                className="h-7 text-xs bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2.5">
                                            <NumericInputField
                                                value={item.quantity}
                                                onChange={(val) => handleUpdateItem(item.id, { quantity: val })}
                                                min={1}
                                                fallbackMin={1}
                                                className="h-7 text-xs font-mono bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2.5 w-24">
                                            <ComboboxSelect
                                                options={unitOptions}
                                                value={item.uom}
                                                onChange={(val) => handleUpdateItem(item.id, { uom: val })}
                                                placeholder="UOM"
                                                className="h-7 text-xs font-mono bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2.5">
                                            <NumericInputField
                                                value={item.targetUnitPrice}
                                                onChange={(val) => handleUpdateItem(item.id, { targetUnitPrice: val })}
                                                min={0}
                                                className="h-7 text-xs font-mono font-medium bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-xs text-foreground whitespace-nowrap">
                                            {rowTotalTarget.toLocaleString(undefined, {
                                                minimumFractionDigits: 3,
                                                maximumFractionDigits: 3,
                                            })}
                                        </td>
                                        <td className="py-2 px-2.5">
                                            <Input
                                                value={item.hsCode}
                                                onChange={(e) => handleUpdateItem(item.id, { hsCode: e.target.value })}
                                                placeholder="e.g. 9405.11"
                                                className="h-7 text-xs font-mono bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2.5">
                                            <NumericInputField
                                                value={item.dutyPct}
                                                onChange={(val) => handleUpdateItem(item.id, { dutyPct: val })}
                                                min={0}
                                                max={100}
                                           
                                                className="h-7 text-xs font-mono bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2.5">
                                            <NumericInputField
                                                value={item.weightPerUnitKg}
                                                onChange={(val) => handleUpdateItem(item.id, { weightPerUnitKg: val })}
                                                min={0}
                                                precision={4}
                                                className="h-7 text-xs font-mono bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2.5">
                                            <NumericInputField
                                                value={item.cbmPerUnit}
                                                onChange={(val) => handleUpdateItem(item.id, { cbmPerUnit: val })}
                                                min={0}
                                                precision={6}
                                                className="h-7 text-xs font-mono bg-background"
                                            />
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveItem(item.id)}
                                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </CardContent>

            {/* Footer with Budget Comparison */}
            <CardFooter className="py-3 px-4 border-t bg-muted/10 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6 text-xs">
                    <div>
                        <span className="text-muted-foreground">Items: </span>
                        <span className="font-semibold text-foreground font-mono">{items.length}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Total Target Price: </span>
                        <span className="font-bold text-foreground font-mono">
                            {compCurr} {totalTargetPrice.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Approved Budget: </span>
                        <span className="font-bold text-foreground font-mono">
                            {budget > 0
                                ? `${compCurr} ${budget.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
                                : "Not set"}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {budget > 0 ? (
                        isWithinBudget ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 gap-1.5 py-1 px-2.5 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Under Budget by {compCurr} {budgetVariance.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ({variancePct.toFixed(1)}% buffer)</span>
                            </Badge>
                        ) : (
                            <Badge variant="destructive" className="gap-1.5 py-1 px-2.5 text-xs">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Over Budget by {compCurr} {Math.abs(budgetVariance).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ({Math.abs(variancePct).toFixed(1)}% deficit)</span>
                            </Badge>
                        )
                    ) : (
                        <span className="text-xs text-muted-foreground italic">
                            Set an Approved Budget in Project details to compare variances.
                        </span>
                    )}
                </div>
            </CardFooter>
        </Card>
    );
};
