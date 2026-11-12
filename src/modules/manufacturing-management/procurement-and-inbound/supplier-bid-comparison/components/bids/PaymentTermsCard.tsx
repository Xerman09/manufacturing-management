"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { SupplierBid } from "../../types";
import { calculateSupplierLandedCost } from "../../engine/landed-cost-calculator";

interface PaymentTermsCardProps {
    bid: SupplierBid;
}

export const PaymentTermsCard: React.FC<PaymentTermsCardProps> = ({ bid }) => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const items = currentProject.items || [];
    const landedResult = calculateSupplierLandedCost(currentProject, items, bid);

    const handleUpdate = (patch: Partial<SupplierBid>) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => (b.id === bid.id ? { ...b, ...patch } : b)),
        }));
    };

    const financingCost = landedResult.paymentTermsCostCompCurr;
    const costOfMoney = currentProject.costOfMoneyPctPerYear ?? 8;

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Payment terms
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5">
                {/* Row 1: Down payment % | Balance due | Early-pay discount % */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Down payment %</Label>
                        <NumericInputField
                            value={bid.downPaymentPct}
                            onChange={(val) => handleUpdate({ downPaymentPct: val })}
                            min={0}
                            max={100}
                            className="h-8 text-xs font-mono"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium truncate">Balance due (days after delivery)</Label>
                        <NumericInputField
                            value={bid.balanceDueDays}
                            onChange={(val) => handleUpdate({ balanceDueDays: val })}
                            min={0}
                            className="h-8 text-xs font-mono"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Early-pay discount %</Label>
                        <NumericInputField
                            value={bid.earlyPayDiscountPct}
                            onChange={(val) => handleUpdate({ earlyPayDiscountPct: val })}
                            min={0}
                            max={100}
                            className="h-8 text-xs font-mono"
                        />
                    </div>
                </div>

                {/* Row 2: ...if paid within (days) | Bank / transfer fee per payment (PHP) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">...if paid within (days)</Label>
                        <NumericInputField
                            value={bid.earlyPayDiscountDays}
                            onChange={(val) => handleUpdate({ earlyPayDiscountDays: val })}
                            min={0}
                            className="h-8 text-xs font-mono"
                        />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-medium truncate">Bank / transfer fee per payment (PHP)</Label>
                        <NumericInputField
                            value={bid.bankFeePerPaymentCompCurr}
                            onChange={(val) => handleUpdate({ bankFeePerPaymentCompCurr: val })}
                            className="h-8 text-xs font-mono max-w-xs"
                        />
                    </div>
                </div>

                {/* Row 3: Early payment discount checkbox */}
                <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                        id="take-early-discount"
                        checked={bid.takeEarlyPayDiscount}
                        onCheckedChange={(checked) =>
                            handleUpdate({ takeEarlyPayDiscount: Boolean(checked) })
                        }
                    />
                    <Label htmlFor="take-early-discount" className="text-xs cursor-pointer font-medium">
                        We&apos;ll take the early-payment discount
                    </Label>
                </div>

                {/* Net Impact Statement Footnote */}
                <p className="text-[11px] text-muted-foreground pt-1">
                    {financingCost > 0 ? (
                        <>At {costOfMoney}%/yr cost of money, these terms cost you <strong>PHP {financingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> vs paying on delivery.</>
                    ) : financingCost < 0 ? (
                        <>At {costOfMoney}%/yr cost of money, these terms save you <strong>PHP {Math.abs(financingCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> compared to paying on delivery.</>
                    ) : (
                        `At ${costOfMoney}%/yr cost of money, payment on delivery incurs no net financing cost.`
                    )}
                </p>
            </CardContent>
        </Card>
    );
};
