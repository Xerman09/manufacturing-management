"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore, isRfqProjectLocked } from "../../hooks/useBidComparisonState";
import { SupplierBid } from "../../types";
import { calculateSupplierLandedCost } from "../../engine/landed-cost-calculator";

interface PaymentTermsCardProps {
    bid: SupplierBid;
}

export const PaymentTermsCard: React.FC<PaymentTermsCardProps> = ({ bid }) => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const isLocked = isRfqProjectLocked(currentProject);
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

    const isFullDownpayment = (bid.downPaymentPct ?? 0) >= 100;

    const handleDownpaymentChange = (val: number) => {
        if (val > 100) {
            toast.error("Down payment cannot exceed 100%");
        }
        const clampedVal = Math.min(100, Math.max(0, val));
        if (clampedVal >= 100) {
            handleUpdate({
                downPaymentPct: 100,
                balanceDueDays: 0,
                earlyPayDiscountPct: 0,
                earlyPayDiscountDays: 0,
                takeEarlyPayDiscount: false,
            });
        } else {
            handleUpdate({ downPaymentPct: clampedVal });
        }
    };

    const handleBalanceDueChange = (val: number) => {
        if (val > 365) {
            toast.error("Balance due days cannot exceed 365 days");
        }
        const clampedVal = Math.min(365, Math.max(0, val));
        const currentDiscountDays = bid.earlyPayDiscountDays ?? 0;
        if (currentDiscountDays > clampedVal) {
            handleUpdate({
                balanceDueDays: clampedVal,
                earlyPayDiscountDays: clampedVal,
            });
        } else {
            handleUpdate({ balanceDueDays: clampedVal });
        }
    };

    const handleEarlyDiscountPctChange = (val: number) => {
        if (val > 100) {
            toast.error("Early-pay discount cannot exceed 100%");
        }
        const clampedVal = Math.min(100, Math.max(0, val));
        handleUpdate({ earlyPayDiscountPct: clampedVal });
    };

    const handleEarlyDiscountDaysChange = (val: number) => {
        const maxDays = bid.balanceDueDays ?? 0;
        if (val > maxDays) {
            toast.error(`Early-pay discount days cannot exceed balance due days (${maxDays} days)`);
            handleUpdate({ earlyPayDiscountDays: maxDays });
            return;
        }
        const clampedVal = Math.max(0, val);
        handleUpdate({ earlyPayDiscountDays: clampedVal });
    };

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-primary" />
                    2.4 Payment Terms
                </CardTitle>
                {isFullDownpayment && (
                    <span className="text-[10px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full">
                        100% Upfront (No Balance)
                    </span>
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-3.5">
                {/* Row 1: Down payment % | Balance due | Early-pay discount % */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Down payment %</Label>
                        <NumericInputField
                            value={bid.downPaymentPct}
                            disabled={isLocked}
                            onChange={handleDownpaymentChange}
                            min={0}
                            max={100}
                            className="h-8 text-xs font-mono"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium truncate">
                            Balance due (days after delivery)
                            {isFullDownpayment && <span className="text-[10px] text-muted-foreground ml-1">(Disabled)</span>}
                        </Label>
                        <NumericInputField
                            value={isFullDownpayment ? 0 : bid.balanceDueDays}
                            onChange={handleBalanceDueChange}
                            min={0}
                            max={365}
                            disabled={isLocked || isFullDownpayment}
                            className="h-8 text-xs font-mono disabled:opacity-50 disabled:bg-muted/40 disabled:cursor-not-allowed"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            Early-pay discount %
                            {isFullDownpayment && <span className="text-[10px] text-muted-foreground ml-1">(Disabled)</span>}
                        </Label>
                        <NumericInputField
                            value={isFullDownpayment ? 0 : bid.earlyPayDiscountPct}
                            onChange={handleEarlyDiscountPctChange}
                            min={0}
                            max={100}
                            disabled={isLocked || isFullDownpayment}
                            className="h-8 text-xs font-mono disabled:opacity-50 disabled:bg-muted/40 disabled:cursor-not-allowed"
                        />
                    </div>
                </div>

                {/* Row 2: ...if paid within (days) | Bank / transfer fee per payment (PHP) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                            ...if paid within (days)
                            {isFullDownpayment && <span className="text-[10px] text-muted-foreground ml-1">(Disabled)</span>}
                        </Label>
                        <NumericInputField
                            value={isFullDownpayment ? 0 : bid.earlyPayDiscountDays}
                            onChange={handleEarlyDiscountDaysChange}
                            min={0}
                            max={bid.balanceDueDays ?? 0}
                            disabled={isLocked || isFullDownpayment}
                            className="h-8 text-xs font-mono disabled:opacity-50 disabled:bg-muted/40 disabled:cursor-not-allowed"
                        />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-medium truncate">Bank / transfer fee per payment (PHP)</Label>
                        <NumericInputField
                            value={bid.bankFeePerPaymentCompCurr}
                            disabled={isLocked}
                            onChange={(val) => handleUpdate({ bankFeePerPaymentCompCurr: Math.min(1000000, Math.max(0, val)) })}
                            min={0}
                            max={1000000}
                            className="h-8 text-xs font-mono max-w-xs"
                        />
                    </div>
                </div>

                {/* Row 3: Early payment discount checkbox */}
                <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                        id="take-early-discount"
                        checked={isFullDownpayment ? false : bid.takeEarlyPayDiscount}
                        disabled={isLocked || isFullDownpayment}
                        onCheckedChange={(checked) =>
                            handleUpdate({ takeEarlyPayDiscount: Boolean(checked) })
                        }
                    />
                    <Label
                        htmlFor="take-early-discount"
                        className={`text-xs font-medium ${
                            isLocked || isFullDownpayment
                                ? "cursor-not-allowed text-muted-foreground/60"
                                : "cursor-pointer"
                        }`}
                    >
                        We&apos;ll take the early-payment discount
                    </Label>
                </div>

                {/* Net Impact Statement Footnote */}
                <p className="text-[11px] text-muted-foreground pt-1">
                    {financingCost > 0 ? (
                        <>At {costOfMoney}%/yr cost of money, these terms cost you <strong>PHP {financingCost.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</strong> vs paying on delivery.</>
                    ) : financingCost < 0 ? (
                        <>At {costOfMoney}%/yr cost of money, these terms save you <strong>PHP {Math.abs(financingCost).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</strong> compared to paying on delivery.</>
                    ) : (
                        `At ${costOfMoney}%/yr cost of money, payment on delivery incurs no net financing cost.`
                    )}
                </p>
            </CardContent>
        </Card>
    );
};
