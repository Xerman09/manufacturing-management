import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { authorizeDemandForecastingReport } from "../auth";
import { buildDemandForecastReport } from "../_report-service";
import type {
    DemandAICommentaryPayload,
    DemandForecastFilters,
    DemandForecastReportPayload,
    ScenarioAssumptions
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/types";
import {
    computeAdjustedPlanningRows,
    formatNumberOrDash,
    formatPercentOrDash,
    getManilaDateString,
    getMatrixPredictionBounds
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/utils/scenarioMath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportRequestBody {
    format: "pdf" | "xlsx";
    filters: DemandForecastFilters;
    scenarioAssumptions: ScenarioAssumptions;
    aiCommentary?: DemandAICommentaryPayload | null;
}

async function buildExcelBuffer(
    report: DemandForecastReportPayload,
    assumptions: ScenarioAssumptions,
    aiCommentary?: DemandAICommentaryPayload | null
): Promise<ArrayBuffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Manufacturing Demand Forecasting AI Report";
    wb.created = new Date();

    const multiplier = Math.max(0, 1 + assumptions.demandAdjustmentPct / 100);
    const unitTag = report.kpis.isMixedUnits
        ? `Mixed (${report.kpis.activeUnits.join(", ")})`
        : report.kpis.activeUnits[0] || "units";

    // Sheet 1: Executive Summary & KPIs
    const sSummary = wb.addWorksheet("Executive Summary");
    sSummary.columns = [
        { header: "Field", key: "field", width: 34 },
        { header: "Value", key: "value", width: 52 }
    ];
    sSummary.addRows([
        { field: "Report", value: "Demand Forecasting AI Report" },
        { field: "Planning Cycle", value: report.meta.cadence.toUpperCase() },
        { field: "Historical Period", value: `${report.meta.periodLabel} (${report.meta.dateFrom} to ${report.meta.dateTo})` },
        { field: "Forecast Period", value: report.meta.forecastHorizonLabel },
        { field: "Branch", value: report.meta.branchLabel },
        { field: "Product Scope", value: report.meta.productLabel },
        { field: "Customer Region Scope", value: report.meta.regionLabel },
        { field: "Unit Scope", value: unitTag },
        {
            field: "Expected Demand (Baseline)",
            value: formatNumberOrDash(report.kpis.forecastUnits)
        },
        {
            field: "Expected Demand (Scenario)",
            value:
                report.kpis.forecastUnits !== null
                    ? formatNumberOrDash(Math.round(report.kpis.forecastUnits * multiplier))
                    : "-"
        },
        { field: "Forecast Error — WAPE (%)", value: formatPercentOrDash(report.kpis.wapePct) },
        { field: "Evaluated Actual Demand", value: formatNumberOrDash(report.kpis.evaluatedActualUnits) },
        { field: "Forecast Bias (%)", value: formatPercentOrDash(report.kpis.biasPct, 1, true) },
        {
            field: "Demand Trend",
            value: `${report.kpis.trendDirection} (${formatPercentOrDash(report.kpis.trendPct, 1, true)})`
        },
        {
            field: "Scenario Demand Adjustment",
            value: `${assumptions.demandAdjustmentPct >= 0 ? "+" : ""}${assumptions.demandAdjustmentPct}%`
        },
        { field: "Confidence Range", value: `${assumptions.confidenceLevel}%` },
        { field: "Safety Stock Days", value: `${assumptions.safetyStockDays} days` },
        { field: "Lead-Time Buffer", value: `${assumptions.leadTimeBufferDays} days` },
        { field: "Planner Note", value: assumptions.plannerNote || "-" },
        { field: "Generated At (PHT)", value: report.meta.freshnessCutoff }
    ]);

    // Sheet 2: Forecast & Accuracy Timeline
    const sTimeline = wb.addWorksheet("Forecast & Accuracy Trend");
    sTimeline.columns = [
        { header: "Period", key: "label", width: 18 },
        { header: "Type", key: "type", width: 14 },
        { header: "Actual Demand", key: "actual", width: 16 },
        { header: "Backtest Forecast", key: "backtest", width: 18 },
        { header: "Expected Demand", key: "forecast", width: 18 },
        { header: `Low (${assumptions.confidenceLevel}%)`, key: "piLower", width: 16 },
        { header: `High (${assumptions.confidenceLevel}%)`, key: "piUpper", width: 16 },
        { header: "Abs Error", key: "absErr", width: 14 },
        { header: "WAPE %", key: "wape", width: 12 },
        { header: "Bias %", key: "bias", width: 12 }
    ];
    for (const pt of report.timeSeries) {
        const lower =
            assumptions.confidenceLevel === 80
                ? pt.piLower80
                : assumptions.confidenceLevel === 95
                ? pt.piLower95
                : pt.piLower90;
        const upper =
            assumptions.confidenceLevel === 80
                ? pt.piUpper80
                : assumptions.confidenceLevel === 95
                ? pt.piUpper95
                : pt.piUpper90;
        sTimeline.addRow({
            label: pt.label,
            type: pt.isForecast ? "Forecast" : "Historical",
            actual: pt.actualUnits ?? "-",
            backtest: pt.backtestForecastUnits ?? "-",
            forecast:
                pt.forecastUnits !== null ? Math.round(pt.forecastUnits * multiplier) : "-",
            piLower: lower !== null ? Math.round(lower * multiplier) : "-",
            piUpper: upper !== null ? Math.round(upper * multiplier) : "-",
            absErr: pt.absErrorUnits ?? "-",
            wape: pt.wapePct !== null ? `${pt.wapePct}%` : "-",
            bias: pt.biasPct !== null ? `${pt.biasPct}%` : "-"
        });
    }

    // Sheet 3: Product x Region Matrix (reconciled exact sum)
    const sMatrix = wb.addWorksheet("Product & Region Matrix");
    sMatrix.columns = [
        { header: "Product Code", key: "code", width: 18 },
        { header: "Product Name", key: "name", width: 32 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Customer Region", key: "region", width: 24 },
        { header: "Rotation", key: "policy", width: 10 },
        { header: "Actual Orders", key: "actual", width: 14 },
        { header: "Expected Demand", key: "forecast", width: 16 },
        { header: `Low (${assumptions.confidenceLevel}%)`, key: "piLower", width: 14 },
        { header: `High (${assumptions.confidenceLevel}%)`, key: "piUpper", width: 14 },
        { header: "WAPE %", key: "wape", width: 12 },
        { header: "Bias %", key: "bias", width: 12 },
        { header: "Trend", key: "trend", width: 16 }
    ];
    for (const r of report.matrixRows) {
        const bounds = getMatrixPredictionBounds(r, assumptions.confidenceLevel);
        sMatrix.addRow({
            code: r.productCode,
            name: r.productName,
            unit: r.unitLabel,
            region: r.regionLabel,
            policy: r.inventoryPolicy,
            actual: r.historicalActualUnits,
            forecast: r.forecastUnits !== null ? Math.round(r.forecastUnits * multiplier) : "-",
            piLower: bounds.lower !== null ? Math.round(bounds.lower * multiplier) : "-",
            piUpper: bounds.upper !== null ? Math.round(bounds.upper * multiplier) : "-",
            wape: r.wapePct !== null ? `${r.wapePct}%` : "-",
            bias: r.biasPct !== null ? `${r.biasPct}%` : "-",
            trend: `${r.trendDirection} (${formatPercentOrDash(r.trendPct, 1, true)})`
        });
    }

    // Sheet 4: Suggested Planning Quantities (reconciled exact sum)
    const adjustedPlanning = computeAdjustedPlanningRows(report.planningRows, assumptions);
    const sPlan = wb.addWorksheet("Suggested Planning Quantities");
    sPlan.columns = [
        { header: "Product Code", key: "code", width: 18 },
        { header: "Product Name", key: "name", width: 30 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Rotation", key: "policy", width: 10 },
        { header: "Scenario Demand", key: "fc", width: 16 },
        { header: "Safety Stock", key: "ss", width: 14 },
        { header: "Usable On-Hand", key: "oh", width: 16 },
        { header: "Expiring ≤30d", key: "exp", width: 14 },
        { header: "Open JOs", key: "jo", width: 14 },
        { header: "Suggested Production", key: "prod", width: 20 },
        { header: "Batches", key: "batches", width: 12 },
        { header: "Labor Hrs", key: "labor", width: 14 },
        { header: "Est. 8h Shifts", key: "shifts", width: 14 },
        { header: "Status", key: "risk", width: 16 }
    ];
    for (const p of adjustedPlanning) {
        sPlan.addRow({
            code: p.productCode,
            name: p.productName,
            unit: p.unitLabel,
            policy: p.inventoryPolicy,
            fc: p.scenarioForecastUnits,
            ss: p.safetyStockUnits,
            oh: p.effectiveUsableOnhandUnits ?? "-",
            exp: p.expiringSoonUnits,
            jo: p.openJobOrderUnits,
            prod: p.suggestedProductionUnits ?? "-",
            batches: p.recommendedBatches ?? "-",
            labor: p.suggestedLaborHours ?? "-",
            shifts: p.suggestedShifts ?? "-",
            risk: p.planningRisk
        });
    }

    // Sheet 5: AI Commentary (if provided)
    if (aiCommentary) {
        const sAi = wb.addWorksheet("AI Commentary");
        sAi.columns = [
            { header: "Category", key: "cat", width: 16 },
            { header: "Severity", key: "sev", width: 12 },
            { header: "Title", key: "title", width: 34 },
            { header: "Analysis", key: "analysis", width: 52 },
            { header: "Recommended Action", key: "action", width: 46 },
            { header: "Owner", key: "owner", width: 26 }
        ];
        sAi.addRow({
            cat: "EXECUTIVE",
            sev: "INFO",
            title: "Executive Summary",
            analysis: aiCommentary.executiveSummary,
            action: aiCommentary.planningPriorities.join(" | "),
            owner: "Demand Planner"
        });
        for (const item of aiCommentary.commentaryItems) {
            sAi.addRow({
                cat: item.category.toUpperCase(),
                sev: item.severity.toUpperCase(),
                title: item.title,
                analysis: item.analysis,
                action: item.recommendedAction,
                owner: item.owner
            });
        }
    }

    return wb.xlsx.writeBuffer();
}

function buildPdfBuffer(
    report: DemandForecastReportPayload,
    assumptions: ScenarioAssumptions,
    aiCommentary?: DemandAICommentaryPayload | null
): ArrayBuffer {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const adjustedPlanning = computeAdjustedPlanningRows(report.planningRows, assumptions);
    const multiplier = Math.max(0, 1 + assumptions.demandAdjustmentPct / 100);
    const unitTag = report.kpis.isMixedUnits
        ? `Mixed (${report.kpis.activeUnits.join(", ")})`
        : report.kpis.activeUnits[0] || "units";

    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("Demand Forecasting AI Report", 40, 42);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
        `${report.meta.branchLabel} | ${report.meta.cadence.toUpperCase()} | Historical: ${report.meta.periodLabel} (${report.meta.dateFrom} to ${report.meta.dateTo}) | Horizon: ${report.meta.forecastHorizonLabel}`,
        40,
        58
    );
    doc.text(
        `Units: ${unitTag} | Scenario: ${assumptions.demandAdjustmentPct >= 0 ? "+" : ""}${assumptions.demandAdjustmentPct}% demand, ${assumptions.confidenceLevel}% confidence, ${assumptions.safetyStockDays}d safety stock | Generated: ${report.meta.freshnessCutoff}`,
        40,
        72
    );

    const rawLower =
        assumptions.confidenceLevel === 80
            ? report.kpis.piLower80
            : assumptions.confidenceLevel === 95
            ? report.kpis.piLower95
            : report.kpis.piLower90;
    const rawUpper =
        assumptions.confidenceLevel === 80
            ? report.kpis.piUpper80
            : assumptions.confidenceLevel === 95
            ? report.kpis.piUpper95
            : report.kpis.piUpper90;

    autoTable(doc, {
        startY: 86,
        head: [
            [
                "Expected Demand",
                `Range (${assumptions.confidenceLevel}%)`,
                "Forecast Error (WAPE)",
                "Forecast Bias",
                "Demand Trend",
                "Units"
            ]
        ],
        body: [
            [
                report.kpis.forecastUnits !== null
                    ? formatNumberOrDash(Math.round(report.kpis.forecastUnits * multiplier))
                    : "-",
                rawLower !== null && rawUpper !== null
                    ? `${formatNumberOrDash(Math.round(rawLower * multiplier))} - ${formatNumberOrDash(Math.round(rawUpper * multiplier))}`
                    : "-",
                formatPercentOrDash(report.kpis.wapePct),
                formatPercentOrDash(report.kpis.biasPct, 1, true),
                `${report.kpis.trendDirection} (${formatPercentOrDash(report.kpis.trendPct, 1, true)})`,
                unitTag
            ]
        ],
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [30, 41, 59] }
    });

    const afterKpiY =
        (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 140;

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(
        `Demand Forecast by Product & Customer Region (Top 15 of ${report.matrixRows.length})`,
        40,
        afterKpiY + 22
    );

    autoTable(doc, {
        startY: afterKpiY + 30,
        head: [
            [
                "Product",
                "Region",
                "Actual",
                "Expected",
                `Range (${assumptions.confidenceLevel}%)`,
                "WAPE",
                "Bias",
                "Trend"
            ]
        ],
        body: report.matrixRows.slice(0, 15).map((r) => {
            const b = getMatrixPredictionBounds(r, assumptions.confidenceLevel);
            const fcStr =
                r.forecastUnits !== null
                    ? `${formatNumberOrDash(Math.round(r.forecastUnits * multiplier))} ${r.unitLabel}`
                    : "-";
            const rangeStr =
                b.lower !== null && b.upper !== null
                    ? `${formatNumberOrDash(Math.round(b.lower * multiplier))} - ${formatNumberOrDash(Math.round(b.upper * multiplier))}`
                    : "-";
            return [
                `${r.productName} (${r.productCode})`,
                r.regionLabel,
                `${formatNumberOrDash(r.historicalActualUnits)} ${r.unitLabel}`,
                fcStr,
                rangeStr,
                formatPercentOrDash(r.wapePct),
                formatPercentOrDash(r.biasPct, 1, true),
                r.trendDirection
            ];
        }),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [51, 65, 85] }
    });

    doc.addPage("a4", "landscape");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("Suggested Inventory, Production & Labor Planning Quantities", 40, 42);

    autoTable(doc, {
        startY: 52,
        head: [
            [
                "Product",
                "Rotation",
                "Scenario Demand",
                "Safety Stock",
                "Usable On-Hand",
                "Open JOs",
                "Suggested Prod",
                "Labor Hrs",
                "Status"
            ]
        ],
        body: adjustedPlanning.slice(0, 18).map((p) => [
            `${p.productName} (${p.productCode})`,
            p.inventoryPolicy,
            `${formatNumberOrDash(p.scenarioForecastUnits)} ${p.unitLabel}`,
            formatNumberOrDash(p.safetyStockUnits),
            formatNumberOrDash(p.effectiveUsableOnhandUnits),
            formatNumberOrDash(p.openJobOrderUnits),
            formatNumberOrDash(p.suggestedProductionUnits),
            formatNumberOrDash(p.suggestedLaborHours, 1),
            p.planningRisk
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [15, 118, 110] }
    });

    if (aiCommentary) {
        const afterPlanY =
            (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 280;
        if (afterPlanY > 420) {
            doc.addPage("a4", "landscape");
        }
        const startAiY = afterPlanY > 420 ? 44 : afterPlanY + 24;
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("Reviewable AI Commentary (Advisory Only)", 40, startAiY);

        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        const wrapped = doc.splitTextToSize(aiCommentary.executiveSummary, 760);
        doc.text(wrapped, 40, startAiY + 16);

        autoTable(doc, {
            startY: startAiY + 24 + wrapped.length * 11,
            head: [["Category", "Observation", "Recommended Action", "Owner"]],
            body: aiCommentary.commentaryItems.map((i) => [
                i.category.toUpperCase(),
                `${i.title}: ${i.analysis}`,
                i.recommendedAction,
                i.owner
            ]),
            styles: { fontSize: 7.5, cellPadding: 4 },
            headStyles: { fillColor: [88, 28, 135] }
        });
    }

    return doc.output("arraybuffer");
}

export async function POST(request: Request) {
    const access = await authorizeDemandForecastingReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as ExportRequestBody;
        if (!body.filters || !body.scenarioAssumptions) {
            return NextResponse.json({ error: "Invalid export request parameters." }, { status: 400 });
        }

        // Recompute authoritative numbers strictly on the server (tamper-proof export)
        const serverReport = await buildDemandForecastReport({
            filters: body.filters,
            accessToken: access.accessToken,
            signal: request.signal
        });

        const manilaDate = getManilaDateString();
        const safeBranch = serverReport.meta.branchLabel.replace(/[^a-zA-Z0-9_-]+/g, "_");

        if (body.format === "xlsx") {
            const buffer = await buildExcelBuffer(
                serverReport,
                body.scenarioAssumptions,
                body.aiCommentary
            );
            return new Response(buffer, {
                status: 200,
                headers: {
                    "Content-Type":
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="Demand-Forecast-${safeBranch}-${manilaDate}.xlsx"`
                }
            });
        }

        const pdfBuffer = buildPdfBuffer(
            serverReport,
            body.scenarioAssumptions,
            body.aiCommentary
        );
        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="Demand-Forecast-${safeBranch}-${manilaDate}.pdf"`
            }
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to export demand forecasting report.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
