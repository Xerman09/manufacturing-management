"use client";

import React, { useState } from "react";
import { Plus, Trash2, Tag, Layers, AlertCircle, Calculator, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { SupplierBid, ItemQuotation, PriceBreak } from "../../types";
import { calculateSupplierLandedCost } from "../../engine/landed-cost-calculator";

interface ItemQuotationsTableProps {
    bid: SupplierBid;
}

export const ItemQuotationsTable: React.FC<ItemQuotationsTableProps> = ({ bid }) => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const items = currentProject.items || [];
    const compCurr = currentProject.comparisonCurrency || "PHP";
    const [showFormula, setShowFormula] = useState(true);
    const landedResult = React.useMemo(
        () => calculateSupplierLandedCost(currentProject, items, bid),
        [currentProject, items, bid]
    );

    const handleAddPrice = (itemId: string) => {
        const item = items.find((i) => i.id === itemId);
        const newQuote: ItemQuotation = {
            id: "quote-" + Date.now().toString(36),
            rfqItemId: itemId,
            discountPct: 0,
            priceBreaks: [
                {
                    id: "break-1",
                    minQuantity: 1,
                    unitPrice: item?.targetUnitPrice || 0,
                },
            ],
        };

        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) =>
                b.id === bid.id
                    ? { ...b, quotations: { ...b.quotations, [itemId]: newQuote } }
                    : b
            ),
        }));
    };

    const handleRemoveQuote = (itemId: string) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => {
                if (b.id !== bid.id) return b;
                const newQuotes = { ...b.quotations };
                delete newQuotes[itemId];
                return { ...b, quotations: newQuotes };
            }),
        }));
    };

    const handleUpdateDiscount = (itemId: string, disc: number) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => {
                if (b.id !== bid.id) return b;
                const quote = b.quotations[itemId];
                if (!quote) return b;
                return {
                    ...b,
                    quotations: {
                        ...b.quotations,
                        [itemId]: { ...quote, discountPct: disc },
                    },
                };
            }),
        }));
    };

    const handleAddPriceBreak = (itemId: string) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => {
                if (b.id !== bid.id) return b;
                const quote = b.quotations[itemId];
                if (!quote) return b;
                const lastBreak = quote.priceBreaks[quote.priceBreaks.length - 1];
                const newBreak: PriceBreak = {
                    id: "break-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
                    minQuantity: lastBreak ? lastBreak.minQuantity * 2 : 100,
                    unitPrice: lastBreak ? lastBreak.unitPrice * 0.95 : 0,
                };
                return {
                    ...b,
                    quotations: {
                        ...b.quotations,
                        [itemId]: {
                            ...quote,
                            priceBreaks: [...quote.priceBreaks, newBreak],
                        },
                    },
                };
            }),
        }));
    };

    const handleUpdatePriceBreak = (
        itemId: string,
        breakId: string,
        field: "minQuantity" | "unitPrice",
        val: number
    ) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => {
                if (b.id !== bid.id) return b;
                const quote = b.quotations[itemId];
                if (!quote) return b;
                return {
                    ...b,
                    quotations: {
                        ...b.quotations,
                        [itemId]: {
                            ...quote,
                            priceBreaks: quote.priceBreaks.map((br) =>
                                br.id === breakId ? { ...br, [field]: val } : br
                            ),
                        },
                    },
                };
            }),
        }));
    };

    const handleRemovePriceBreak = (itemId: string, breakId: string) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => {
                if (b.id !== bid.id) return b;
                const quote = b.quotations[itemId];
                if (!quote) return b;
                if (quote.priceBreaks.length <= 1) return b; // Keep at least one
                return {
                    ...b,
                    quotations: {
                        ...b.quotations,
                        [itemId]: {
                            ...quote,
                            priceBreaks: quote.priceBreaks.filter((br) => br.id !== breakId),
                        },
                    },
                };
            }),
        }));
    };

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                            <Tag className="h-4 w-4 text-primary" />
                            2.2 Item Quotations &amp; Tiered Price Breaks ({compCurr})
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                            Enter unit prices and discounts in {bid.quoteCurrency}. Best price tier is automatically applied and converted to {compCurr} landed costs.
                        </CardDescription>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFormula((v) => !v)}
                        className="h-7 text-xs gap-1.5 font-medium"
                    >
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        {showFormula ? "Hide Formula" : "Show Formula"}
                        {showFormula ? <ChevronUp className="h-3 w-3 opacity-60" /> : <ChevronDown className="h-3 w-3 opacity-60" />}
                    </Button>
                </div>

                {/* Landed Cost Calculation Formula Strip */}
                {showFormula && (
                    <div className="mt-3 p-3 rounded-lg bg-card border text-xs space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-semibold border-b pb-1.5 text-foreground">
                            <span className="flex items-center gap-1.5">
                                <Calculator className="h-3.5 w-3.5 text-primary" />
                                Landed Cost Calculation Formula:
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                                {bid.quoteCurrency !== compCurr
                                    ? `FX Conversion: 1 ${bid.quoteCurrency} = ${currentProject.exchangeRates?.find((r) => r.currencyCode === bid.quoteCurrency)?.rateToComparison || 1} ${compCurr}`
                                    : `Local Currency: ${compCurr}`}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2 rounded bg-muted/30 border border-border/50">
                                <span className="font-semibold text-foreground block">1. Net Discounted Unit Price:</span>
                                <code className="text-primary font-mono text-[10px] block mt-0.5">
                                    Unit Price Net = Quoted Unit Price × (1 - Discount % ÷ 100)
                                </code>
                            </div>

                            <div className="p-2 rounded bg-muted/30 border border-border/50">
                                <span className="font-semibold text-foreground block">2. Quoted Goods Total:</span>
                                <code className="text-primary font-mono text-[10px] block mt-0.5">
                                    Goods Total ({compCurr}) = Order Qty × Unit Price Net × FX Rate
                                </code>
                            </div>

                            <div className="p-2 rounded bg-muted/30 border border-border/50 md:col-span-2">
                                <span className="font-semibold text-foreground block">3. Allocated Landed Cost Total:</span>
                                <code className="text-primary font-mono text-[10px] block mt-0.5">
                                    Item Landed Total = Goods ({compCurr}) + Freight + Insurance + Duty + VAT + Port/Customs Fees + Inland Trucking + Financing Net Cost
                                </code>
                            </div>

                            <div className="p-2 rounded bg-muted/30 border border-border/50 md:col-span-2">
                                <span className="font-semibold text-foreground block">4. Landed Unit Cost:</span>
                                <code className="text-primary font-mono text-[10px] block mt-0.5">
                                    Landed Unit Cost ({compCurr}) = Item Landed Total ({compCurr}) ÷ Order Qty
                                </code>
                            </div>
                        </div>
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted/40 border-b text-muted-foreground font-semibold">
                        <tr>
                            <th className="py-2 px-3 w-8 text-center">#</th>
                            <th className="py-2 px-3 min-w-[180px]">Item &amp; Specifications</th>
                            <th className="py-2 px-3 w-28">Order Qty</th>
                            <th className="py-2 px-3 min-w-[300px]">Price Breaks ({bid.quoteCurrency})</th>
                            <th className="py-2 px-3 w-20">Disc %</th>
                            <th className="py-2 px-3 min-w-[140px] text-right bg-primary/5">
                                Landed Unit ({compCurr})
                            </th>
                            <th className="py-2 px-3 min-w-[140px] text-right bg-primary/5">
                                Landed Total ({compCurr})
                            </th>
                            <th className="py-2 px-2 w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                                    No items requested in Setup. Go to Step 1 to add items.
                                </td>
                            </tr>
                        ) : (
                            items.map((item, idx) => {
                                const quote = bid.quotations?.[item.id];
                                const breakdown = landedResult.items[item.id];

                                return (
                                    <tr key={item.id} className="hover:bg-muted/15 transition-colors">
                                        <td className="py-2.5 px-3 text-center text-muted-foreground font-mono">
                                            {idx + 1}
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <span className="font-semibold block">{item.itemName}</span>
                                            <span className="text-[10px] text-muted-foreground block truncate max-w-xs">
                                                {item.specifications || "No specs"} · Target: {compCurr}{" "}
                                                {item.targetUnitPrice.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-medium">
                                            {item.quantity.toLocaleString()} {item.uom}
                                        </td>

                                        {/* Price Breaks Column */}
                                        <td className="py-2 px-3">
                                            {!quote ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleAddPrice(item.id)}
                                                    className="h-7 text-xs gap-1 border-dashed"
                                                >
                                                    <Plus className="h-3 w-3" />
                                                    Add Price
                                                </Button>
                                            ) : (
                                                <div className="space-y-1.5 py-1">
                                                    {quote.priceBreaks.map((br, bIdx) => (
                                                        <div key={br.id} className="flex items-center gap-1.5">
                                                            <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                                                                &ge; {br.minQuantity} {item.uom}:
                                                            </span>
                                                            <div className="w-24">
                                                                <NumericInputField
                                                                    value={br.minQuantity}
                                                                    onChange={(val) =>
                                                                        handleUpdatePriceBreak(
                                                                            item.id,
                                                                            br.id,
                                                                            "minQuantity",
                                                                            val
                                                                        )
                                                                    }
                                                                    min={1}
                                                                    className="h-6 text-[11px]"
                                                                    placeholder="Min Qty"
                                                                />
                                                            </div>
                                                            <div className="w-28">
                                                                <NumericInputField
                                                                    value={br.unitPrice}
                                                                    onChange={(val) =>
                                                                        handleUpdatePriceBreak(
                                                                            item.id,
                                                                            br.id,
                                                                            "unitPrice",
                                                                            val
                                                                        )
                                                                    }
                                                                    min={0}
                                                                    prefix={bid.quoteCurrency}
                                                                    className="h-6 text-[11px] font-bold"
                                                                    placeholder="Price"
                                                                />
                                                            </div>
                                                            {quote.priceBreaks.length > 1 && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        handleRemovePriceBreak(item.id, br.id)
                                                                    }
                                                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    ))}

                                                    <div className="flex items-center gap-2 pt-1">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleAddPriceBreak(item.id)}
                                                            className="h-5 text-[10px] p-0 text-primary hover:underline gap-1"
                                                        >
                                                            <Plus className="h-2.5 w-2.5" />
                                                            + Price Break Tier
                                                        </Button>

                                                        {breakdown?.isBelowMoq && (
                                                            <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                                                                <AlertCircle className="h-3 w-3" /> Below MOQ
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </td>

                                        {/* Discount % Column */}
                                        <td className="py-2.5 px-3">
                                            {quote && (
                                                <NumericInputField
                                                    value={quote.discountPct}
                                                    onChange={(val) => handleUpdateDiscount(item.id, val)}
                                                    min={0}
                                                    max={100}
                                                    suffix="%"
                                                    className="h-7 text-xs font-mono w-16"
                                                />
                                            )}
                                        </td>

                                        {/* Landed Unit Cost */}
                                        <td className="py-2.5 px-3 text-right bg-primary/5 font-mono">
                                            {breakdown && breakdown.hasQuote ? (
                                                <div>
                                                    <span className="font-bold text-xs block text-foreground">
                                                        ₱{breakdown.landedUnitCostCompCurr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                    <span
                                                        className="text-[10px] text-muted-foreground block truncate"
                                                        title={`Formula: ₱${breakdown.totalLandedCompCurr.toLocaleString()} ÷ ${item.quantity.toLocaleString()} ${item.uom}`}
                                                    >
                                                        = ₱{breakdown.totalLandedCompCurr.toLocaleString()} ÷ {item.quantity.toLocaleString()}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>

                                        {/* Landed Total */}
                                        <td className="py-2.5 px-3 text-right bg-primary/5 font-mono">
                                            {breakdown && breakdown.hasQuote ? (
                                                <div>
                                                    <span className="font-bold text-xs block text-foreground">
                                                        ₱{breakdown.totalLandedCompCurr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                    <span
                                                        className="text-[10px] text-muted-foreground block truncate"
                                                        title={`Formula: Goods (₱${breakdown.goodsCompCurr.toLocaleString()}) + Landed fees (₱${Math.round(breakdown.totalLandedCompCurr - breakdown.goodsCompCurr).toLocaleString()})`}
                                                    >
                                                        Goods ₱{breakdown.goodsCompCurr.toLocaleString()} + Fees ₱{Math.round(breakdown.totalLandedCompCurr - breakdown.goodsCompCurr).toLocaleString()}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </td>

                                        <td className="py-2.5 px-2 text-center">
                                            {quote && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveQuote(item.id)}
                                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                                    title="Clear quote"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </CardContent>
        </Card>
    );
};
