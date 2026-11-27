import { NextResponse } from "next/server";
import { authorizePredictiveMaintenanceReport } from "../auth";
import type { PredictiveMaintenanceReportPayload } from "@/modules/manufacturing-management/predictive-maintenance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportRequestBody {
    reportPayload: PredictiveMaintenanceReportPayload;
    format: "csv" | "json";
}

export async function POST(request: Request) {
    const access = await authorizePredictiveMaintenanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let body: ExportRequestBody;
    try {
        body = (await request.json()) as ExportRequestBody;
    } catch {
        return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
    }

    const { reportPayload, format } = body;
    if (!reportPayload) {
        return NextResponse.json({ error: "reportPayload is required." }, { status: 400 });
    }

    if (format === "json") {
        return new NextResponse(JSON.stringify(reportPayload, null, 2), {
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="Predictive_Maintenance_Report_${reportPayload.meta.reportId}.json"`
            }
        });
    }

    // Default CSV
    const rows: string[][] = [
        ["Predictive Maintenance Report - Vertex Technologies Corporation"],
        [`Report ID: ${reportPayload.meta.reportId}`, `Version: ${reportPayload.meta.version}`, `Status: ${reportPayload.meta.status}`],
        [`Cutoff Date: ${reportPayload.meta.cutoffDate}`, `Horizon: ${reportPayload.meta.horizonDays} days`],
        [],
        ["Asset ID", "Asset Name", "Serial", "Work Center", "Condition", "Criticality", "Run Hours", "Breakdowns", "Downtime (hrs)", "MTBF (hrs)", "Risk (%)", "Risk Level", "Primary Failure Mode", "Suggested Action"],
        ...reportPayload.assetRiskRows.map((r) => [
            String(r.assetId),
            `"${r.assetName.replace(/"/g, '""')}"`,
            r.serial || "-",
            `"${r.workCenterName.replace(/"/g, '""')}"`,
            r.condition,
            r.criticality,
            r.cumulativeRunHours.toFixed(1),
            String(r.breakdownCount),
            r.totalDowntimeHours.toFixed(1),
            r.mtbfHours !== null ? r.mtbfHours.toFixed(1) : "N/A",
            `${r.predictedBreakdownRiskPct.toFixed(1)}%`,
            r.riskLevel,
            `"${r.primaryFailureMode.replace(/"/g, '""')}"`,
            `"${r.suggestedAction.replace(/"/g, '""')}"`
        ])
    ];

    const csvContent = rows.map((e) => e.join(",")).join("\n");
    return new NextResponse(csvContent, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="Predictive_Maintenance_Report_${reportPayload.meta.reportId}.csv"`
        }
    });
}
