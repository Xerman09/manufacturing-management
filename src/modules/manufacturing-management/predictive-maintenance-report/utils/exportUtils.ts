/**
 * Client-side Export Utility for Predictive Maintenance Report
 */

import type { PredictiveMaintenanceReportPayload } from "../types";

export function exportToCsv(payload: PredictiveMaintenanceReportPayload) {
    const rows: string[][] = [
        ["Predictive Maintenance Report - Vertex Technologies Corporation"],
        [`Report ID: ${payload.meta.reportId}`, `Version: ${payload.meta.version}`, `Status: ${payload.meta.status}`],
        [`Cutoff Date: ${payload.meta.cutoffDate}`, `Horizon: ${payload.meta.horizonDays} days`, `Generated: ${payload.meta.generatedAt}`],
        [],
        ["--- FLEET SUMMARY KPIS ---"],
        ["Fleet Risk Score", `${payload.kpis.fleetRiskScore}% (${payload.kpis.fleetRiskLevel})`],
        ["High Risk Assets Count", `${payload.kpis.highRiskAssetCount} / ${payload.kpis.totalAssetsEvaluated}`],
        ["Fleet MTBF (Hours)", payload.kpis.fleetMtbfHours !== null ? `${payload.kpis.fleetMtbfHours.toFixed(1)} hrs` : "Unavailable (0 Breakdowns)"],
        ["Fleet MTTR (Hours)", payload.kpis.fleetMttrHours !== null ? `${payload.kpis.fleetMttrHours.toFixed(1)} hrs` : "Unavailable"],
        ["Total Run Hours", `${payload.kpis.totalOperatingRunHours.toFixed(1)} hrs`],
        ["Telemetry Sensor Status", payload.kpis.telemetryMode],
        [],
        ["--- ASSET BREAKDOWN RISK RANKING ---"],
        [
            "Asset ID",
            "Asset Name",
            "Serial",
            "Work Center",
            "Condition",
            "Criticality",
            "Cumulative Run Hours",
            "Breakdowns",
            "Total Downtime (hrs)",
            "MTBF (hrs)",
            "Predicted Risk (%)",
            "Risk Level",
            "Primary Failure Mode",
            "Suggested Action"
        ],
        ...payload.assetRiskRows.map((r) => [
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
        ]),
        [],
        ["--- ACTION ITEMS & PLANNER RECOMMENDATIONS ---"],
        ["Action ID", "Asset", "Recommendation Title", "Assigned Owner", "Due Date", "Status"],
        ...payload.actions.map((a) => [
            a.id,
            `"${a.assetName.replace(/"/g, '""')}"`,
            `"${a.title.replace(/"/g, '""')}"`,
            `"${a.owner.replace(/"/g, '""')}"`,
            a.dueDate,
            a.status
        ])
    ];

    const csvContent = rows.map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Predictive_Maintenance_Report_${payload.meta.reportId}_v${payload.meta.version}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
