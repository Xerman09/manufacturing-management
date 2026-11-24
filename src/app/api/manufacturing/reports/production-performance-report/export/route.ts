import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { authorizeProductionPerformanceReport } from "../auth";
import { buildProductionPerformanceReport } from "../_report-service";
import type {
    ProductionAIAnalysisPayload,
    ProductionPerformanceFilters,
    ProductionPerformanceReportPayload
} from "@/modules/manufacturing-management/production-performance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportRequestBody {
    format: "pdf" | "xlsx";
    filters: ProductionPerformanceFilters;
    aiAnalysis?: ProductionAIAnalysisPayload | null;
}

function buildPrintableHtml(
    report: ProductionPerformanceReportPayload,
    aiAnalysis?: ProductionAIAnalysisPayload | null
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
    <title>Production Performance AI Report — ${report.meta.dateLabel}</title>
    <style>
        @media print {
            @page { margin: 1.5cm; size: auto; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
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
        .ai-box {
            background: #f5f3ff;
            border: 1px solid #ddd6fe;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 20px;
        }
        .ai-title { font-weight: 700; color: #6d28d9; margin-bottom: 6px; }
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
    <div class="print-btn-bar no-print" onclick="window.print()">Print Report (Ctrl+P)</div>

    <div class="header">
        <div>
            <h1 class="title">Production Performance AI Report</h1>
            <div class="subtitle">Scope: ${report.meta.dateLabel} · ${report.meta.productLabel} · ${report.meta.workCenterLabel}</div>
        </div>
        <div class="meta">
            <div><strong>Generated:</strong> ${dateStr}</div>
            <div><strong>Status:</strong> ${report.meta.statusLabel}</div>
        </div>
    </div>

    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-label">Estimated OEE</div>
            <div class="kpi-value">${formatPct(kpis.oeePct)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Yield Rate</div>
            <div class="kpi-value">${formatPct(kpis.avgYieldRatePct)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Scrap Rate</div>
            <div class="kpi-value">${formatPct(kpis.avgScrapRatePct)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">QA Pass Rate</div>
            <div class="kpi-value">${formatPct(kpis.qaPassRatePct)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Avg Cycle Time</div>
            <div class="kpi-value">${kpis.avgCycleTimeHrs !== null ? `${kpis.avgCycleTimeHrs} hrs` : "-"}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Total Downtime</div>
            <div class="kpi-value">${kpis.totalDowntimeHrs !== null ? `${kpis.totalDowntimeHrs} hrs` : "0.0 hrs"}</div>
        </div>
    </div>

    ${
        aiAnalysis
            ? `<div class="ai-box">
        <div class="ai-title">AI Production Performance Insights & Corrective Actions</div>
        <p style="margin: 0 0 8px 0;">${aiAnalysis.executiveSummary}</p>
        <strong>Proposed Corrective Actions:</strong>
        <ul style="margin: 4px 0 0 0; padding-left: 20px;">
            ${aiAnalysis.correctiveActions
                .map((a) => `<li><strong>${a.title}</strong> (${a.targetMetric}) — ${a.description} <em>[${a.expectedImprovement}]</em></li>`)
                .join("")}
        </ul>
    </div>`
            : ""
    }

    <div class="section-title">Job Orders Production Performance (${report.jobOrders.length} orders)</div>
    <table>
        <thead>
            <tr>
                <th>JO No</th>
                <th>Product Name</th>
                <th>Status</th>
                <th>Start Date</th>
                <th>Target Qty</th>
                <th>Actual Qty</th>
                <th>Yield %</th>
                <th>Scrap %</th>
                <th>QA Pass %</th>
                <th>Cycle Time</th>
            </tr>
        </thead>
        <tbody>
            ${report.jobOrders
                .slice(0, 100)
                .map(
                    (j) => `<tr>
                <td><strong>${j.jobOrderNo}</strong></td>
                <td>${j.productName}</td>
                <td>${j.status}</td>
                <td>${j.startDate || "-"}</td>
                <td>${formatNum(j.targetQty)}</td>
                <td>${formatNum(j.actualQtyProduced)}</td>
                <td>${formatPct(j.yieldRatePct)}</td>
                <td>${formatPct(j.scrapRatePct)}</td>
                <td>${formatPct(j.qaPassRatePct)}</td>
                <td>${j.cycleTimeHrs !== null ? `${j.cycleTimeHrs}h` : "-"}</td>
            </tr>`
                )
                .join("")}
        </tbody>
    </table>

    <div class="section-title">Top Loss Drivers & Bottlenecks</div>
    <table>
        <thead>
            <tr>
                <th>Source / Area</th>
                <th>Type</th>
                <th>Loss Volume</th>
                <th>% of Total Loss</th>
            </tr>
        </thead>
        <tbody>
            ${report.topLossDrivers
                .map(
                    (l) => `<tr>
                <td><strong>${l.label}</strong></td>
                <td>${l.lossType.toUpperCase()}</td>
                <td>${formatNum(l.lossQty)}</td>
                <td>${l.percentageOfTotal ? `${l.percentageOfTotal}%` : "-"}</td>
            </tr>`
                )
                .join("")}
        </tbody>
    </table>

    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
        };
    </script>
</body>
</html>`;
}

async function buildExcelWorkbook(
    report: ProductionPerformanceReportPayload,
    aiAnalysis?: ProductionAIAnalysisPayload | null
): Promise<ArrayBuffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Production Performance AI Report";
    wb.created = new Date();

    // Sheet 1: Summary KPIs
    const s1 = wb.addWorksheet("KPI Summary");
    s1.columns = [
        { header: "Metric / Field", key: "field", width: 36 },
        { header: "Value", key: "value", width: 44 }
    ];
    s1.addRows([
        { field: "Reporting Window", value: report.meta.dateLabel },
        { field: "Product Scope", value: report.meta.productLabel },
        { field: "Work Center Scope", value: report.meta.workCenterLabel },
        { field: "Status Scope", value: report.meta.statusLabel },
        { field: "Estimated OEE", value: report.kpis.oeePct !== null ? `${report.kpis.oeePct}%` : "-" },
        { field: "Total Job Orders Evaluated", value: report.kpis.totalJobOrders },
        { field: "Completed Job Orders", value: report.kpis.completedJobOrders },
        { field: "Average Yield Rate", value: report.kpis.avgYieldRatePct !== null ? `${report.kpis.avgYieldRatePct}%` : "-" },
        { field: "Average Scrap Rate", value: report.kpis.avgScrapRatePct !== null ? `${report.kpis.avgScrapRatePct}%` : "-" },
        { field: "Average Rejection Rate", value: report.kpis.avgRejectionRatePct !== null ? `${report.kpis.avgRejectionRatePct}%` : "-" },
        { field: "Overall QA Pass Rate", value: report.kpis.qaPassRatePct !== null ? `${report.kpis.qaPassRatePct}%` : "-" },
        { field: "Average Cycle Time (Hours)", value: report.kpis.avgCycleTimeHrs !== null ? report.kpis.avgCycleTimeHrs : "-" },
        { field: "Total Downtime (Hours)", value: report.kpis.totalDowntimeHrs !== null ? report.kpis.totalDowntimeHrs : 0 }
    ]);

    // Sheet 2: Job Orders
    const s2 = wb.addWorksheet("Job Orders");
    s2.columns = [
        { header: "Job Order No", key: "joNo", width: 22 },
        { header: "Product Name", key: "productName", width: 32 },
        { header: "Status", key: "status", width: 16 },
        { header: "Start Date", key: "startDate", width: 14 },
        { header: "End Date", key: "endDate", width: 14 },
        { header: "Target Qty", key: "targetQty", width: 14 },
        { header: "Actual Qty", key: "actualQty", width: 14 },
        { header: "Completed Qty", key: "completedQty", width: 14 },
        { header: "Rejected Qty", key: "rejectedQty", width: 14 },
        { header: "Yield Rate %", key: "yieldRate", width: 14 },
        { header: "Scrap Rate %", key: "scrapRate", width: 14 },
        { header: "QA Pass %", key: "qaPassRate", width: 14 },
        { header: "Cycle Time (h)", key: "cycleTime", width: 14 },
        { header: "Work Center", key: "workCenter", width: 24 }
    ];

    for (const jo of report.jobOrders) {
        s2.addRow({
            joNo: jo.jobOrderNo,
            productName: jo.productName,
            status: jo.status,
            startDate: jo.startDate || "-",
            endDate: jo.endDate || "-",
            targetQty: jo.targetQty,
            actualQty: jo.actualQtyProduced ?? "-",
            completedQty: jo.completedQty ?? "-",
            rejectedQty: jo.rejectedQty ?? 0,
            yieldRate: jo.yieldRatePct !== null ? `${jo.yieldRatePct}%` : "-",
            scrapRate: jo.scrapRatePct !== null ? `${jo.scrapRatePct}%` : "-",
            qaPassRate: jo.qaPassRatePct !== null ? `${jo.qaPassRatePct}%` : "-",
            cycleTime: jo.cycleTimeHrs !== null ? jo.cycleTimeHrs : "-",
            workCenter: jo.workCenterName || "-"
        });
    }

    // Sheet 3: Top Loss Drivers
    const s3 = wb.addWorksheet("Loss Drivers");
    s3.columns = [
        { header: "Area / Driver", key: "label", width: 32 },
        { header: "Type", key: "type", width: 16 },
        { header: "Loss Quantity", key: "qty", width: 18 },
        { header: "% of Total Losses", key: "pct", width: 20 }
    ];
    for (const loss of report.topLossDrivers) {
        s3.addRow({
            label: loss.label,
            type: loss.lossType.toUpperCase(),
            qty: loss.lossQty,
            pct: loss.percentageOfTotal !== null ? `${loss.percentageOfTotal}%` : "-"
        });
    }

    // Sheet 4: Work Center Throughput
    const s4 = wb.addWorksheet("Work Centers");
    s4.columns = [
        { header: "Work Center", key: "name", width: 28 },
        { header: "Actual Qty", key: "actual", width: 16 },
        { header: "Design Capacity Qty", key: "cap", width: 20 },
        { header: "Utilization %", key: "util", width: 16 },
        { header: "Avg Scrap Rate %", key: "scrap", width: 18 },
        { header: "Batches Processed", key: "count", width: 18 }
    ];
    for (const wc of report.workCenterThroughput) {
        s4.addRow({
            name: wc.workCenterName,
            actual: wc.actualQty,
            cap: wc.capacityQty ?? "-",
            util: wc.utilizationPct !== null ? `${wc.utilizationPct}%` : "-",
            scrap: wc.avgScrapRatePct !== null ? `${wc.avgScrapRatePct}%` : "-",
            count: wc.jobOrderCount
        });
    }

    // Sheet 5: AI Recommendations
    if (aiAnalysis) {
        const s5 = wb.addWorksheet("AI Actions");
        s5.columns = [
            { header: "Title", key: "title", width: 32 },
            { header: "Target Metric", key: "metric", width: 20 },
            { header: "Priority", key: "priority", width: 14 },
            { header: "Action Description", key: "desc", width: 48 },
            { header: "Expected Improvement", key: "improvement", width: 36 }
        ];
        for (const act of aiAnalysis.correctiveActions) {
            s5.addRow({
                title: act.title,
                metric: act.targetMetric,
                priority: act.priority.toUpperCase(),
                desc: act.description,
                improvement: act.expectedImprovement
            });
        }
    }

    return await wb.xlsx.writeBuffer();
}

export async function POST(request: Request) {
    const access = await authorizeProductionPerformanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as ExportRequestBody;
        const { format, filters, aiAnalysis } = body;

        const report = await buildProductionPerformanceReport({
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
                    "Content-Disposition": `attachment; filename="Production-Performance-Report-${new Date()
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
