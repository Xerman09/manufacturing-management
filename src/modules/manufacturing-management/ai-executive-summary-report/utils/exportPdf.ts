import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AIExecutiveReportPayload, AIInsightsPayload } from "../types";

/**
 * Strips non-ASCII characters and maps symbols into safe ASCII equivalents
 * to prevent jsPDF Helvetica font encoding corruption (e.g. '%%', '"d', '%*').
 */
function cleanPdfText(text: string | null | undefined): string {
    if (!text) return "";
    return String(text)
        .replace(/▼/g, "-")
        .replace(/▲/g, "+")
        .replace(/≤/g, "<=")
        .replace(/≥/g, ">=")
        .replace(/×/g, "x")
        .replace(/–|—/g, "-")
        .replace(/“|”/g, '"')
        .replace(/‘|’/g, "'")
        .replace(/[^\x00-\x7F]/g, "") // Strip any remaining non-ASCII characters
        .trim();
}

export function generateExecutiveReportPdf(
    payload: AIExecutiveReportPayload,
    insights?: AIInsightsPayload | null
): ArrayBuffer {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    const primaryColor = [15, 23, 42]; // Slate-900
    const secondaryColor = [71, 85, 105]; // Slate-600
    const purpleColor = [109, 40, 217]; // Purple-700
    const accentBg = [245, 243, 255]; // Purple-50

    const execReport = insights?.executiveReport;

    // Check if Tier 3 Executive Report is available
    if (execReport) {
        // =========================================================================
        // EXECUTIVE AI PERFORMANCE REPORT (4 SECTIONS GROUNDED IN REAL DATA)
        // =========================================================================

        // Document Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2]);
        doc.text(execReport.reportTitle || "Plant Operations & Manufacturing Executive Performance Report", 14, 18);

        // Subtitle & Focus Scope
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.text(
            `Prepared By: ${execReport.preparedBy || "Super Intelligent AI Operations Analyst"}  |  Focus: ${execReport.focus || "Production Yield & Bottlenecks"}`,
            14,
            24
        );
        doc.text(
            `Plant: ${payload.meta.plantName}  |  Period: ${payload.meta.reportingPeriod} (${payload.meta.dateFrom} - ${payload.meta.dateTo})  |  Service: Tier ${payload.meta.aiTier.tierLevel} (${payload.meta.aiTier.tierName})`,
            14,
            29
        );

        doc.setDrawColor(226, 232, 240);
        doc.line(14, 33, 196, 33);

        let currentY = 39;

        // 1. EXECUTIVE SUMMARY & OVERVIEW
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2]);
        doc.text("1. Executive Summary & Overview", 14, currentY);
        currentY += 4.5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        const summaryLines = doc.splitTextToSize(execReport.executiveSummary || insights.summary || "", 182);
        doc.text(summaryLines, 14, currentY);
        currentY += summaryLines.length * 3.8 + 3;

        // Key Metrics Overview Table
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text("Key Metrics Overview", 14, currentY);
        currentY += 2;

        const tableRows = (execReport.metricsTable || []).map((m) => [
            m.category,
            m.actual,
            m.target,
            m.status
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [["Operational Vector", "Actual Value", "Target / Benchmark", "Performance Status"]],
            body: tableRows,
            theme: "grid",
            headStyles: { fillColor: [109, 40, 217], fontSize: 8, fontStyle: "bold" },
            bodyStyles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [250, 245, 255] },
            styles: { cellPadding: 2 }
        });

        // @ts-expect-error - jspdf-autotable augments doc with lastAutoTable
        currentY = (doc.lastAutoTable?.finalY || currentY + 35) + 6;

        // 2. BOTTLENECK ANALYSIS & PERFORMANCE FINDINGS
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2]);
        doc.text("2. Bottleneck Analysis & Performance Findings", 14, currentY);
        currentY += 5;

        // A. High-Efficiency Phases
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(16, 149, 106); // Emerald-600
        doc.text("A. High-Efficiency Operational Phases", 14, currentY);
        currentY += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        for (const item of execReport.bottleneckFindings.highEfficiency || []) {
            const bulletLines = doc.splitTextToSize(`• ${item}`, 180);
            doc.text(bulletLines, 16, currentY);
            currentY += bulletLines.length * 3.6 + 1;
        }
        currentY += 2;

        // B. Primary Operational Bottlenecks
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(217, 119, 6); // Amber-600
        doc.text("B. Primary Operational Bottlenecks", 14, currentY);
        currentY += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        for (const item of execReport.bottleneckFindings.primaryBottlenecks || []) {
            const bulletLines = doc.splitTextToSize(`• ${item}`, 180);
            doc.text(bulletLines, 16, currentY);
            currentY += bulletLines.length * 3.6 + 1;
        }
        currentY += 2;

        // C. Critical Risk & Delays Assessment
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(225, 29, 72); // Rose-600
        doc.text("C. Critical Risk & Delay Assessment", 14, currentY);
        currentY += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        for (const item of execReport.bottleneckFindings.criticalDelays || []) {
            const bulletLines = doc.splitTextToSize(`• ${item}`, 180);
            doc.text(bulletLines, 16, currentY);
            currentY += bulletLines.length * 3.6 + 1;
        }
        currentY += 5;

        // Check page overflow before Section 3
        if (currentY > 230) {
            doc.addPage();
            currentY = 20;
        }

        // 3. SUMMARY / KEY TAKEAWAYS
        doc.setFillColor(accentBg[0], accentBg[1], accentBg[2]);
        doc.setDrawColor(216, 180, 254);
        const takeawaysList = Array.isArray(execReport.keyTakeaways)
            ? execReport.keyTakeaways
            : String(execReport.keyTakeaways || "").split("\n").filter((l) => l.trim().length > 0);

        doc.roundedRect(14, currentY, 182, Math.max(16, takeawaysList.length * 7 + 10), 2, 2, "FD");
        currentY += 5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2]);
        doc.text("3. Summary / Key Takeaways", 18, currentY);
        currentY += 4.5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        for (const item of takeawaysList) {
            const cleanText = item.replace(/^[•\-\*]\s*/, "");
            const bulletLines = doc.splitTextToSize(`• ${cleanText}`, 174);
            doc.text(bulletLines, 18, currentY);
            currentY += bulletLines.length * 3.6 + 1.5;
        }
        currentY += 7;

        // Check page overflow before Section 4
        if (currentY > 220) {
            doc.addPage();
            currentY = 20;
        }

        // 4. RECOMMENDED ACTION PLAN
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(purpleColor[0], purpleColor[1], purpleColor[2]);
        doc.text("4. Recommended Action Plan", 14, currentY);
        currentY += 5;

        const actionRows = (execReport.strategicRecommendations || []).map((rec, idx) => [
            `${idx + 1}. ${rec.title}`,
            rec.description,
            rec.owner || "Production Operations"
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [["Action Directive", "Operational Execution Steps (How)", "Designated Department / Lead"]],
            body: actionRows,
            theme: "grid",
            headStyles: { fillColor: [88, 28, 135], fontSize: 8, fontStyle: "bold" },
            bodyStyles: { fontSize: 7.5 },
            columnStyles: {
                0: { cellWidth: 45, fontStyle: "bold" },
                1: { cellWidth: 95 },
                2: { cellWidth: 42 }
            },
            styles: { cellPadding: 2.5 }
        });
    } else {
        // =========================================================================
        // STANDARD / RAW METRIC REPORT (Fallback when Executive AI is unassigned)
        // =========================================================================

        // Header Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text("AI Executive Summary Report", 14, 18);

        // Subtitle / Scope
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.text(`Plant: ${payload.meta.plantName}  |  Period: ${payload.meta.reportingPeriod} (${payload.meta.dateFrom} - ${payload.meta.dateTo})`, 14, 24);
        doc.text(`Generated: ${payload.meta.generatedAt}  |  AI Service: Tier ${payload.meta.aiTier.tierLevel} (${payload.meta.aiTier.tierName})`, 14, 29);

        doc.setDrawColor(226, 232, 240);
        doc.line(14, 33, 196, 33);

        let currentY = 40;

        // KPI Summary Table
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text("1. Executive KPI Overview", 14, currentY);
        currentY += 4;

        const kpiTableRows = [
            [
                payload.kpiCards.output.title,
                `${payload.kpiCards.output.actual?.toLocaleString() ?? "N/A"} ${payload.kpiCards.output.unit}`,
                `${payload.kpiCards.output.target?.toLocaleString() ?? "N/A"} ${payload.kpiCards.output.unit}`,
                `${payload.kpiCards.output.variancePercent !== null ? `${payload.kpiCards.output.variancePercent}%` : "N/A"}`,
                payload.kpiCards.output.status.toUpperCase()
            ],
            [
                payload.kpiCards.plantOee.title,
                `${payload.kpiCards.plantOee.actual !== null ? `${payload.kpiCards.plantOee.actual}%` : "N/A"}`,
                `${payload.kpiCards.plantOee.target}%`,
                `${payload.kpiCards.plantOee.variance !== null ? `${payload.kpiCards.plantOee.variance}%` : "N/A"}`,
                payload.kpiCards.plantOee.status.toUpperCase()
            ],
            [
                payload.kpiCards.scrapRate.title,
                `${payload.kpiCards.scrapRate.actual}%`,
                `${payload.kpiCards.scrapRate.target}%`,
                `${payload.kpiCards.scrapRate.variance}%`,
                payload.kpiCards.scrapRate.status.toUpperCase()
            ],
            [
                payload.kpiCards.downtimeMinutes.title,
                `${payload.kpiCards.downtimeMinutes.actual?.toLocaleString() ?? "0"} ${payload.kpiCards.downtimeMinutes.unit}`,
                `${payload.kpiCards.downtimeMinutes.target} ${payload.kpiCards.downtimeMinutes.unit}`,
                `${payload.kpiCards.downtimeMinutes.variance} Mins`,
                payload.kpiCards.downtimeMinutes.status.toUpperCase()
            ],
            [
                payload.kpiCards.otif.title,
                `${payload.kpiCards.otif.actual !== null ? `${payload.kpiCards.otif.actual}%` : "N/A"}`,
                `${payload.kpiCards.otif.target}%`,
                `${payload.kpiCards.otif.variance !== null ? `${payload.kpiCards.otif.variance}%` : "N/A"}`,
                payload.kpiCards.otif.status.toUpperCase()
            ],
            [
                payload.kpiCards.costVariance.title,
                `${payload.kpiCards.costVariance.actual}%`,
                `${payload.kpiCards.costVariance.target}%`,
                `${payload.kpiCards.costVariance.variance}%`,
                payload.kpiCards.costVariance.status.toUpperCase()
            ]
        ];

        autoTable(doc, {
            startY: currentY,
            head: [["Metric", "Actual", "Target", "Variance", "Health Status"]],
            body: kpiTableRows,
            theme: "striped",
            headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            styles: { cellPadding: 2 }
        });

        // @ts-expect-error - jspdf-autotable augments doc with lastAutoTable
        currentY = (doc.lastAutoTable?.finalY || currentY + 45) + 8;

        // Detailed KPI & Evidence Section
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text("2. Traceable Calculations & Evidence Sources", 14, currentY);
        currentY += 4;

        const detailRows = payload.detailedRows.map((r) => [
            cleanPdfText(r.kpi),
            cleanPdfText(r.actual),
            cleanPdfText(r.target),
            cleanPdfText(r.variance),
            cleanPdfText(r.operationalScope)
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [["KPI", "Actual", "Target", "Variance", "Operational Scope"]],
            body: detailRows,
            theme: "grid",
            headStyles: { fillColor: [51, 65, 85], fontSize: 8, fontStyle: "bold" },
            bodyStyles: { fontSize: 7.5 },
            columnStyles: {
                0: { cellWidth: 36, fontStyle: "bold" },
                1: { cellWidth: 20 },
                2: { cellWidth: 22 },
                3: { cellWidth: 50 },
                4: { cellWidth: 54 }
            },
            styles: { cellPadding: 2.5 }
        });
    }

    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text("Manufacturing Management System - AI Executive Summary Report | EU AI Act Article 14 Advisory Notice", 14, 290);
        doc.text(`Page ${i} of ${pageCount}`, 180, 290);
    }

    return doc.output("arraybuffer");
}
