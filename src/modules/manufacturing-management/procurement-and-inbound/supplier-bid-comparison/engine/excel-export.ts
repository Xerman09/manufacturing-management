import { saveAs } from "file-saver";
import { RfqProject } from "../types";
import { evaluateAndCompareSuppliers } from "./scoring-engine";

export interface DynamicExportOptions {
    supplierIds?: string[];
    itemIds?: string[];
    includeCostWaterfall?: boolean;
    includeCommercialTerms?: boolean;
    includeQualityScores?: boolean;
    includeAwards?: boolean;
}

/**
 * Filter project items and bids based on export options
 */
function getFilteredProject(project: RfqProject, options?: DynamicExportOptions): RfqProject {
    if (!options) return project;

    const targetBids = options.supplierIds && options.supplierIds.length > 0
        ? project.bids.filter((b) => options.supplierIds!.includes(b.id))
        : project.bids;

    const targetItems = options.itemIds && options.itemIds.length > 0
        ? project.items.filter((it) => options.itemIds!.includes(it.id))
        : project.items;

    return {
        ...project,
        bids: targetBids,
        items: targetItems,
    };
}

/**
 * Generates and downloads the official multi-sheet Excel workbook (.xlsx):
 * 1. "Bid Comparison" sheet: item quotes, landed cost breakdown, quality scores, overall scores.
 * 2. "Award & Approval" sheet (optional): awarded items, winning supplier, landed cost, budget & target variance, justification.
 * 3. "Bids & Quotations" sheet: canonical tabular import/export rows.
 */
export async function exportRfqToExcel(project: RfqProject, options?: DynamicExportOptions): Promise<void> {
    const filteredProject = getFilteredProject(project, options);
    const ExcelJS = (await import("exceljs")).default;
    const summary = evaluateAndCompareSuppliers(filteredProject);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VOS ERP - Supplier Bid Comparison";
    workbook.created = new Date();

    const targetBids = filteredProject.bids;
    const targetItems = filteredProject.items;

    // =========================================================================
    // SHEET 1: Project Setup (Key-Value configuration for 100% round-trip)
    // =========================================================================
    const setupSheet = workbook.addWorksheet("Project Setup", {
        views: [{ showGridLines: true }],
    });
    setupSheet.addRow(["PROJECT / RFQ CONFIGURATION & SETUP"]).font = { size: 14, bold: true };
    const setupHeader = setupSheet.addRow(["Parameter", "Configured Value", "Description / Notes"]);
    setupHeader.font = { bold: true };
    setupHeader.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
    };

    const setupParams: [string, string | number, string][] = [
        ["Project / RFQ Title", filteredProject.rfqTitle || "Untitled", "Official procurement title"],
        ["Reference No", filteredProject.rfqReference || "-", "RFQ tracking reference number"],
        ["Target Date", filteredProject.targetDate || "", "Required delivery or canvass closing date (YYYY-MM-DD)"],
        ["Approved Budget", filteredProject.budget !== null && filteredProject.budget !== undefined ? filteredProject.budget : "", "Approved budget amount in comparison currency"],
        ["Comparison Currency", filteredProject.comparisonCurrency || "PHP", "Base evaluation currency"],
        ["Project Status", filteredProject.status || "Draft", "Current workflow stage"],
        ["Notes", filteredProject.notes || "", "Procurement notes and specifications"],
        ["FX Risk Buffer (%)", filteredProject.fxRiskBufferPct ?? 3, "Buffer applied on foreign currency CIF for hedging"],
        ["Cost of Money (% / yr)", filteredProject.costOfMoneyPctPerYear ?? 8, "Annual interest rate applied to payment terms"],
        ["Default VAT (%)", filteredProject.defaultVatPct ?? 12, "Standard VAT percentage"],
        ["Count VAT as Cost", filteredProject.countVatAsCost ? "Yes" : "No", "Whether VAT is factored into landed cost"],
        ["Calc Customs Auto", filteredProject.calcCustomsAuto ? "Yes" : "No", "Automatic calculation of Philippine customs & arrastre fees"],
        ["Scoring Weight Price (%)", filteredProject.scoringWeightPricePct ?? 50, "Weight percentage for price evaluation"],
        ["Scoring Weight Quality (%)", filteredProject.scoringWeightQualityPct ?? 35, "Weight percentage for technical & quality evaluation"],
        ["Scoring Weight Lead Time (%)", filteredProject.scoringWeightLeadTimePct ?? 15, "Weight percentage for lead time evaluation"],
        ["Award Strategy", filteredProject.awardStrategy || "LOWEST_TOTAL_OPTIMIZED", "Selected award optimization method"],
        ["Prepared By", filteredProject.preparedBy || "", "Name of procurement specialist"],
        ["Prepared By Title", filteredProject.preparedByTitle || "Procurement Specialist", "Position title"],
        ["Reviewed By", filteredProject.reviewedBy || "", "Name of technical reviewer"],
        ["Reviewed By Title", filteredProject.reviewedByTitle || "Procurement Lead", "Position title"],
        ["Approved By", filteredProject.approvedBy || "", "Name of approving officer"],
        ["Approved By Title", filteredProject.approvedByTitle || "Operations Director", "Position title"],
        ["Justification", filteredProject.justification || "", "Executive justification for award"],
    ];

    setupParams.forEach(([param, val, desc]) => {
        setupSheet.addRow([param, val, desc]);
    });
    setupSheet.columns = [{ width: 28 }, { width: 38 }, { width: 45 }];

    // =========================================================================
    // SHEET 2: Exchange Rates (Evaluation exchange rates)
    // =========================================================================
    const ratesSheet = workbook.addWorksheet("Exchange Rates", {
        views: [{ showGridLines: true }],
    });
    ratesSheet.addRow(["EVALUATION EXCHANGE RATES"]).font = { size: 14, bold: true };
    const ratesHeader = ratesSheet.addRow([
        "Currency Code",
        `Rate to Comparison Currency (${filteredProject.comparisonCurrency || "PHP"})`,
    ]);
    ratesHeader.font = { bold: true };
    ratesHeader.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
    };

    const ratesToExport = filteredProject.exchangeRates && filteredProject.exchangeRates.length > 0
        ? filteredProject.exchangeRates
        : [
            { currencyCode: "USD", rateToComparison: 56.50 },
            { currencyCode: "EUR", rateToComparison: 61.20 },
            { currencyCode: "CNY", rateToComparison: 7.85 },
            { currencyCode: "JPY", rateToComparison: 0.38 },
        ];

    ratesToExport.forEach((r) => {
        ratesSheet.addRow([r.currencyCode, r.rateToComparison]);
    });
    ratesSheet.columns = [{ width: 18 }, { width: 36 }];

    // =========================================================================
    // SHEET 3: Quality Criteria (1.5 Pass/Fail Mandatory & Scored Criteria)
    // =========================================================================
    const critSheet = workbook.addWorksheet("Quality Criteria", {
        views: [{ showGridLines: true }],
    });
    critSheet.addRow(["QUALITY CRITERIA & MANDATORY REQUIREMENTS (1.5)"]).font = { size: 14, bold: true };
    const critHeader = critSheet.addRow([
        "Criterion Type",
        "Criterion Name",
        "Weight (%)",
        "Sort Order",
        "Evaluation Rule",
    ]);
    critHeader.font = { bold: true };
    critHeader.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
    };

    (filteredProject.qualityCriteria || []).forEach((c, idx) => {
        critSheet.addRow([
            c.criterionType,
            c.criterionName,
            c.criterionType === "SCORED" ? c.weightPct : 0,
            c.sortOrder || idx + 1,
            c.criterionType === "PASS_FAIL"
                ? "Mandatory requirement (Pass/Fail) - Disqualifies supplier if Failed"
                : "Technical evaluation scored parameter (1-5 rating scale)",
        ]);
    });
    critSheet.columns = [{ width: 18 }, { width: 40 }, { width: 14 }, { width: 12 }, { width: 45 }];

    // =========================================================================
    // SHEET 4: Requested Items (Items with specifications)
    // =========================================================================
    const itemsSheet = workbook.addWorksheet("Requested Items", {
        views: [{ showGridLines: true }],
    });
    itemsSheet.addRow(["REQUESTED PROCUREMENT ITEMS & SPECIFICATIONS"]).font = { size: 14, bold: true };
    const itemsHeader = itemsSheet.addRow([
        "#",
        "Item Name",
        "Specifications",
        "Quantity",
        "UOM",
        "Target Unit Price",
        "HS Code",
        "Duty %",
        "Weight (kg/unit)",
        "Volume (cbm/unit)",
    ]);
    itemsHeader.font = { bold: true };
    itemsHeader.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
    };

    (filteredProject.items || []).forEach((item, idx) => {
        itemsSheet.addRow([
            idx + 1,
            item.itemName,
            item.specifications || "",
            item.quantity,
            item.uom,
            item.targetUnitPrice,
            item.hsCode || "",
            item.dutyPct || 0,
            item.weightPerUnitKg || 0,
            item.cbmPerUnit || 0,
        ]);
    });
    itemsSheet.columns = [
        { width: 6 },
        { width: 28 },
        { width: 35 },
        { width: 12 },
        { width: 10 },
        { width: 18 },
        { width: 14 },
        { width: 10 },
        { width: 16 },
        { width: 16 },
    ];

    // -------------------------------------------------------------------------
    // SHEET 5: Comparison
    // -------------------------------------------------------------------------
    const compSheet = workbook.addWorksheet("Bid Comparison", {
        views: [{ showGridLines: true }],
    });

    // Title & Header Block
    compSheet.addRow(["SUPPLIER BID COMPARISON - ABSTRACT & EVALUATION"]).font = {
        size: 14,
        bold: true,
    };
    compSheet.addRow([`Project / RFQ: ${filteredProject.rfqTitle || "Untitled"}`]);
    compSheet.addRow([`Reference No: ${filteredProject.rfqReference || "-"} | Currency: ${filteredProject.comparisonCurrency || "PHP"}`]);
    compSheet.addRow([`Status: ${filteredProject.status} | Date: ${new Date().toLocaleDateString()}`]);
    compSheet.addRow([]);

    // Table Header
    const supplierHeaders = targetBids.map((b) => `${b.supplierName} (${b.quoteCurrency})`);
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
    targetItems.forEach((item, idx) => {
        const rowVals: (string | number)[] = [
            idx + 1,
            item.itemName,
            item.specifications || "-",
            item.quantity,
            item.uom,
            item.targetUnitPrice,
        ];

        for (const bid of targetBids) {
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

    // Cost Breakdown Section (optional)
    if (options?.includeCostWaterfall !== false) {
        compSheet.addRow([]);
        const breakdownTitle = compSheet.addRow(["TOTAL LANDED COST BREAKDOWN (" + (filteredProject.comparisonCurrency || "PHP") + ")"]);
        breakdownTitle.font = { bold: true };

        const allCostLines: { label: string; key: string; isQuality?: boolean }[] = [
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
            { label: "Quality Score (0-100)", key: "qualityScore", isQuality: true },
            { label: "Price Score (0-100)", key: "priceScore" },
            { label: "Lead Time Score (0-100)", key: "leadTimeScore" },
            { label: "OVERALL SCORE (0-100)", key: "overallScore" },
            { label: "Rank", key: "ranking" },
        ];

        const costLines = options?.includeQualityScores === false
            ? allCostLines.filter((l) => !l.isQuality)
            : allCostLines;

        for (const cl of costLines) {
            const lineVals: (string | number)[] = ["", cl.label, "", "", "", ""];
            for (const bid of targetBids) {
                const res = summary.results[bid.id];
                const resRecord = res as unknown as Record<string, unknown> | undefined;
                const rawVal = resRecord?.[cl.key];
                const val = typeof rawVal === "number" || typeof rawVal === "string" ? rawVal : "-";
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
    }

    compSheet.columns.forEach((col) => {
        col.width = 18;
    });

    // -------------------------------------------------------------------------
    // SHEET 2: Award & Approval (optional)
    // -------------------------------------------------------------------------
    if (options?.includeAwards !== false) {
        const awardSheet = workbook.addWorksheet("Award & Approval", {
            views: [{ showGridLines: true }],
        });

        awardSheet.addRow(["AWARD ALLOCATION & EXECUTIVE APPROVAL"]).font = {
            size: 14,
            bold: true,
        };
        awardSheet.addRow([`Reference No: ${filteredProject.rfqReference || "-"} | Status: ${filteredProject.status}`]);
        awardSheet.addRow([]);

        const awardHeader = awardSheet.addRow([
            "#",
            "Item Name",
            "Quantity",
            "UOM",
            "Awarded Supplier",
            "Landed Unit Cost (" + filteredProject.comparisonCurrency + ")",
            "Landed Total (" + filteredProject.comparisonCurrency + ")",
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

        targetItems.forEach((item, idx) => {
            const award = filteredProject.awards?.find((a) => a.rfqItemId === item.id);
            const awardedBid = award ? targetBids.find((b) => b.id === award.rfqBidId) : null;
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

        if (filteredProject.budget) {
            const budgetVariance = totalAwardLanded - filteredProject.budget;
            awardSheet.addRow([
                "",
                "APPROVED BUDGET",
                "",
                "",
                "",
                "",
                filteredProject.budget,
                "",
                budgetVariance > 0 ? `Over budget by ${budgetVariance}` : `Under budget by ${Math.abs(budgetVariance)}`,
            ]).font = { bold: true };
        }

        awardSheet.addRow([]);
        awardSheet.addRow(["JUSTIFICATION / REASON FOR AWARD:"]).font = { bold: true };
        awardSheet.addRow([filteredProject.justification || "No justification recorded."]);

        awardSheet.addRow([]);
        awardSheet.addRow(["SIGNATORIES:"]).font = { bold: true };
        awardSheet.addRow([
            `Prepared by: ${filteredProject.preparedBy || "-"} (${filteredProject.preparedByTitle || "Procurement"})`,
            `Reviewed by: ${filteredProject.reviewedBy || "-"} (${filteredProject.reviewedByTitle || "Reviewer"})`,
            `Approved by: ${filteredProject.approvedBy || "-"} (${filteredProject.approvedByTitle || "Approver"})`,
        ]);

        awardSheet.columns.forEach((col) => {
            col.width = 20;
        });
    }

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // SHEET: Technical Quality & Compliance Evaluation (optional)
    // -------------------------------------------------------------------------
    if (options?.includeQualityScores !== false) {
        const qualitySheet = workbook.addWorksheet("Quality & Compliance", {
            views: [{ showGridLines: true }],
        });

        qualitySheet.addRow(["TECHNICAL QUALITY & COMPLIANCE EVALUATION MATRIX"]).font = {
            size: 14,
            bold: true,
        };
        qualitySheet.addRow([`Project / RFQ: ${filteredProject.rfqTitle || "Untitled"}`]);
        qualitySheet.addRow([`Reference No: ${filteredProject.rfqReference || "-"} | Status: ${filteredProject.status} | Date: ${new Date().toLocaleDateString()}`]);
        qualitySheet.addRow([]);

        const passFailCriteria = (filteredProject.qualityCriteria || []).filter((c) => c.criterionType === "PASS_FAIL");
        const scoredCriteria = (filteredProject.qualityCriteria || []).filter((c) => c.criterionType === "SCORED");

        // Section 1: Mandatory Compliance Requirements (Pass / Fail)
        if (passFailCriteria.length > 0) {
            const pfTitle = qualitySheet.addRow(["1. MANDATORY COMPLIANCE REQUIREMENTS (PASS / FAIL)"]);
            pfTitle.font = { bold: true };

            const pfHeader = qualitySheet.addRow([
                "#",
                "Compliance Criterion",
                "Evaluation Type",
                ...targetBids.flatMap((b) => [`${b.supplierName} Result`, `${b.supplierName} Audit Remarks`]),
            ]);
            pfHeader.font = { bold: true };
            pfHeader.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFE2E8F0" },
            };

            passFailCriteria.forEach((c, idx) => {
                const rowVals: (string | number)[] = [idx + 1, c.criterionName, "Pass / Fail"];
                for (const bid of targetBids) {
                    const s = bid.scores?.[c.id];
                    const result = s?.passFailResult || "NOT_CHECKED";
                    const remarks = s?.evidenceRemarks || "-";
                    rowVals.push(result, remarks);
                }
                const row = qualitySheet.addRow(rowVals);
                targetBids.forEach((_, bIdx) => {
                    const colIndex = 4 + bIdx * 2;
                    const cell = row.getCell(colIndex);
                    if (cell.value === "PASS") {
                        cell.font = { bold: true, color: { argb: "FF166534" } };
                    } else if (cell.value === "FAIL") {
                        cell.font = { bold: true, color: { argb: "FF991B1B" } };
                    }
                });
            });

            qualitySheet.addRow([]);
        }

        // Section 2: Technical Scored Criteria (1-5 Scale)
        if (scoredCriteria.length > 0) {
            const scTitle = qualitySheet.addRow(["2. TECHNICAL SCORED CRITERIA (1-5 SCALE)"]);
            scTitle.font = { bold: true };

            const scHeader = qualitySheet.addRow([
                "#",
                "Evaluation Parameter",
                "Weight (%)",
                ...targetBids.flatMap((b) => [`${b.supplierName} Rating (1-5)`, `${b.supplierName} Weighted Score`, `${b.supplierName} Audit Remarks`]),
            ]);
            scHeader.font = { bold: true };
            scHeader.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFE2E8F0" },
            };

            scoredCriteria.forEach((c, idx) => {
                const rowVals: (string | number)[] = [idx + 1, c.criterionName, `${c.weightPct}%`];
                for (const bid of targetBids) {
                    const s = bid.scores?.[c.id];
                    const score = s?.score && s.score >= 1 ? s.score : "-";
                    const weighted = typeof score === "number" ? Number(((score / 5) * c.weightPct).toFixed(2)) : "-";
                    const remarks = s?.evidenceRemarks || "-";
                    rowVals.push(score, weighted, remarks);
                }
                qualitySheet.addRow(rowVals);
            });

            qualitySheet.addRow([]);
        }

        // Section 3: Summary Scoring & Compliance Verdict
        const verdictTitle = qualitySheet.addRow(["3. TECHNICAL EVALUATION SUMMARY & VERDICT"]);
        verdictTitle.font = { bold: true };

        const summaryHeader = qualitySheet.addRow([
            "#",
            "Supplier Name",
            "Supplier Type",
            "Country",
            "Mandatory Compliance",
            "Total Quality Score (0-100)",
            "Quality Rank",
        ]);
        summaryHeader.font = { bold: true };
        summaryHeader.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE2E8F0" },
        };

        targetBids.forEach((bid, idx) => {
            const res = summary.results[bid.id];
            const isCompliant = res ? !res.isDisqualified : true;
            const qScore = res ? res.qualityScore : 0;
            const qRank = res ? res.ranking : "-";

            const row = qualitySheet.addRow([
                idx + 1,
                bid.supplierName,
                bid.supplierType,
                bid.country || "-",
                isCompliant ? "COMPLIANT" : "DISQUALIFIED (Failed mandatory)",
                qScore,
                qRank,
            ]);

            const statusCell = row.getCell(5);
            if (isCompliant) {
                statusCell.font = { bold: true, color: { argb: "FF166534" } };
            } else {
                statusCell.font = { bold: true, color: { argb: "FF991B1B" } };
            }
        });

        qualitySheet.columns.forEach((col) => {
            col.width = 22;
        });
    }

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

    const bidsRows = buildBidsDataRows(filteredProject, options);
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
    saveAs(blob, `${filteredProject.rfqReference || "RFQ"}-Supplier-Bid-Comparison.xlsx`);
}

export const BIDS_CANONICAL_COLUMNS = [
    "Supplier",
    "Type",
    "Country",
    "Currency",
    "Incoterm",
    "Item",
    "Specifications",
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
 * Builds the canonical 43-column tabular rows representation of bids and quotations.
 * Fully compatible with the import parser, with optional filtering.
 */
export function buildBidsDataRows(project: RfqProject, options?: DynamicExportOptions): (string | number)[][] {
    const filteredProject = getFilteredProject(project, options);
    const rows: (string | number)[][] = [];

    // If project has no bids yet, export requested items with empty supplier fields for vendor RFQ dispatch
    if (!filteredProject.bids || filteredProject.bids.length === 0) {
        (filteredProject.items || []).forEach((item) => {
            rows.push([
                "", // Supplier
                "Local", // Type
                "PH", // Country
                filteredProject.comparisonCurrency || "PHP", // Currency
                "DDP", // Incoterm
                item.itemName,
                item.specifications || "",
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
                filteredProject.comparisonCurrency || "PHP",
                "PCT_GOODS_AND_FREIGHT",
                0.3,
                "", // FTA
                0, // FTA Duty %
                filteredProject.defaultVatPct ?? 12,
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

    filteredProject.bids.forEach((bid) => {
        // Compute average scored quality rating (1-5 scale)
        const scoredEntries = Object.values(bid.scores || {})
            .map((s) => s.score)
            .filter((s): s is number => s !== null && s > 0);
        const avgQuality = scoredEntries.length > 0
            ? Number((scoredEntries.reduce((a, b) => a + b, 0) / scoredEntries.length).toFixed(1))
            : 5;

        (filteredProject.items || []).forEach((item) => {
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
                    item.specifications || "",
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
 * Generates and downloads a 100% import-compatible CSV of project bids and quotations, with optional filtering.
 */
export function exportRfqBidsToCsv(project: RfqProject, options?: DynamicExportOptions): void {
    const rows = buildBidsDataRows(project, options);
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
 * Generates and downloads an executive comparison summary matrix CSV, with optional filtering.
 */
export function exportRfqComparisonToCsv(project: RfqProject, options?: DynamicExportOptions): void {
    const filteredProject = getFilteredProject(project, options);
    const summary = evaluateAndCompareSuppliers(filteredProject);
    const targetBids = filteredProject.bids;
    const targetItems = filteredProject.items;

    const headers = [
        "Item Number",
        "Item Name",
        "Specifications",
        "Quantity",
        "UOM",
        "Target Price",
        ...targetBids.map((b) => `${b.supplierName} Landed Unit`),
        ...targetBids.map((b) => `${b.supplierName} Total Landed`),
    ];

    const rows: string[][] = [headers];

    targetItems.forEach((item, idx) => {
        const row = [
            String(idx + 1),
            `"${item.itemName.replace(/"/g, '""')}"`,
            `"${(item.specifications || "").replace(/"/g, '""')}"`,
            String(item.quantity),
            item.uom,
            String(item.targetUnitPrice),
        ];

        for (const bid of targetBids) {
            const res = summary.results[bid.id];
            const breakdown = res?.items[item.id];
            row.push(breakdown && breakdown.hasQuote ? String(breakdown.landedUnitCostCompCurr) : "-");
        }

        for (const bid of targetBids) {
            const res = summary.results[bid.id];
            const breakdown = res?.items[item.id];
            row.push(breakdown && breakdown.hasQuote ? String(breakdown.totalLandedCompCurr) : "-");
        }

        rows.push(row);
    });

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `${filteredProject.rfqReference || "RFQ"}-Supplier-Bid-Comparison.csv`);
}

/**
 * Generates and downloads a dedicated Technical Quality & Compliance Evaluation Matrix CSV.
 */
export function exportRfqQualityToCsv(project: RfqProject, options?: DynamicExportOptions): void {
    const filteredProject = getFilteredProject(project, options);
    const summary = evaluateAndCompareSuppliers(filteredProject);
    const targetBids = filteredProject.bids;
    const passFailCriteria = (filteredProject.qualityCriteria || []).filter((c) => c.criterionType === "PASS_FAIL");
    const scoredCriteria = (filteredProject.qualityCriteria || []).filter((c) => c.criterionType === "SCORED");

    const rows: string[][] = [];

    rows.push([`"TECHNICAL QUALITY & COMPLIANCE EVALUATION MATRIX"`]);
    rows.push([`"Project / RFQ"`, `"${filteredProject.rfqTitle || "Untitled"}"`]);
    rows.push([`"Reference No"`, `"${filteredProject.rfqReference || "-"}"`, `"Status"`, `"${filteredProject.status}"`]);
    rows.push([]);

    // 1. Mandatory Compliance Section
    if (passFailCriteria.length > 0) {
        rows.push([`"1. MANDATORY COMPLIANCE REQUIREMENTS (PASS/FAIL)"`]);
        const pfHeaders = [
            `"#"`,
            `"Criterion Name"`,
            `"Type"`,
            ...targetBids.flatMap((b) => [`"${b.supplierName} Result"`, `"${b.supplierName} Audit Remarks"`]),
        ];
        rows.push(pfHeaders);

        passFailCriteria.forEach((c, idx) => {
            const row = [
                String(idx + 1),
                `"${c.criterionName.replace(/"/g, '""')}"`,
                `"Pass/Fail"`,
            ];
            for (const bid of targetBids) {
                const s = bid.scores?.[c.id];
                row.push(`"${s?.passFailResult || "NOT_CHECKED"}"`);
                row.push(`"${(s?.evidenceRemarks || "").replace(/"/g, '""')}"`);
            }
            rows.push(row);
        });
        rows.push([]);
    }

    // 2. Scored Criteria Section
    if (scoredCriteria.length > 0) {
        rows.push([`"2. TECHNICAL SCORED CRITERIA (1-5 SCALE)"`]);
        const scHeaders = [
            `"#"`,
            `"Evaluation Parameter"`,
            `"Weight %"`,
            ...targetBids.flatMap((b) => [
                `"${b.supplierName} Score (1-5)"`,
                `"${b.supplierName} Weighted Score"`,
                `"${b.supplierName} Audit Remarks"`,
            ]),
        ];
        rows.push(scHeaders);

        scoredCriteria.forEach((c, idx) => {
            const row = [
                String(idx + 1),
                `"${c.criterionName.replace(/"/g, '""')}"`,
                `"${c.weightPct}%"`,
            ];
            for (const bid of targetBids) {
                const s = bid.scores?.[c.id];
                const score = s?.score && s.score >= 1 ? s.score : "-";
                const weighted = typeof score === "number" ? ((score / 5) * c.weightPct).toFixed(2) : "-";
                row.push(String(score));
                row.push(String(weighted));
                row.push(`"${(s?.evidenceRemarks || "").replace(/"/g, '""')}"`);
            }
            rows.push(row);
        });
        rows.push([]);
    }

    // 3. Evaluation Summary Verdict
    rows.push([`"3. TECHNICAL EVALUATION SUMMARY & VERDICT"`]);
    rows.push([
        `"#"`,
        `"Supplier Name"`,
        `"Supplier Type"`,
        `"Country"`,
        `"Mandatory Compliance"`,
        `"Total Quality Score (0-100)"`,
        `"Quality Rank"`,
    ]);

    targetBids.forEach((bid, idx) => {
        const res = summary.results[bid.id];
        const isCompliant = res ? !res.isDisqualified : true;
        const qScore = res ? res.qualityScore : 0;
        const qRank = res ? res.ranking : "-";

        rows.push([
            String(idx + 1),
            `"${bid.supplierName.replace(/"/g, '""')}"`,
            bid.supplierType,
            `"${bid.country || "-"}"`,
            isCompliant ? `"COMPLIANT"` : `"DISQUALIFIED"`,
            String(qScore),
            String(qRank),
        ]);
    });

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `${filteredProject.rfqReference || "RFQ"}-Quality-Evaluation.csv`);
}

/**
 * Generates and downloads a structured JSON backup of the RFQ project, with optional filtering.
 */
export function exportRfqToJson(project: RfqProject, options?: DynamicExportOptions): void {
    const filteredProject = getFilteredProject(project, options);
    const targetAwards = options?.includeAwards === false
        ? []
        : (filteredProject.awards || []).filter((a) =>
            filteredProject.items.some((it) => it.id === a.rfqItemId)
        );

    const exportPayload = {
        ...filteredProject,
        awards: targetAwards,
        exportedAt: new Date().toISOString(),
        exportedBy: "VOS Manufacturing Management",
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
    saveAs(blob, `${project.rfqReference || "RFQ"}-Export.json`);
}

/**
 * Default export alias for backwards compatibility: exports import-compatible bids CSV.
 */
export const exportRfqToCsv = exportRfqBidsToCsv;

/**
 * Generates and downloads a clean, full-project template Excel workbook (.xlsx)
 * pre-populated with project setup, exchange rates, pass/fail quality criteria,
 * items with specifications, and vendor quotation columns.
 */
export async function exportFullProjectTemplate(project?: RfqProject): Promise<void> {
    const templateProject: RfqProject = project || {
        id: "rfq-template",
        rfqTitle: "Procurement Canvass Project Template",
        rfqReference: "RFQ-2026-CANVASS-TEMPLATE",
        roundNo: 1,
        comparisonCurrency: "PHP",
        budget: 5000000,
        notes: "Detailed project notes and canvass guidelines.",
        targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        fxRiskBufferPct: 3,
        costOfMoneyPctPerYear: 8,
        defaultVatPct: 12,
        countVatAsCost: true,
        calcCustomsAuto: true,
        scoringWeightPricePct: 50,
        scoringWeightQualityPct: 35,
        scoringWeightLeadTimePct: 15,
        status: "Draft",
        version: 1,
        preparedBy: "",
        preparedByTitle: "Procurement Specialist",
        reviewedBy: "",
        reviewedByTitle: "Procurement Lead",
        approvedBy: "",
        approvedByTitle: "Operations Director",
        justification: "",
        awardStrategy: "LOWEST_TOTAL_OPTIMIZED",
        items: [
            {
                id: "item-1",
                itemName: "LED panel light 60x60",
                specifications: "40W, 4000lm, 4000K Natural White, CRI>80, IP40",
                quantity: 1200,
                uom: "PCS",
                targetUnitPrice: 1350,
                hsCode: "9405.11",
                dutyPct: 10,
                weightPerUnitKg: 3.5,
                cbmPerUnit: 0.024,
                sortOrder: 1,
            },
            {
                id: "item-2",
                itemName: "LED driver",
                specifications: "Constant current 1050mA, 42V DC, isolated, PF>0.95",
                quantity: 1200,
                uom: "PCS",
                targetUnitPrice: 380,
                hsCode: "8504.40",
                dutyPct: 3,
                weightPerUnitKg: 0.3,
                cbmPerUnit: 0.001,
                sortOrder: 2,
            },
        ],
        qualityCriteria: [
            {
                id: "crit-1",
                criterionType: "PASS_FAIL",
                criterionName: "ISO 9001:2015 / CE / RoHS Certification",
                weightPct: 0,
                sortOrder: 1,
            },
            {
                id: "crit-2",
                criterionType: "PASS_FAIL",
                criterionName: "Certificate of Analysis (COA) / Factory Test Report per batch",
                weightPct: 0,
                sortOrder: 2,
            },
            {
                id: "crit-3",
                criterionType: "SCORED",
                criterionName: "Technical Specification Compliance & Photometric Test",
                weightPct: 40,
                sortOrder: 3,
            },
            {
                id: "crit-4",
                criterionType: "SCORED",
                criterionName: "Warranty Period & After-Sales Replacement Commitment",
                weightPct: 30,
                sortOrder: 4,
            },
            {
                id: "crit-5",
                criterionType: "SCORED",
                criterionName: "Manufacturing Capacity & Delivery Track Record",
                weightPct: 30,
                sortOrder: 5,
            },
        ],
        exchangeRates: [
            { currencyCode: "USD", rateToComparison: 56.50 },
            { currencyCode: "EUR", rateToComparison: 61.20 },
            { currencyCode: "CNY", rateToComparison: 7.85 },
            { currencyCode: "JPY", rateToComparison: 0.38 },
        ],
        customsRates: {
            cdsCompCurr: 100,
            birDstCompCurr: 30,
            containerSecurityUsd: 5,
            arrastre20ftCompCurr: 4738,
            arrastre40ftCompCurr: 10869,
            wharfage20ftCompCurr: 519.35,
            wharfage40ftCompCurr: 779.05,
            lclArrastrePerRtCompCurr: 149,
            lclWharfagePerRtCompCurr: 30.55,
            lcBankChargePct: 0.125,
        },
        ipcBrackets: [],
        bids: [],
        awards: [],
        approvalHistory: [],
    };

    await exportRfqToExcel(templateProject);
}
