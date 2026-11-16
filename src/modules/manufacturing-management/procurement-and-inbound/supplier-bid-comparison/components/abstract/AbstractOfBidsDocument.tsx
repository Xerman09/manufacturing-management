"use client";

import React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { cn } from "@/lib/utils";

interface AbstractOfBidsDocumentProps {
    onPrint?: () => void;
}

export const AbstractOfBidsDocument: React.FC<AbstractOfBidsDocumentProps> = ({ onPrint }) => {
    const { currentProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const items = currentProject.items || [];
    const bids = currentProject.bids || [];
    const awards = currentProject.awards || [];
    const compCurr = currentProject.comparisonCurrency || "PHP";
    const summary = evaluateAndCompareSuppliers(currentProject);

    const awardTotalLanded = awards.reduce((sum, a) => sum + (a.awardedLandedTotal || 0), 0);
    const budgetVariance = currentProject.budget ? awardTotalLanded - currentProject.budget : null;

    return (
        <Card className="w-full shadow-xs border-border/80 bg-card print:border-none print:shadow-none print:bg-white print:p-0">
            <style>{`
                @media print {
                    @page {
                        size: auto;
                        margin: 8mm;
                    }

                    html,
                    body {
                        width: 100% !important;
                        height: auto !important;
                        min-height: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    #__next,
                    [data-slot="sidebar-wrapper"],
                    [data-slot="sidebar-inset"],
                    main {
                        height: auto !important;
                        min-height: 0 !important;
                        max-height: none !important;
                        overflow: visible !important;
                        position: static !important;
                        transform: none !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        border: none !important;
                    }

                    header,
                    nav,
                    aside,
                    [data-slot="sidebar"],
                    .print\\:hidden,
                    [data-radix-portal],
                    [data-radix-popper-content-wrapper],
                    [role="menu"],
                    [data-slot="dropdown-menu-content"],
                    .toaster,
                    [data-sonner-toaster] {
                        display: none !important;
                        visibility: hidden !important;
                        opacity: 0 !important;
                        height: 0 !important;
                        width: 0 !important;
                        pointer-events: none !important;
                    }

                    .abstract-section {
                        page-break-inside: auto !important;
                        break-inside: auto !important;
                    }

                    .abstract-section-avoid-break {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }

                    .abstract-table-wrapper {
                        overflow: visible !important;
                        border: 1.5px solid #334155 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        display: block !important;
                        margin: 0 !important;
                        box-sizing: border-box !important;
                    }

                    table {
                        width: 100% !important;
                        max-width: 100% !important;
                        table-layout: auto !important;
                        border-collapse: collapse !important;
                        border: 1.5px solid #334155 !important;
                        font-size: 7.5pt !important;
                        page-break-inside: auto !important;
                        break-inside: auto !important;
                    }

                    thead {
                        display: table-header-group !important;
                    }

                    tfoot {
                        display: table-footer-group !important;
                    }

                    tr {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }

                    td,
                    th {
                        min-width: 0 !important;
                        word-break: break-word !important;
                        padding: 2.5px 3.5px !important;
                        border: 1px solid #475569 !important;
                        color: #0f172a !important;
                        box-sizing: border-box !important;
                    }

                    th {
                        font-weight: 700 !important;
                        border-bottom: 2px solid #1e293b !important;
                    }

                    .award-summary-box {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        margin-top: 14px !important;
                        padding: 12px !important;
                        background: #f8fafc !important;
                        border: 1.5px solid #334155 !important;
                    }

                    .signatories-box {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        margin-top: 28px !important;
                        padding-top: 20px !important;
                        border-top: 2px solid #334155 !important;
                    }

                    .signature-clearance {
                        height: 72px !important;
                        min-height: 72px !important;
                        width: 100% !important;
                        display: flex !important;
                        align-items: flex-end !important;
                        justify-content: center !important;
                    }

                    .signature-line {
                        border-bottom: 1.5px solid #0f172a !important;
                        width: 190px !important;
                        margin-bottom: 6px !important;
                    }
                }
            `}</style>

            <CardHeader className="py-4 px-5 border-b bg-muted/20 print:hidden flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                        <span className="text-base">🖨️</span> Abstract of bids
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                        Print or Save as PDF in A4 Landscape. Edit signatories in Setup.
                    </CardDescription>
                </div>
                {onPrint && (
                    <Button
                        size="sm"
                        onClick={onPrint}
                        className="gap-1.5 text-xs h-8 bg-primary text-primary-foreground font-semibold shadow-xs"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        Print Document
                    </Button>
                )}
            </CardHeader>

            <CardContent className="p-4 sm:p-6 space-y-6 print:p-0">
                {/* Document Header */}
                <div className="text-center space-y-1 pb-3 border-b">
                    <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-foreground">
                        ABSTRACT OF BIDS
                    </h1>
                    <h2 className="text-sm font-semibold text-muted-foreground">
                        {currentProject.rfqTitle || "Procurement Canvass Project"}
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground font-mono pt-2 border-t mt-2 text-left">
                        <div>
                            <strong className="text-foreground">Reference:</strong> {currentProject.rfqReference || "—"}
                        </div>
                        <div>
                            <strong className="text-foreground">Date:</strong>{" "}
                            {currentProject.targetDate
                                ? new Date(currentProject.targetDate).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
                                : currentProject.createdAt
                                ? new Date(currentProject.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
                                : new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })}
                        </div>
                        <div>
                            <strong className="text-foreground">Currency:</strong> {compCurr} (landed, incl. VAT, duty, freight, fees)
                        </div>
                        <div className="text-right">
                            <strong className="text-foreground">Status:</strong>{" "}
                            <span className="uppercase font-bold text-foreground border border-border px-1.5 py-0.5 rounded-xs">
                                {currentProject.status || "DRAFT"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. Section 1: Item Quotations & Landed Cost Waterfall Matrix */}
            <div className="abstract-section space-y-2">
                <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                        1. Commercial Bid Quotations &amp; Landed Cost Breakdown
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                        {items.length} requested item(s) · {bids.length} supplier bid(s)
                    </span>
                </div>

                <div className="abstract-table-wrapper border border-slate-300 rounded-sm overflow-x-auto print:overflow-visible print:w-full print:block">
                    <table className="w-full text-[11px] text-left border-collapse">
                        <thead className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                            {/* Header Row 1: Supplier Identity */}
                            <tr>
                                <th rowSpan={2} className="py-2 px-2 w-8 text-center border-r border-slate-300 bg-slate-100">
                                    #
                                </th>
                                <th rowSpan={2} className="py-2 px-3 min-w-[180px] border-r border-slate-300 bg-slate-100">
                                    ITEM &amp; SPECIFICATIONS
                                </th>
                                <th rowSpan={2} className="py-2 px-2 w-20 border-r border-slate-300 bg-slate-100">
                                    QTY / UOM
                                </th>
                                {bids.map((bid) => (
                                    <th
                                        key={bid.id}
                                        colSpan={2}
                                        className="py-1.5 px-2 text-center border-r border-slate-300 last:border-r-0 bg-slate-100"
                                    >
                                        <span className="font-bold text-xs uppercase block text-slate-900 truncate">
                                            {bid.supplierName}
                                        </span>
                                        <span className="text-[10px] font-normal text-slate-500 font-mono block">
                                            {bid.supplierType} · {bid.country} · {bid.incoterm}
                                        </span>
                                    </th>
                                ))}
                            </tr>

                            {/* Header Row 2: Quoted Unit & Landed Total Sub-columns */}
                            <tr className="border-t border-slate-200 text-[10px] text-slate-600 bg-slate-50">
                                {bids.map((bid) => (
                                    <React.Fragment key={`sub-${bid.id}`}>
                                        <th className="py-1 px-2 text-right border-r border-slate-200 font-semibold">
                                            QUOTED UNIT
                                        </th>
                                        <th className="py-1 px-2 text-right border-r border-slate-300 last:border-r-0 font-bold text-slate-800">
                                            LANDED TOTAL ({compCurr})
                                        </th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200">
                            {/* Item Rows */}
                            {items.map((item, idx) => (
                                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="py-1.5 px-2 text-center text-slate-500 font-mono border-r border-slate-200">
                                        {idx + 1}
                                    </td>
                                    <td className="py-1.5 px-3 border-r border-slate-200">
                                        <span className="font-semibold block text-slate-900">{item.itemName}</span>
                                        {item.specifications && (
                                            <span className="text-[10px] text-slate-500 block truncate max-w-xs">
                                                {item.specifications}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-1.5 px-2 font-mono border-r border-slate-200 whitespace-nowrap">
                                        {item.quantity.toLocaleString()} {item.uom}
                                    </td>

                                    {bids.map((bid) => {
                                        const res = summary.results[bid.id];
                                        const breakdown = res?.items[item.id];
                                        const isAwarded = awards.some(
                                            (a) => a.rfqItemId === item.id && a.rfqBidId === bid.id
                                        );

                                        if (!breakdown || !breakdown.hasQuote) {
                                            return (
                                                <td
                                                    key={`cell-${bid.id}-${item.id}`}
                                                    colSpan={2}
                                                    className="py-1.5 px-2 text-center text-slate-400 italic border-r border-slate-300 last:border-r-0 font-mono text-[11px]"
                                                >
                                                    No bid
                                                </td>
                                            );
                                        }

                                        return (
                                            <React.Fragment key={`cell-${bid.id}-${item.id}`}>
                                                <td
                                                    className={cn(
                                                        "py-1.5 px-2 text-right font-mono border-r border-slate-200 text-xs",
                                                        isAwarded && "bg-emerald-50 dark:bg-emerald-950/20 font-semibold text-emerald-950"
                                                    )}
                                                >
                                                    <div>
                                                        {bid.quoteCurrency}{" "}
                                                        {breakdown.appliedUnitPriceForeign.toLocaleString(undefined, {
                                                            minimumFractionDigits: 3,
                                                            maximumFractionDigits: 3,
                                                        })}
                                                    </div>
                                                    {breakdown.discountPct > 0 && (
                                                        <div className="text-[9px] text-slate-500">
                                                            less {breakdown.discountPct}%
                                                        </div>
                                                    )}
                                                </td>
                                                <td
                                                    className={cn(
                                                        "py-1.5 px-2 text-right font-mono border-r border-slate-300 last:border-r-0 text-xs",
                                                        isAwarded
                                                            ? "bg-emerald-50 dark:bg-emerald-950/20 font-bold text-emerald-950"
                                                            : "font-semibold text-slate-800"
                                                    )}
                                                >
                                                    {breakdown.totalLandedCompCurr.toLocaleString(undefined, {
                                                        minimumFractionDigits: 3,
                                                        maximumFractionDigits: 3,
                                                    })}
                                                    {isAwarded && " ✓"}
                                                </td>
                                            </React.Fragment>
                                        );
                                    })}
                                </tr>
                            ))}

                            {/* COST WATERFALL ROWS */}
                            {/* 1. Goods after discount */}
                            <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                                <td colSpan={3} className="py-1.5 px-3 text-slate-800 border-r border-slate-300">
                                    Goods after discount
                                </td>
                                {bids.map((bid) => (
                                    <td
                                        key={`goods-${bid.id}`}
                                        colSpan={2}
                                        className="py-1.5 px-3 text-right font-mono border-r border-slate-300 last:border-r-0 text-slate-900"
                                    >
                                        {summary.results[bid.id]?.goodsAfterDiscountCompCurr
                                            ? summary.results[bid.id].goodsAfterDiscountCompCurr.toLocaleString(undefined, {
                                                  minimumFractionDigits: 3,
                                                  maximumFractionDigits: 3,
                                              })
                                            : "0.000"}
                                    </td>
                                ))}
                            </tr>

                            {/* 2. Freight & Insurance */}
                            <tr>
                                <td colSpan={3} className="py-1 px-3 text-slate-600 border-r border-slate-200">
                                    Freight &amp; insurance
                                </td>
                                {bids.map((bid) => {
                                    const r = summary.results[bid.id];
                                    const sum = r ? r.freightCompCurr + r.insuranceCompCurr : 0;
                                    return (
                                        <td
                                            key={`freight-${bid.id}`}
                                            colSpan={2}
                                            className="py-1 px-3 text-right font-mono text-slate-600 border-r border-slate-300 last:border-r-0"
                                        >
                                            {sum.toLocaleString(undefined, {
                                                minimumFractionDigits: 3,
                                                maximumFractionDigits: 3,
                                            })}
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* 3. Duty */}
                            <tr>
                                <td colSpan={3} className="py-1 px-3 text-slate-600 border-r border-slate-200">
                                    Customs Import Duty
                                </td>
                                {bids.map((bid) => (
                                    <td
                                        key={`duty-${bid.id}`}
                                        colSpan={2}
                                        className="py-1 px-3 text-right font-mono text-slate-600 border-r border-slate-300 last:border-r-0"
                                    >
                                        {(summary.results[bid.id]?.dutyCompCurr || 0).toLocaleString(undefined, {
                                            minimumFractionDigits: 3,
                                            maximumFractionDigits: 3,
                                        })}
                                    </td>
                                ))}
                            </tr>

                            {/* 4. VAT */}
                            <tr>
                                <td colSpan={3} className="py-1 px-3 text-slate-600 border-r border-slate-200">
                                    VAT (Landed Base)
                                </td>
                                {bids.map((bid) => (
                                    <td
                                        key={`vat-${bid.id}`}
                                        colSpan={2}
                                        className="py-1 px-3 text-right font-mono text-slate-600 border-r border-slate-300 last:border-r-0"
                                    >
                                        {(summary.results[bid.id]?.vatCompCurr || 0).toLocaleString(undefined, {
                                            minimumFractionDigits: 3,
                                            maximumFractionDigits: 3,
                                        })}
                                    </td>
                                ))}
                            </tr>

                            {/* 5. Brokerage, customs, inland & bank fees */}
                            <tr>
                                <td colSpan={3} className="py-1 px-3 text-slate-600 border-r border-slate-200">
                                    Brokerage, customs, inland &amp; bank fees
                                </td>
                                {bids.map((bid) => {
                                    const r = summary.results[bid.id];
                                    const sum = r
                                        ? r.customsAndPortTotalCompCurr + r.inlandTruckingCompCurr + r.bankFeesCompCurr
                                        : 0;
                                    return (
                                        <td
                                            key={`fees-${bid.id}`}
                                            colSpan={2}
                                            className="py-1 px-3 text-right font-mono text-slate-600 border-r border-slate-300 last:border-r-0"
                                        >
                                            {sum.toLocaleString(undefined, {
                                                minimumFractionDigits: 3,
                                                maximumFractionDigits: 3,
                                            })}
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* 6. FX buffer & payment terms */}
                            <tr>
                                <td colSpan={3} className="py-1 px-3 text-slate-600 border-r border-slate-200">
                                    FX buffer &amp; financing terms cost/(savings)
                                </td>
                                {bids.map((bid) => {
                                    const r = summary.results[bid.id];
                                    const net = r
                                        ? r.fxBufferCompCurr + r.paymentTermsCostCompCurr - r.earlyPayDiscountAmountCompCurr
                                        : 0;
                                    return (
                                        <td
                                            key={`fxterms-${bid.id}`}
                                            colSpan={2}
                                            className="py-1 px-3 text-right font-mono text-slate-600 border-r border-slate-300 last:border-r-0"
                                        >
                                            {net.toLocaleString(undefined, {
                                                minimumFractionDigits: 3,
                                                maximumFractionDigits: 3,
                                            })}
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* 7. TOTAL LANDED COST (Bold highlighted row) */}
                            <tr className="bg-slate-200 font-bold border-t-2 border-b-2 border-slate-400 text-slate-900">
                                <td colSpan={3} className="py-2 px-3 uppercase tracking-wider text-xs border-r border-slate-400">
                                    TOTAL LANDED COST
                                </td>
                                {bids.map((bid) => {
                                    const r = summary.results[bid.id];
                                    return (
                                        <td
                                            key={`totallanded-${bid.id}`}
                                            colSpan={2}
                                            className="py-2 px-3 text-right font-mono text-xs border-r border-slate-400 last:border-r-0"
                                        >
                                            {r
                                                ? r.totalLandedCostCompCurr.toLocaleString(undefined, {
                                                      minimumFractionDigits: 3,
                                                      maximumFractionDigits: 3,
                                                  })
                                                : "0.000"}
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* COMMERCIAL TERMS */}
                            <tr className="bg-slate-50/60 font-medium">
                                <td colSpan={3} className="py-1 px-3 text-slate-700 border-r border-slate-200">
                                    Payment terms
                                </td>
                                {bids.map((bid) => (
                                    <td
                                        key={`terms-${bid.id}`}
                                        colSpan={2}
                                        className="py-1 px-3 text-right font-mono text-[11px] text-slate-600 border-r border-slate-300 last:border-r-0"
                                    >
                                        {bid.downPaymentPct > 0
                                            ? `${bid.downPaymentPct}% down, net ${bid.balanceDueDays} days`
                                            : `net ${bid.balanceDueDays} days`}
                                    </td>
                                ))}
                            </tr>

                            <tr className="bg-slate-50/60 font-medium">
                                <td colSpan={3} className="py-1 px-3 text-slate-700 border-r border-slate-200">
                                    Lead time
                                </td>
                                {bids.map((bid) => (
                                    <td
                                        key={`lead-${bid.id}`}
                                        colSpan={2}
                                        className="py-1 px-3 text-right font-mono text-[11px] text-slate-600 border-r border-slate-300 last:border-r-0"
                                    >
                                        {bid.leadTimeDays} days
                                    </td>
                                ))}
                            </tr>

                            <tr className="bg-slate-50/60 font-medium">
                                <td colSpan={3} className="py-1 px-3 text-slate-700 border-r border-slate-200">
                                    Quote validity
                                </td>
                                {bids.map((bid) => (
                                    <td
                                        key={`validity-${bid.id}`}
                                        colSpan={2}
                                        className="py-1 px-3 text-right font-mono text-[11px] text-slate-600 border-r border-slate-300 last:border-r-0"
                                    >
                                        {bid.validUntil || "—"}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 3. Section 2: Technical Quality & Compliance Evaluation Matrix */}
            {/* Marked with abstract-section-avoid-break to never awkwardly break across sheets mid-section */}
            <div className="abstract-section-avoid-break space-y-2 pt-2">
                <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-900">
                        2. Technical Quality, Specifications &amp; Compliance Evaluation
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                        Pass/Fail Mandatory Checks &amp; Weighted Quality Score
                    </span>
                </div>

                <div className="abstract-table-wrapper border border-slate-300 rounded-sm overflow-x-auto print:overflow-visible print:w-full print:block">
                    <table className="w-full text-[11px] text-left border-collapse">
                        <thead className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                            <tr>
                                <th className="py-1.5 px-2 w-8 text-center border-r border-slate-300 bg-slate-100">
                                    #
                                </th>
                                <th className="py-1.5 px-3 min-w-[180px] border-r border-slate-300 bg-slate-100">
                                    CRITERIA / MANDATORY REQUIREMENT
                                </th>
                                <th className="py-1.5 px-2 w-20 border-r border-slate-300 bg-slate-100">
                                    WEIGHT / TYPE
                                </th>
                                {bids.map((bid) => (
                                    <th
                                        key={`th-q-${bid.id}`}
                                        colSpan={2}
                                        className="py-1.5 px-2 text-center border-r border-slate-300 last:border-r-0 bg-slate-100"
                                    >
                                        <span className="font-bold text-xs uppercase block text-slate-900 truncate">
                                            {bid.supplierName}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200">
                            {/* Mandatory Pass/Fail Requirements */}
                            {(currentProject.qualityCriteria || [])
                                .filter((c) => c.criterionType === "PASS_FAIL")
                                .map((crit, idx) => (
                                    <tr key={`crit-pf-${crit.id}`} className="bg-white">
                                        <td className="py-1 px-2 text-center text-slate-500 font-mono border-r border-slate-200">
                                            P{idx + 1}
                                        </td>
                                        <td className="py-1 px-3 text-slate-800 border-r border-slate-200 font-medium">
                                            {crit.criterionName}
                                        </td>
                                        <td className="py-1 px-2 text-slate-500 font-mono text-[10px] border-r border-slate-200 whitespace-nowrap">
                                            Pass/Fail
                                        </td>
                                        {bids.map((bid) => {
                                            const scoreObj = bid.scores?.[crit.id];
                                            const pf = scoreObj?.passFailResult;
                                            return (
                                                <td
                                                    key={`score-pf-${bid.id}-${crit.id}`}
                                                    colSpan={2}
                                                    className="py-1 px-2 text-center font-mono text-[11px] border-r border-slate-300 last:border-r-0"
                                                >
                                                    {pf === "PASS" ? (
                                                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-xs border border-emerald-200">
                                                            PASS
                                                        </span>
                                                    ) : pf === "FAIL" ? (
                                                        <span className="font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-xs border border-rose-200">
                                                            FAIL
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400">Not checked</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}

                            {/* Scored Quality Criteria */}
                            {(currentProject.qualityCriteria || [])
                                .filter((c) => c.criterionType === "SCORED")
                                .map((crit, idx) => (
                                    <tr key={`crit-sc-${crit.id}`} className="bg-white">
                                        <td className="py-1 px-2 text-center text-slate-500 font-mono border-r border-slate-200">
                                            Q{idx + 1}
                                        </td>
                                        <td className="py-1 px-3 text-slate-800 border-r border-slate-200">
                                            {crit.criterionName}
                                        </td>
                                        <td className="py-1 px-2 text-slate-500 font-mono text-[10px] border-r border-slate-200 whitespace-nowrap">
                                            {crit.weightPct}% weight
                                        </td>
                                        {bids.map((bid) => {
                                            const scoreObj = bid.scores?.[crit.id];
                                            const sc = scoreObj?.score;
                                            return (
                                                <td
                                                    key={`score-sc-${bid.id}-${crit.id}`}
                                                    colSpan={2}
                                                    className="py-1 px-2 text-center font-mono text-[11px] border-r border-slate-300 last:border-r-0 text-slate-700"
                                                >
                                                    {typeof sc === "number" && sc >= 1 ? `${sc} / 5` : "—"}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}

                            {/* QUALITY SCORE Row */}
                            <tr className="bg-slate-100 font-bold border-t border-b border-slate-300 text-slate-900">
                                <td colSpan={3} className="py-1.5 px-3 uppercase tracking-wider text-xs border-r border-slate-300">
                                    TOTAL QUALITY SCORE
                                </td>
                                {bids.map((bid) => {
                                    const r = summary.results[bid.id];
                                    return (
                                        <td
                                            key={`qscore-${bid.id}`}
                                            colSpan={2}
                                            className="py-1.5 px-2 text-center font-mono text-xs border-r border-slate-300 last:border-r-0 font-bold"
                                        >
                                            {r?.isDisqualified ? (
                                                <span className="text-rose-700">DISQUALIFIED</span>
                                            ) : (
                                                <span className="text-slate-900">{r?.qualityScore ?? 0} / 100</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* Quotation Reference Row */}
                            <tr className="bg-white">
                                <td colSpan={3} className="py-1 px-3 text-slate-700 border-r border-slate-200 font-medium">
                                    Quotation ref.
                                </td>
                                {bids.map((bid) => (
                                    <td
                                        key={`qref-${bid.id}`}
                                        colSpan={2}
                                        className="py-1 px-2 text-center font-mono text-[11px] text-slate-600 border-r border-slate-300 last:border-r-0"
                                    >
                                        {bid.quotationRef || "—"}
                                    </td>
                                ))}
                            </tr>

                            {/* Remarks Row */}
                            <tr className="bg-white">
                                <td colSpan={3} className="py-1 px-3 text-slate-700 border-r border-slate-200 font-medium">
                                    Remarks / Notes
                                </td>
                                {bids.map((bid) => (
                                    <td
                                        key={`remarks-${bid.id}`}
                                        colSpan={2}
                                        className="py-1 px-2 text-center text-[10px] text-slate-600 border-r border-slate-300 last:border-r-0 truncate max-w-xs"
                                    >
                                        {bid.notes || "—"}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 4. Section 3: Award Recommendation & Justification */}
            <div className="award-summary-box border border-slate-300 rounded-sm p-4 bg-slate-50/60 space-y-3">
                <div className="space-y-1.5">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-900 block border-b border-slate-200 pb-1">
                        3. Award Recommendation &amp; Summary
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-800 font-mono">
                        {items.map((item) => {
                            const award = awards.find((a) => a.rfqItemId === item.id);
                            const supplier = bids.find((b) => b.id === award?.rfqBidId);
                            return (
                                <li key={item.id} className="text-slate-800">
                                    <span className="font-semibold text-slate-900">{item.itemName}</span>
                                    {" — "}
                                    {supplier ? (
                                        <span>
                                            {supplier.supplierName} · {compCurr}{" "}
                                            {award?.awardedLandedTotal.toLocaleString(undefined, {
                                                minimumFractionDigits: 3,
                                                maximumFractionDigits: 3,
                                            })}
                                        </span>
                                    ) : (
                                        <span className="text-slate-400 italic">Not awarded</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs font-mono">
                    <div>
                        <strong>Total award amount:</strong> {compCurr}{" "}
                        {awardTotalLanded.toLocaleString(undefined, {
                            minimumFractionDigits: 3,
                            maximumFractionDigits: 3,
                        })}
                        <span className="ml-4 text-slate-600">
                            <strong>Budget:</strong>{" "}
                            {currentProject.budget
                                ? `${compCurr} ${currentProject.budget.toLocaleString(undefined, {
                                      minimumFractionDigits: 3,
                                      maximumFractionDigits: 3,
                                  })}`
                                : "—"}
                        </span>
                        {budgetVariance !== null && (
                            <span
                                className={cn(
                                    "ml-3 font-semibold",
                                    budgetVariance <= 0 ? "text-emerald-700" : "text-rose-700"
                                )}
                            >
                                ({budgetVariance <= 0 ? "Under budget by " : "Over budget by "}
                                {compCurr} {Math.abs(budgetVariance).toLocaleString(undefined, {
                                    minimumFractionDigits: 3,
                                    maximumFractionDigits: 3,
                                })})
                            </span>
                        )}
                    </div>
                </div>

                <div className="text-xs text-slate-700">
                    <strong>Justification:</strong> {currentProject.justification || "Evaluated based on lowest calculated total landed cost and compliance with technical quality specifications."}
                </div>

                <div className="text-[10px] text-slate-500 font-mono border-t border-slate-200 pt-2">
                    Exchange rates used:{" "}
                    {currentProject.exchangeRates
                        ?.map((r) => `1 ${r.currencyCode} = ${r.rateToComparison} ${compCurr}`)
                        .join("; ") || "—"}
                    . FX risk buffer {currentProject.fxRiskBufferPct}%. Cost of money{" "}
                    {currentProject.costOfMoneyPctPerYear}%/yr.
                </div>
            </div>

            {/* 5. Section 4: Three Signatures Block */}
                <div className="signatories-box grid grid-cols-3 gap-6 pt-8 mt-6 border-t-2 border-slate-700 dark:border-slate-300 text-center">
                    <div className="flex flex-col items-center">
                        <div className="signature-clearance h-20 w-full flex items-end justify-center">
                            <div className="signature-line border-b-2 border-slate-900 dark:border-slate-100 w-48 mb-2" />
                        </div>
                        <div>
                            <span className="text-xs font-bold block text-foreground uppercase tracking-wide">
                                PREPARED BY
                            </span>
                            <span className="text-xs block text-foreground font-semibold mt-0.5">
                                {currentProject.preparedBy || "—"}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">
                                {currentProject.preparedByTitle || "Procurement Officer"}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="signature-clearance h-20 w-full flex items-end justify-center">
                            <div className="signature-line border-b-2 border-slate-900 dark:border-slate-100 w-48 mb-2" />
                        </div>
                        <div>
                            <span className="text-xs font-bold block text-foreground uppercase tracking-wide">
                                REVIEWED BY
                            </span>
                            <span className="text-xs block text-foreground font-semibold mt-0.5">
                                {currentProject.reviewedBy || "—"}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">
                                {currentProject.reviewedByTitle || "BAC Reviewer"}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="signature-clearance h-20 w-full flex items-end justify-center">
                            <div className="signature-line border-b-2 border-slate-900 dark:border-slate-100 w-48 mb-2" />
                        </div>
                        <div>
                            <span className="text-xs font-bold block text-foreground uppercase tracking-wide">
                                APPROVED BY
                            </span>
                            <span className="text-xs block text-foreground font-semibold mt-0.5">
                                {currentProject.approvedBy || "—"}
                            </span>
                            <span className="text-[10px] text-muted-foreground block">
                                {currentProject.approvedByTitle || "Approving Authority"}
                            </span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
