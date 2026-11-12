"use client";

import React from "react";
import { Receipt} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { SupplierBid } from "../../types";
import { calculateSupplierLandedCost } from "../../engine/landed-cost-calculator";

interface LandedCostBreakdownCardProps {
    bid: SupplierBid;
}

export const LandedCostBreakdownCard: React.FC<LandedCostBreakdownCardProps> = ({ bid }) => {
    const { currentProject } = useBidComparisonStore();

    const res = React.useMemo(() => {
        if (!currentProject) return null;
        const items = currentProject.items || [];
        return calculateSupplierLandedCost(currentProject, items, bid);
    }, [currentProject, bid]);

    if (!currentProject || !res) return null;

    const compCurr = currentProject.comparisonCurrency || "PHP";

    const costLines = [
        { label: "Goods value (after discount)", amount: res.goodsAfterDiscountCompCurr, foreign: bid.quoteCurrency !== compCurr },
        { label: "Ocean / Air Freight", amount: res.freightCompCurr, paidBySupplier: !res.freightCompCurr && bid.supplierType === "INTERNATIONAL" },
        { label: "Marine Cargo Insurance", amount: res.insuranceCompCurr, paidBySupplier: !res.insuranceCompCurr && bid.supplierType === "INTERNATIONAL" },
        { label: "Dutiable Value (CIF)", amount: res.cifDutiableValueCompCurr, isSubtotal: true },
        { label: `FX Risk Buffer (${currentProject.fxRiskBufferPct}%)`, amount: res.fxBufferCompCurr },
        { label: "Customs Import Duty", amount: res.dutyCompCurr },
        {
            label: "Customs & Port Charges (Total)",
            amount: res.customsAndPortTotalCompCurr,
            subDetails: [
                `Brokerage: ₱${res.brokerageCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`,
                `IPC: ₱${res.ipcCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`,
                `CDS & DST: ₱${(res.cdsCompCurr + res.birDstCompCurr).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`,
                `Arrastre & Wharfage: ₱${(res.arrastreCompCurr + res.wharfageCompCurr).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`,
                res.containerSecurityCompCurr > 0 ? `Security: ₱${res.containerSecurityCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "",
                res.lcBankChargeCompCurr > 0 ? `LC Fee: ₱${res.lcBankChargeCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "",
                res.otherPortChargesCompCurr > 0 ? `Other: ₱${res.otherPortChargesCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : "",
            ].filter(Boolean).join(" · "),
        },
        { label: `Value Added Tax (${bid.vatPct}% VAT)`, amount: currentProject.countVatAsCost ? res.vatCompCurr : 0, note: !currentProject.countVatAsCost ? "(Excluded from cost)" : undefined },
        { label: "Inland Delivery / Port Trucking", amount: res.inlandTruckingCompCurr },
        { label: "Bank Wire / Transfer Fees", amount: res.bankFeesCompCurr },
        {
            label: "Payment Terms Net Cost / Benefit",
            amount: res.paymentTermsCostCompCurr,
            note: res.paymentTermsCostCompCurr < 0 ? "(Working capital saving)" : undefined,
        },
    ];

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-primary" />
                    2.6 Complete Landed Cost Breakdown ({compCurr})
                </CardTitle>
                <CardDescription className="text-xs">
                    Transparent audit trail from quoted price to site delivery.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                <div className="divide-y divide-border/60 text-xs">
                    {costLines.map((line, idx) => (
                        <div
                            key={idx}
                            className={`py-2 flex items-center justify-between ${
                                line.isSubtotal ? "bg-muted/40 font-semibold px-2 rounded-sm" : ""
                            }`}
                        >
                            <div className="flex flex-col">
                                <span className={line.isSubtotal ? "font-bold text-foreground" : "text-muted-foreground"}>
                                    {line.label}
                                </span>
                                {line.subDetails && (
                                    <span className="text-[10px] text-muted-foreground/80 mt-0.5">
                                        {line.subDetails}
                                    </span>
                                )}
                                {line.note && (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                        {line.note}
                                    </span>
                                )}
                            </div>

                            <span className="font-mono font-medium">
                                {line.paidBySupplier ? (
                                    <span className="text-muted-foreground italic text-[11px]">Included by supplier</span>
                                ) : (
                                    `₱${line.amount.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
                                )}
                            </span>
                        </div>
                    ))}

                    {/* Total Landed Cost Row */}
                    <div className="pt-3 pb-1 flex items-center justify-between font-bold text-sm bg-primary/5 p-3 rounded-lg border border-primary/20 mt-2">
                        <div className="flex flex-col">
                            <span className="text-foreground">TOTAL LANDED COST</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                                Delivered to site, cleared through customs, and paid for
                            </span>
                        </div>
                        <span className="font-mono text-base text-primary">
                            ₱{res.totalLandedCostCompCurr.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
