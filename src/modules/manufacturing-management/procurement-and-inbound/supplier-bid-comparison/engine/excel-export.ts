import { saveAs } from "file-saver";
import { RfqProject } from "../types";
import { evaluateAndCompareSuppliers } from "./scoring-engine";

/**
 * Generates and downloads the official two-sheet Excel workbook (.xlsx):
 * 1. "Comparison" sheet: item quotes, landed cost breakdown, quality scores, overall scores.
 * 2. "Award" sheet: awarded items, winning supplier, landed cost, budget & target variance, justification.
 */
export async function exportRfqToExcel(project: RfqProject): Promise<void> {
    const ExcelJS = (await import("exceljs")).default;
    const summary = evaluateAndCompareSuppliers(project);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VOS ERP - Supplier Bid Comparison";
    workbook.created = new Date();

    // -------------------------------------------------------------------------
    // SHEET 1: Comparison
    // -------------------------------------------------------------------------
    const compSheet = workbook.addWorksheet("Bid Comparison", {
        views: [{ showGridLines: true }],
    });

    // Title & Header Block
    compSheet.addRow(["SUPPLIER BID COMPARISON - ABSTRACT & EVALUATION"]).font = {
        size: 14,
        bold: true,
    };
    compSheet.addRow([`Project / RFQ: ${project.rfqTitle || "Untitled"}`]);
    compSheet.addRow([`Reference No: ${project.rfqReference || "-"} | Currency: ${project.comparisonCurrency || "PHP"}`]);
    compSheet.addRow([`Status: ${project.status} | Date: ${new Date().toLocaleDateString()}`]);
    compSheet.addRow([]);

    // Table Header
    const supplierHeaders = project.bids.map((b) => `${b.supplierName} (${b.quoteCurrency})`);
    const headerRow = compSheet.addRow([
        "#",
        "Item Name",
        "Specifications",
        "Qty",
        "UOM",
        "Target Unit Price",
        ...supplierHeaders.flatMap((sh) => [`${sh} Quoted`, `${sh} Disc %`, `${sh} Landed Unit`]),
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
    };

    // Item rows
    project.items.forEach((item, idx) => {
        const rowVals: (string | number)[] = [
            idx + 1,
            item.itemName,
            item.specifications || "-",
            item.quantity,
            item.uom,
            item.targetUnitPrice,
        ];

        for (const bid of project.bids) {
            const res = summary.results[bid.id];
            const breakdown = res?.items[item.id];
            if (breakdown && breakdown.hasQuote) {
                rowVals.push(
                    breakdown.quotedUnitPrice,
                    `${breakdown.discountPct}%`,
                    breakdown.landedUnitCostCompCurr
                );
            } else {
                rowVals.push("-", "-", "-");
            }
        }
        compSheet.addRow(rowVals);
    });

    // Cost Breakdown Section
    compSheet.addRow([]);
    const breakdownTitle = compSheet.addRow(["TOTAL LANDED COST BREAKDOWN (" + (project.comparisonCurrency || "PHP") + ")"]);
    breakdownTitle.font = { bold: true };

    const costLines: { label: string; key: string }[] = [
        { label: "Goods (after discount)", key: "goodsAfterDiscountCompCurr" },
        { label: "Freight", key: "freightCompCurr" },
        { label: "Insurance", key: "insuranceCompCurr" },
        { label: "CIF Dutiable Value", key: "cifDutiableValueCompCurr" },
        { label: "FX Risk Buffer", key: "fxBufferCompCurr" },
        { label: "Import Duty", key: "dutyCompCurr" },
        { label: "Customs, Port & Security Fees", key: "customsAndPortTotalCompCurr" },
        { label: "Import / Local VAT", key: "vatCompCurr" },
        { label: "Inland Trucking", key: "inlandTruckingCompCurr" },
        { label: "Bank Fees", key: "bankFeesCompCurr" },
        { label: "Payment Terms Net Cost", key: "paymentTermsCostCompCurr" },
        { label: "TOTAL LANDED COST", key: "totalLandedCostCompCurr" },
        { label: "Quality Score (0-100)", key: "qualityScore" },
        { label: "Price Score (0-100)", key: "priceScore" },
        { label: "Lead Time Score (0-100)", key: "leadTimeScore" },
        { label: "OVERALL SCORE (0-100)", key: "overallScore" },
        { label: "Rank", key: "ranking" },
    ];

    for (const cl of costLines) {
        const lineVals: (string | number)[] = ["", cl.label, "", "", "", ""];
        for (const bid of project.bids) {
            const res = summary.results[bid.id];
            const val = (res as any)?.[cl.key] ?? "-";
            lineVals.push(val, "", "");
        }
        const row = compSheet.addRow(lineVals);
        if (cl.label === "TOTAL LANDED COST" || cl.label === "OVERALL SCORE") {
            row.font = { bold: true };
            row.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF1F5F9" },
            };
        }
    }

    compSheet.columns.forEach((col) => {
        col.width = 18;
    });

    // -------------------------------------------------------------------------
    // SHEET 2: Award & Approval
    // -------------------------------------------------------------------------
    const awardSheet = workbook.addWorksheet("Award & Approval", {
        views: [{ showGridLines: true }],
    });

    awardSheet.addRow(["AWARD ALLOCATION & EXECUTIVE APPROVAL"]).font = {
        size: 14,
        bold: true,
    };
    awardSheet.addRow([`Reference No: ${project.rfqReference || "-"} | Status: ${project.status}`]);
    awardSheet.addRow([]);

    const awardHeader = awardSheet.addRow([
        "#",
        "Item Name",
        "Quantity",
        "UOM",
        "Awarded Supplier",
        "Landed Unit Cost (" + project.comparisonCurrency + ")",
        "Landed Total (" + project.comparisonCurrency + ")",
        "Target Unit Price",
        "Target Total",
        "Variance vs Target",
    ]);
    awardHeader.font = { bold: true };
    awardHeader.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
    };

    let totalAwardLanded = 0;
    let totalTarget = 0;

    project.items.forEach((item, idx) => {
        const award = project.awards?.find((a) => a.rfqItemId === item.id);
        const awardedBid = award ? project.bids.find((b) => b.id === award.rfqBidId) : null;
        const awardedSupplier = awardedBid?.supplierName || "Unawarded";

        const landedUnit = award?.awardedLandedUnitCost || 0;
        const landedTotal = award?.awardedLandedTotal || 0;
        const targetTotal = item.quantity * item.targetUnitPrice;
        const variance = landedTotal - targetTotal;

        totalAwardLanded += landedTotal;
        totalTarget += targetTotal;

        awardSheet.addRow([
            idx + 1,
            item.itemName,
            item.quantity,
            item.uom,
            awardedSupplier,
            landedUnit > 0 ? landedUnit : "-",
            landedTotal > 0 ? landedTotal : "-",
            item.targetUnitPrice,
            targetTotal,
            variance !== 0 ? variance : "-",
        ]);
    });

    // Summary Totals
    awardSheet.addRow([]);
    const totalRow = awardSheet.addRow([
        "",
        "TOTAL AWARDED AMOUNT",
        "",
        "",
        "",
        "",
        totalAwardLanded,
        "",
        totalTarget,
        totalAwardLanded - totalTarget,
    ]);
    totalRow.font = { bold: true };

    if (project.budget) {
        const budgetVariance = totalAwardLanded - project.budget;
        awardSheet.addRow([
            "",
            "APPROVED BUDGET",
            "",
            "",
            "",
            "",
            project.budget,
            "",
            budgetVariance > 0 ? `Over budget by ${budgetVariance}` : `Under budget by ${Math.abs(budgetVariance)}`,
        ]).font = { bold: true };
    }

    awardSheet.addRow([]);
    awardSheet.addRow(["JUSTIFICATION / REASON FOR AWARD:"]).font = { bold: true };
    awardSheet.addRow([project.justification || "No justification recorded."]);

    awardSheet.addRow([]);
    awardSheet.addRow(["SIGNATORIES:"]).font = { bold: true };
    awardSheet.addRow([
        `Prepared by: ${project.preparedBy || "-"} (${project.preparedByTitle || "Procurement"})`,
        `Reviewed by: ${project.reviewedBy || "-"} (${project.reviewedByTitle || "Reviewer"})`,
        `Approved by: ${project.approvedBy || "-"} (${project.approvedByTitle || "Approver"})`,
    ]);

    awardSheet.columns.forEach((col) => {
        col.width = 20;
    });

    // -------------------------------------------------------------------------
    // SHEET 3: Bids & Quotations (Canonical Import/Export Data)
    // -------------------------------------------------------------------------
    const bidsSheet = workbook.addWorksheet("Bids & Quotations", {
        views: [{ showGridLines: true }],
    });

    const bidsHeaderRow = bidsSheet.addRow([...BIDS_CANONICAL_COLUMNS]);
    bidsHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    bidsHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" }, // Slate-800
    };

    const bidsRows = buildBidsDataRows(project);
    bidsRows.forEach((r) => {
        bidsSheet.addRow(r);
    });

    bidsSheet.columns.forEach((col, idx) => {
        const headerText = BIDS_CANONICAL_COLUMNS[idx] || "";
        col.width = Math.max(headerText.length + 4, 12);
    });

    // Save and Trigger Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `${project.rfqReference || "RFQ"}-Supplier-Bid-Comparison.xlsx`);
}

export const BIDS_CANONICAL_COLUMNS = [
    "Supplier",
    "Type",
    "Country",
    "Currency",
    "Incoterm",
    "Item",
    "Qty",
    "HS Code",
    "Item Duty %",
    "Kg/Unit",
    "CBM/Unit",
    "Unit Price",
    "Min Qty",
    "Discount %",
    "Freight Basis",
    "Freight",
    "Freight Min",
    "Freight Currency",
    "Insurance Basis",
    "Insurance",
    "FTA",
    "FTA Duty %",
    "VAT %",
    "Prices incl VAT",
    "Brokerage",
    "Customs",
    "Inland",
    "Bank Fee",
    "Shipment Type",
    "Containers 20ft",
    "Containers 40ft",
    "Shipments",
    "Paid by LC",
    "Lead Days",
    "Down %",
    "Net Days",
    "Early Pay %",
    "Early Pay Days",
    "Valid Until",
    "Quality",
    "Notes",
] as const;

/**
 * Builds the canonical 42-column tabular rows representation of bids and quotations.
 * Fully compatible with the import parser.
 */
export function buildBidsDataRows(project: RfqProject): (string | number)[][] {
    const rows: (string | number)[][] = [];

    // If project has no bids yet, export requested items with empty supplier fields for vendor RFQ dispatch
    if (!project.bids || project.bids.length === 0) {
        (project.items || []).forEach((item) => {
            rows.push([
                "", // Supplier
                "Local", // Type
                "PH", // Country
                project.comparisonCurrency || "PHP", // Currency
                "DDP", // Incoterm
                item.itemName,
                item.quantity,
                item.hsCode || "",
                item.dutyPct || 0,
                item.weightPerUnitKg || 0,
                item.cbmPerUnit || 0,
                item.targetUnitPrice || 0,
                1, // Min Qty
                0, // Discount %
                "LUMP_SUM", // Freight Basis
                0, // Freight
                0, // Freight Min
                project.comparisonCurrency || "PHP",
                "PCT_GOODS_AND_FREIGHT",
                0.3,
                "", // FTA
                0, // FTA Duty %
                project.defaultVatPct ?? 12,
                "No", // Prices incl VAT
                0, // Brokerage
                0, // Customs
                0, // Inland
                0, // Bank Fee
                "AUTO", // Shipment Type
                0, // Containers 20ft
                0, // Containers 40ft
                1, // Shipments
                "No", // Paid by LC
                14, // Lead Days
                0, // Down %
                30, // Net Days
                0, // Early Pay %
                0, // Early Pay Days
                "", // Valid Until
                5, // Quality
                "", // Notes
            ]);
        });
        return rows;
    }

    project.bids.forEach((bid) => {
        // Compute average scored quality rating (1-5 scale)
        const scoredEntries = Object.values(bid.scores || {})
            .map((s) => s.score)
            .filter((s): s is number => s !== null && s > 0);
        const avgQuality = scoredEntries.length > 0
            ? Number((scoredEntries.reduce((a, b) => a + b, 0) / scoredEntries.length).toFixed(1))
            : 5;

        (project.items || []).forEach((item) => {
            const quote = bid.quotations?.[item.id];
            const priceBreaks = quote?.priceBreaks && quote.priceBreaks.length > 0
                ? quote.priceBreaks
                : [{ minQuantity: 1, unitPrice: 0 }];

            priceBreaks.forEach((pb) => {
                rows.push([
                    bid.supplierName,
                    bid.supplierType === "LOCAL" ? "Local" : "International",
                    bid.country || (bid.supplierType === "LOCAL" ? "PH" : "CN"),
                    bid.quoteCurrency || "PHP",
                    bid.incoterm || "DDP",
                    item.itemName,
                    item.quantity,
                    item.hsCode || "",
                    item.dutyPct || 0,
                    item.weightPerUnitKg || 0,
                    item.cbmPerUnit || 0,
                    pb.unitPrice || 0,
                    pb.minQuantity || 1,
                    quote?.discountPct || 0,
                    bid.freightBasis || "LUMP_SUM",
                    bid.freightRate || 0,
                    bid.freightMinimum || 0,
                    bid.freightCurrency || bid.quoteCurrency || "USD",
                    bid.insuranceBasis || "PCT_GOODS_AND_FREIGHT",
                    bid.insuranceRateOrAmount ?? 0.3,
                    bid.ftaAgreementName || "",
                    bid.ftaDutyPct || 0,
                    bid.vatPct ?? 12,
                    bid.pricesIncludeVat ? "Yes" : "No",
                    bid.brokerageCompCurr || 0,
                    bid.otherPortChargesCompCurr || 0,
                    bid.inlandTruckingCompCurr || 0,
                    bid.bankFeePerPaymentCompCurr || 0,
                    bid.shipmentType || "AUTO",
                    bid.containers20ft || 0,
                    bid.containers40ft || 0,
                    bid.declarationsCount || 1,
                    bid.paidByLc ? "Yes" : "No",
                    bid.leadTimeDays || 0,
                    bid.downPaymentPct || 0,
                    bid.balanceDueDays || 0,
                    bid.earlyPayDiscountPct || 0,
                    bid.earlyPayDiscountDays || 0,
                    bid.validUntil || "",
                    avgQuality,
                    bid.notes || "",
                ]);
            });
        });
    });

    return rows;
}

/**
 * Generates and downloads a 100% import-compatible CSV of all project bids and quotations.
 */
export function exportRfqBidsToCsv(project: RfqProject): void {
    const rows = buildBidsDataRows(project);
    const headerLine = BIDS_CANONICAL_COLUMNS.join(",");
    const csvLines = [
        headerLine,
        ...rows.map((row) =>
            row
                .map((val) => {
                    const str = String(val ?? "");
                    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                })
                .join(",")
        ),
    ];
    const csvContent = csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `${project.rfqReference || "RFQ"}-Bids-Data.csv`);
}

/**
 * Generates and downloads an executive comparison summary matrix CSV.
 */
export function exportRfqComparisonToCsv(project: RfqProject): void {
    const summary = evaluateAndCompareSuppliers(project);
    const headers = [
        "Item Number",
        "Item Name",
        "Specifications",
        "Quantity",
        "UOM",
        "Target Price",
        ...project.bids.map((b) => `${b.supplierName} Landed Unit`),
        ...project.bids.map((b) => `${b.supplierName} Total Landed`),
    ];

    const rows: string[][] = [headers];

    project.items.forEach((item, idx) => {
        const row = [
            String(idx + 1),
            `"${item.itemName.replace(/"/g, '""')}"`,
            `"${(item.specifications || "").replace(/"/g, '""')}"`,
            String(item.quantity),
            item.uom,
            String(item.targetUnitPrice),
        ];

        for (const bid of project.bids) {
            const res = summary.results[bid.id];
            const breakdown = res?.items[item.id];
            row.push(breakdown && breakdown.hasQuote ? String(breakdown.landedUnitCostCompCurr) : "-");
        }

        for (const bid of project.bids) {
            const res = summary.results[bid.id];
            const breakdown = res?.items[item.id];
            row.push(breakdown && breakdown.hasQuote ? String(breakdown.totalLandedCompCurr) : "-");
        }

        rows.push(row);
    });

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `${project.rfqReference || "RFQ"}-Supplier-Bid-Comparison.csv`);
}

/**
 * Default export alias for backwards compatibility: exports import-compatible bids CSV.
 */
export const exportRfqToCsv = exportRfqBidsToCsv;
