"use client";

import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { SupplierBid } from "../../types";
import { calculateSupplierLandedCost } from "../../engine/landed-cost-calculator";
import { INCOTERMS_CONFIG } from "../../constants/incoterms";

interface BidValidationChecksProps {
    bid: SupplierBid;
}

interface CheckItem {
    type: "bad" | "warn" | "info";
    icon: string;
    message: string;
}

const TRADE_AGREEMENT_LABELS: Record<string, string> = {
    ACFTA: "ACFTA (China) – Form E",
    AJCEP: "AJCEP (Japan) – Form AJ",
    AKFTA: "AKFTA (Korea) – Form AK",
    AIFTA: "AIFTA (India) – Form AI",
    ATIGA: "ATIGA (ASEAN) – Form D",
    RCEP: "RCEP – Regional Comprehensive Economic Partnership",
    NONE: "None / Standard WTO Rates",
};

export const BidValidationChecks: React.FC<BidValidationChecksProps> = ({ bid }) => {
    const { currentProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const items = currentProject.items || [];
    const isLocal = bid.supplierType === "LOCAL";
    const incotermKey = bid.incoterm || (isLocal ? "DELIVERED" : "FOB");
    const incoConfig = INCOTERMS_CONFIG[incotermKey] || INCOTERMS_CONFIG.DELIVERED;
    const res = calculateSupplierLandedCost(currentProject, items, bid);

    const checks: CheckItem[] = [];

    // 1. Mandatory pass/fail gates & disqualifications (BAD or WARN)
    const passFailCriteria = (currentProject.qualityCriteria || []).filter((c) => c.criterionType === "PASS_FAIL");
    const failedGates: string[] = [];
    const pendingGates: string[] = [];

    for (const crit of passFailCriteria) {
        const evalResult = bid.scores?.[crit.id];
        if (evalResult?.passFailResult === "FAIL") {
            failedGates.push(crit.criterionName);
        } else if (!evalResult || evalResult.passFailResult === "NOT_CHECKED") {
            pendingGates.push(crit.criterionName);
        }
    }

    if (failedGates.length > 0) {
        checks.push({
            type: "bad",
            icon: "🛑",
            message: `Disqualified — failed mandatory requirement(s): ${failedGates.join("; ")}.`,
        });
    }

    // 2. Validity / Expiration Checks
    if (bid.validUntil) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const validDate = new Date(bid.validUntil);
        const diffMs = validDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
            checks.push({
                type: "bad",
                icon: "🛑",
                message: `Quote expired on ${bid.validUntil}. Ask for an updated quotation.`,
            });
        } else if (daysRemaining <= 7) {
            checks.push({
                type: "warn",
                icon: "⚠️",
                message: `Quote expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} (${bid.validUntil}).`,
            });
        }
    } else {
        checks.push({
            type: "warn",
            icon: "⚠️",
            message: "No quote validity date entered.",
        });
    }

    // 3. Pending gates & incomplete scoring
    if (pendingGates.length > 0) {
        checks.push({
            type: "warn",
            icon: "⚠️",
            message: `Mandatory requirement not yet verified: ${pendingGates.join("; ")}.`,
        });
    }

    const scoredCriteria = (currentProject.qualityCriteria || []).filter((c) => c.criterionType === "SCORED");
    if (scoredCriteria.length > 0) {
        const scoredCount = scoredCriteria.filter((c) => {
            const sc = bid.scores?.[c.id]?.score;
            return typeof sc === "number" && sc >= 1;
        }).length;
        if (scoredCount < scoredCriteria.length) {
            checks.push({
                type: "warn",
                icon: "⚠️",
                message: `Quality: only ${scoredCount} of ${scoredCriteria.length} scored criteria rated.`,
            });
        }
    }

    // 4. Missing item quotations & MOQ violations
    const unquotedItems: string[] = [];
    let totalVolumeM3 = 0;
    let totalWeightKg = 0;

    items.forEach((item) => {
        const itemBreakdown = res.items[item.id];
        const quote = bid.quotations?.[item.id];

        if (!quote || !quote.priceBreaks || quote.priceBreaks.length === 0) {
            unquotedItems.push(item.itemName);
            return;
        }

        totalVolumeM3 += item.quantity * (item.cbmPerUnit || 0);
        totalWeightKg += item.quantity * (item.weightPerUnitKg || 0);

        // Below MOQ
        if (itemBreakdown?.isBelowMoq) {
            const sortedBreaks = [...quote.priceBreaks].sort((a, b) => a.minQuantity - b.minQuantity);
            const minMoq = sortedBreaks[0]?.minQuantity || 1;
            checks.push({
                type: "bad",
                icon: "🛑",
                message: `${item.itemName}: your order quantity ${item.quantity} is below the minimum order of ${minMoq}.`,
            });
        }

        // Volume break drop opportunity
        if (itemBreakdown?.nextBreakUnitsNeeded) {
            const nextBreakQty = item.quantity + itemBreakdown.nextBreakUnitsNeeded;
            const targetBreak = quote.priceBreaks.find((pb) => pb.minQuantity === nextBreakQty);
            const nextUnitPrice = targetBreak ? targetBreak.unitPrice : 0;
            checks.push({
                type: "info",
                icon: "💡",
                message: `${item.itemName}: ordering ${nextBreakQty} (+${itemBreakdown.nextBreakUnitsNeeded}) drops the unit price to ${bid.quoteCurrency} ${nextUnitPrice.toFixed(3)}.`,
            });
        }
    });

    if (unquotedItems.length > 0 && items.length > 0) {
        checks.push({
            type: "warn",
            icon: "⚠️",
            message: `No bid for: ${unquotedItems.join(", ")}.`,
        });
    }

    // 5. Incoterm Understated Cost Checks
    if (!isLocal && unquotedItems.length < items.length) {
        const missingExpenses: string[] = [];
        if (incoConfig.buyerPaysFreight && (!bid.freightRate || bid.freightRate <= 0)) {
            missingExpenses.push("freight");
        }
        if (incoConfig.buyerPaysInsurance && (!bid.insuranceRateOrAmount || bid.insuranceRateOrAmount <= 0)) {
            missingExpenses.push("insurance");
        }
        if (
            incoConfig.buyerPaysBrokerageAndCustoms &&
            (!bid.brokerageCompCurr || bid.brokerageCompCurr <= 0) &&
            (!bid.otherPortChargesCompCurr || bid.otherPortChargesCompCurr <= 0)
        ) {
            missingExpenses.push("brokerage/customs fees");
        }
        if (incoConfig.buyerPaysInlandTrucking && (!bid.inlandTruckingCompCurr || bid.inlandTruckingCompCurr <= 0)) {
            missingExpenses.push("inland trucking");
        }

        if (missingExpenses.length > 0) {
            checks.push({
                type: "warn",
                icon: "⚠️",
                message: `Under ${incotermKey} you still pay: ${missingExpenses.join(", ")} — not entered yet, so the landed total is understated.`,
            });
        }

        // Freight metric volume/weight missing
        if (incoConfig.buyerPaysFreight && bid.freightBasis === "PER_CBM" && totalVolumeM3 <= 0) {
            checks.push({
                type: "warn",
                icon: "⚠️",
                message: "Freight is per m³ but the items have no volume — add m³/unit in Setup.",
            });
        }
        if (incoConfig.buyerPaysFreight && bid.freightBasis === "PER_KG" && totalWeightKg <= 0) {
            checks.push({
                type: "warn",
                icon: "⚠️",
                message: "Freight is per kg but the items have no weight — add kg/unit in Setup.",
            });
        }

        // Zero duty confirmation
        if (
            incoConfig.buyerPaysDutyAndVat &&
            (bid.dutyMode === "PER_ITEM" || !bid.dutyMode) &&
            items.every((it) => !it.dutyPct || it.dutyPct <= 0)
        ) {
            checks.push({
                type: "info",
                icon: "💡",
                message: "All item duty rates are 0% — confirm the HS codes and rates in Setup.",
            });
        }

        // FTA Certificate requirement
        if (incoConfig.buyerPaysDutyAndVat && bid.dutyMode === "FTA") {
            const ftaKey = bid.ftaAgreementName || "ACFTA";
            const ftaLabel = TRADE_AGREEMENT_LABELS[ftaKey] || ftaKey;
            checks.push({
                type: "info",
                icon: "💡",
                message: `Preferential duty needs a valid certificate of origin (${ftaLabel}) at clearance; without it the normal item rates apply.`,
            });
        }

        // BOC Informal Entry check (< ₱50,000 CIF per declaration)
        const declCount = Math.max(bid.declarationsCount || 1, 1);
        const cifPerDecl = res.cifDutiableValueCompCurr / declCount;
        if (incoConfig.buyerPaysDutyAndVat && cifPerDecl > 0 && cifPerDecl < 50000) {
            checks.push({
                type: "info",
                icon: "💡",
                message: "Under ₱50,000 per declaration — this may clear as a BOC informal entry, which has lower flat charges.",
            });
        }
    } else if (isLocal && incoConfig.buyerPaysInlandTrucking && (!bid.inlandTruckingCompCurr || bid.inlandTruckingCompCurr <= 0)) {
        checks.push({
            type: "warn",
            icon: "⚠️",
            message: "Pick-up: inland trucking cost not entered.",
        });
    }

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Checks
                </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-2">
                {checks.length > 0 ? (
                    checks.map((check, idx) => {
                        const styleClass =
                            check.type === "bad"
                                ? "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-900/50 text-rose-900 dark:text-rose-200"
                                : check.type === "warn"
                                    ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-900/50 text-amber-900 dark:text-amber-200"
                                    : "bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/80 dark:border-blue-900/50 text-blue-900 dark:text-blue-200";

                        return (
                            <div
                                key={idx}
                                className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 leading-relaxed font-medium ${styleClass}`}
                            >
                                <span className="text-sm leading-none shrink-0 select-none">{check.icon}</span>
                                <span>{check.message}</span>
                            </div>
                        );
                    })
                ) : (
                    <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>All checks passed. Quotation is compliant and valid.</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
