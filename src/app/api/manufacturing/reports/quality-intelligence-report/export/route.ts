import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { authorizeQualityIntelligenceReport } from "../auth";
import { buildQualityIntelligenceReport } from "../_report-service";
import type {
    QualityAICommentaryPayload,
    QualityFilters,
    QualityReportPayload
} from "@/modules/manufacturing-management/quality-intelligence-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportRequestBody {
    format: "pdf" | "xlsx";
    filters: QualityFilters;
    aiAnalysis?: QualityAICommentaryPayload | null;
}

function buildPrintableHtml(
    report: QualityReportPayload,
    aiAnalysis?: QualityAICommentaryPayload | null
): string {
    const kpis = report.kpis;
    const dateStr = new Date().toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const formatPct = (val: number | null) => (val !== null ? `${val.toFixed(1)}%` : "-");
    const formatNum = (val: number | null) => (val !== null ? val.toLocaleString() : "-");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quality Intelligence AI Report — ${report.meta.dateLabel}</title>
    <style>
        @media print {
            @page { margin: 1.5cm; size: auto; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #fff;
            margin: 0;
            padding: 24px;
            font-size: 12px;
            line-height: 1.5;
        }
        .header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }
        .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; }
        .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
        .meta { text-align: right; font-size: 11px; color: #475569; }
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 10px;
            margin-bottom: 24px;
        }
        .kpi-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px;
            background: #f8fafc;
        }
        .kpi-label { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #64748b; }
        .kpi-value { font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px; }
        .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
            margin: 20px 0 10px 0;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 20px;
        }
        th, td {
            border: 1px solid #e2e8f0;
            padding: 6px 8px;
            text-align: left;
        }
        th { background: #f1f5f9; font-weight: 700; color: #334155; }
        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
        }
        .badge-passed { background: #dcfce7; color: #166534; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-rejected { background: #fee2e2; color: #991b1b; }
        .ai-box {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 20px;
        }
        .ai-title { font-weight: 700; color: #0284c7; margin-bottom: 6px; }
        .print-btn-bar {
            position: fixed;
            top: 12px;
            right: 12px;
            background: #0f172a;
            color: #fff;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <button class="print-btn-bar no-print" onclick="window.print()">Print Report</button>

    <div class="header">
        <div>
            <h1 class="title">Quality Intelligence AI Report</h1>
            <div class="subtitle">Defect Pareto, First Pass Yield (FPY), Lot Traceability & Root-Cause Hypotheses</div>
        </div>
        <div class="meta">
            <div><strong>Period:</strong> ${report.meta.dateLabel}</div>
            <div><strong>Generated:</strong> ${dateStr}</div>
            <div><strong>Filter:</strong> ${report.meta.productLabel} | ${report.meta.workCenterLabel} | ${report.meta.statusLabel}</div>
        </div>
    </div>

    <!-- KPI Grid -->
    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-label">Defect Rate</div>
            <div class="kpi-value">${formatPct(kpis.defectRatePct)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">First Pass Yield</div>
            <div class="kpi-value">${formatPct(kpis.fpyPct)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Scrap Rate</div>
            <div class="kpi-value">${formatPct(kpis.scrapRatePct)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Repeat Defects</div>
            <div class="kpi-value">${kpis.repeatDefectCount}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">QA Hold Batches</div>
            <div class="kpi-value">${kpis.qaHoldBatchCount ?? 0}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Inspected Units</div>
            <div class="kpi-value">${formatNum(kpis.totalInspectedUnits)}</div>
        </div>
    </div>

    ${
        aiAnalysis
            ? `
    <div class="ai-box">
        <div class="ai-title">AI Insight</div>
        <p style="margin-top: 0;">${aiAnalysis.executiveSummary}</p>
        <strong>Verified Facts:</strong>
        <ul>
            ${aiAnalysis.verifiedFacts.map((f) => `<li>${f}</li>`).join("")}
        </ul>
        <strong>Identified Hypotheses & Containment Actions:</strong>
        <ul>
            ${aiAnalysis.hypotheses
                .map(
                    (h) => `<li><strong>[Hypothesis] ${h.title}:</strong> ${h.hypothesis} <br/><em>Action:</em> ${h.proposedAction}</li>`
                )
                .join("")}
        </ul>
    </div>
    `
            : ""
    }

    <!-- Defect Pareto Section -->
    <div class="section-title">Defect Pareto Analysis (Top Failure Drivers)</div>
    <table>
        <thead>
            <tr>
                <th>Defect / Inspection Parameter</th>
                <th>Defect Units</th>
                <th>Cumulative Share %</th>
                <th>Criticality</th>
            </tr>
        </thead>
        <tbody>
            ${
                report.defectPareto.length === 0
                    ? `<tr><td colspan="4" style="text-align:center;">No defect parameter failures logged.</td></tr>`
                    : report.defectPareto
                          .map(
                              (d) => `
                <tr>
                    <td><strong>${d.defectLabel}</strong></td>
                    <td>${d.defectQuantity.toLocaleString()}</td>
                    <td>${d.cumulativePct}%</td>
                    <td>${d.isCritical ? '<span class="badge badge-rejected">Critical</span>' : "Standard"}</td>
                </tr>
            `
                          )
                          .join("")
            }
        </tbody>
    </table>

    <!-- Lot Traceability Section -->
    <div class="section-title page-break">Lot Traceability & QA Records (${report.lotTrace.length} Evaluated Batches)</div>
    <table>
        <thead>
            <tr>
                <th>Job Order</th>
                <th>Product</th>
                <th>Output Lot &amp; Batch</th>
                <th>Line / Work Center</th>
                <th>Shift</th>
                <th>Produced</th>
                <th>Defects</th>
                <th>QA Status</th>
            </tr>
        </thead>
        <tbody>
            ${
                report.lotTrace.length === 0
                    ? `<tr><td colspan="8" style="text-align:center;">No batches found for selected filter criteria.</td></tr>`
                    : report.lotTrace
                          .slice(0, 30)
                          .map(
                              (jo) => `
                <tr>
                    <td><strong>${jo.jobOrderNo}</strong></td>
                    <td>${jo.productName}</td>
                    <td>
                        <div><strong>L:</strong> ${jo.finishedLotNumber || "-"}</div>
                        <div style="font-size: 10px; color: #64748b;"><strong>B:</strong> ${jo.finishedBatchNo || "-"}</div>
                    </td>
                    <td>${jo.workCenterName || "-"}</td>
                    <td>${jo.shiftName || "-"}</td>
                    <td>${jo.producedQty !== null ? jo.producedQty.toLocaleString() : "-"}</td>
                    <td>${jo.rejectedQty !== null ? jo.rejectedQty.toLocaleString() : "-"}</td>
                    <td>
                        <span class="badge ${
                            jo.qaStatus === "Passed"
                                ? "badge-passed"
                                : jo.qaStatus === "QA Hold"
                                ? "badge-warning"
                                : "badge-rejected"
                        }">${jo.qaStatus}</span>
                    </td>
                </tr>
            `
                          )
                          .join("")
            }
        </tbody>
    </table>
</body>
</html>`;
}

async function buildExcelWorkbook(
    report: QualityReportPayload,
    aiAnalysis?: QualityAICommentaryPayload | null
): Promise<ExcelJS.Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Manufacturing Quality Intelligence";
    wb.created = new Date();

    // Sheet 1: Quality KPIs & Summary
    const s1 = wb.addWorksheet("Quality KPIs");
    s1.columns = [
        { header: "Metric", key: "metric", width: 32 },
        { header: "Value", key: "val", width: 20 },
        { header: "Unit", key: "unit", width: 14 }
    ];
    s1.addRows([
        { metric: "Defect Rate", val: report.kpis.defectRatePct ?? "-", unit: "%" },
        { metric: "First Pass Yield (FPY)", val: report.kpis.fpyPct ?? "-", unit: "%" },
        { metric: "Scrap Rate", val: report.kpis.scrapRatePct ?? "-", unit: "%" },
        { metric: "Repeat Defect Types", val: report.kpis.repeatDefectCount, unit: "count" },
        { metric: "Total Inspected Units", val: report.kpis.totalInspectedUnits, unit: "units" },
        { metric: "Total Defective Units", val: report.kpis.totalDefectiveUnits, unit: "units" },
        { metric: "Total Scrap Units", val: report.kpis.totalScrapUnits, unit: "units" },
        { metric: "Total Job Orders Evaluated", val: report.kpis.totalJobOrders, unit: "orders" }
    ]);

    // Sheet 2: Defect Pareto
    const s2 = wb.addWorksheet("Defect Pareto");
    s2.columns = [
        { header: "Defect / Inspection Parameter", key: "label", width: 36 },
        { header: "Defect Quantity", key: "qty", width: 18 },
        { header: "Defective Units Count", key: "units", width: 22 },
        { header: "Cumulative %", key: "cum", width: 16 },
        { header: "Is Critical", key: "crit", width: 14 }
    ];
    for (const d of report.defectPareto) {
        s2.addRow({
            label: d.defectLabel,
            qty: d.defectQuantity,
            units: d.defectiveUnits,
            cum: `${d.cumulativePct}%`,
            crit: d.isCritical ? "YES" : "NO"
        });
    }

    // Sheet 3: Lot Traceability Matrix
    const s3 = wb.addWorksheet("Lot Traceability");
    s3.columns = [
        { header: "Job Order No", key: "joNo", width: 20 },
        { header: "Finished SKU", key: "sku", width: 28 },
        { header: "Output Lot", key: "lot", width: 20 },
        { header: "Output Batch", key: "batch", width: 20 },
        { header: "Line / Work Center", key: "wc", width: 22 },
        { header: "Shift", key: "shift", width: 16 },
        { header: "Operator", key: "op", width: 20 },
        { header: "Produced Qty", key: "produced", width: 16 },
        { header: "Defect Qty", key: "defect", width: 14 },
        { header: "Scrap Qty", key: "scrap", width: 14 },
        { header: "QA Status", key: "status", width: 16 },
        { header: "Component Genealogy (Lot & Batch)", key: "components", width: 50 }
    ];
    for (const jo of report.lotTrace) {
        const compStr = jo.componentBatches
            .map(
                (c) =>
                    `${c.componentProductName} [Lot: ${c.componentLotName || "-"}, Batch: ${c.componentBatchNo || "-"}, Qty: ${c.consumedQty}]`
            )
            .join("; ");
        s3.addRow({
            joNo: jo.jobOrderNo,
            sku: jo.productName,
            lot: jo.finishedLotNumber || "-",
            batch: jo.finishedBatchNo || "-",
            wc: jo.workCenterName ?? "-",
            shift: jo.shiftName ?? "-",
            op: jo.operatorName ?? "-",
            produced: jo.producedQty ?? "-",
            defect: jo.rejectedQty ?? 0,
            scrap: jo.scrapQty ?? 0,
            status: jo.qaStatus,
            components: compStr || "No genealogy link"
        });
    }

    // Sheet 4: AI Hypotheses & Containment
    if (aiAnalysis) {
        const s4 = wb.addWorksheet("AI Hypotheses");
        s4.columns = [
            { header: "Hypothesis Title", key: "title", width: 32 },
            { header: "Observation (Fact)", key: "obs", width: 40 },
            { header: "Hypothesis / Root-Cause", key: "hyp", width: 44 },
            { header: "Confidence", key: "conf", width: 14 },
            { header: "Proposed Containment Action", key: "action", width: 48 }
        ];
        for (const h of aiAnalysis.hypotheses) {
            s4.addRow({
                title: h.title,
                obs: h.observation,
                hyp: h.hypothesis,
                conf: h.confidence.toUpperCase(),
                action: h.proposedAction
            });
        }
    }

    return await wb.xlsx.writeBuffer();
}

export async function POST(request: Request) {
    const access = await authorizeQualityIntelligenceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as ExportRequestBody;
        const { format, filters, aiAnalysis } = body;

        const report = await buildQualityIntelligenceReport({
            filters,
            accessToken: access.accessToken,
            signal: request.signal
        });

        if (format === "pdf") {
            const html = buildPrintableHtml(report, aiAnalysis);
            return new NextResponse(html, {
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-cache"
                }
            });
        }

        if (format === "xlsx") {
            const buffer = await buildExcelWorkbook(report, aiAnalysis);
            return new NextResponse(buffer, {
                headers: {
                    "Content-Type":
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="Quality-Intelligence-Report-${new Date()
                        .toISOString()
                        .slice(0, 10)}.xlsx"`,
                    "Cache-Control": "no-cache"
                }
            });
        }

        return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to generate report export.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
