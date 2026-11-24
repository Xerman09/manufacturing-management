import { NextResponse } from "next/server";
import { authorizeProductionPerformanceReport } from "../auth";
import { runCoreAiAnalysis, parseJsonSafe } from "@/lib/ai";
import type {
    PPRBottleneckItem,
    PPRCorrectiveActionItem,
    PPRRiskFlagItem,
    ProductionAIAnalysisPayload,
    ProductionPerformanceReportPayload
} from "@/modules/manufacturing-management/production-performance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AiAnalysisRequestBody {
    reportPayload: ProductionPerformanceReportPayload;
}

interface RawAiOutput {
    executiveSummary?: string;
    keyObservations?: string[];
    bottlenecks?: PPRBottleneckItem[];
    correctiveActions?: PPRCorrectiveActionItem[];
    riskFlags?: PPRRiskFlagItem[];
}

function buildDeterministicAnalysis(report: ProductionPerformanceReportPayload): RawAiOutput {
    const kpis = report.kpis;
    const topLoss = report.topLossDrivers.slice(0, 3);
    const worstWorkCenter = [...report.workCenterThroughput].sort(
        (a, b) => (b.avgScrapRatePct || 0) - (a.avgScrapRatePct || 0)
    )[0];
    const criticalFails = report.qaParameterSummary.filter((p) => p.isCritical && p.failedChecks > 0);

    const yieldLabel = kpis.avgYieldRatePct !== null ? `${kpis.avgYieldRatePct}%` : "undetermined";
    const scrapLabel = kpis.avgScrapRatePct !== null ? `${kpis.avgScrapRatePct}%` : "undetermined";
    const qaLabel = kpis.qaPassRatePct !== null ? `${kpis.qaPassRatePct}%` : "undetermined";
    const oeeLabel = kpis.oeePct !== null ? `${kpis.oeePct}%` : "undetermined";

    const executiveSummary = `During this reporting window (${report.meta.dateLabel}), production operated at an estimated OEE of ${oeeLabel} and maintained an overall yield rate of ${yieldLabel} against an average scrap rate of ${scrapLabel} and a QA pass rate of ${qaLabel}. Primary loss concentration occurred across ${
        topLoss.map((l) => `${l.label} (${l.lossQty.toLocaleString()} units)`).join(", ") || "standard operations"
    }. Recommended interventions focus on bottleneck station scrap reduction, preventive asset maintenance, and critical parameter control.`;

    const keyObservations: string[] = [
        `Production reached an estimated OEE of ${oeeLabel} with an average yield rate of ${yieldLabel} across ${kpis.totalJobOrders} evaluated job orders.`,
        kpis.avgScrapRatePct !== null && kpis.avgScrapRatePct > 3
            ? `Scrap rate (${scrapLabel}) exceeds standard tolerance of 3.0%, representing significant raw material variance.`
            : `Scrap rate remained controlled within operational tolerance at ${scrapLabel}.`,
        worstWorkCenter
            ? `Work center '${worstWorkCenter.workCenterName}' exhibited the highest scrap intensity at ${worstWorkCenter.avgScrapRatePct}%.`
            : "Work center distribution showed balanced operational throughput.",
        criticalFails.length > 0
            ? `${criticalFails.length} critical QA parameters encountered inspection failures requiring immediate calibration.`
            : "Zero critical QA parameters failed during final or in-process verification."
    ];

    const bottlenecks: PPRBottleneckItem[] = [];

    if (topLoss.length > 0) {
        bottlenecks.push({
            id: "btn-1",
            area: `${topLoss[0].label} (${topLoss[0].lossType.replace("_", " ").toUpperCase()})`,
            impact: `Accounts for ${topLoss[0].percentageOfTotal || 0}% of all recorded production volume losses (${topLoss[0].lossQty.toLocaleString()} units).`,
            severity: "high",
            evidence: `Recorded in yield ledger & scrap logs for ${report.meta.dateLabel}.`
        });
    }

    if (worstWorkCenter && (worstWorkCenter.avgScrapRatePct || 0) > 2) {
        bottlenecks.push({
            id: "btn-2",
            area: `Station: ${worstWorkCenter.workCenterName}`,
            impact: `Elevated station scrap rate of ${worstWorkCenter.avgScrapRatePct}% across ${worstWorkCenter.jobOrderCount} batches.`,
            severity: worstWorkCenter.avgScrapRatePct! > 5 ? "critical" : "medium",
            evidence: `Throughput log shows ${worstWorkCenter.actualQty.toLocaleString()} produced units with active scrap generation.`
        });
    }

    if (kpis.totalDowntimeHrs && kpis.totalDowntimeHrs > 0) {
        bottlenecks.push({
            id: "btn-3",
            area: "Machine & Asset Availability",
            impact: `Total unplanned maintenance downtime accumulated to ${kpis.totalDowntimeHrs} hours across reporting period.`,
            severity: kpis.totalDowntimeHrs > 10 ? "high" : "medium",
            evidence: `${report.downtimeEvents.length} breakdown maintenance incidents logged in asset registry.`
        });
    }

    const correctiveActions: PPRCorrectiveActionItem[] = [
        {
            id: "act-1",
            title: `Station Recalibration for ${worstWorkCenter?.workCenterName || "Primary Routing"}`,
            description:
                "Conduct mechanical inspection, tooling alignment, and speed calibration on machinery to eliminate station-specific scrap generation.",
            priority: "high",
            targetMetric: "Scrap Rate",
            expectedImprovement: "Expected 1.5% to 2.5% scrap rate reduction within 14 days."
        },
        {
            id: "act-2",
            title: "Standardize Operator In-Process QA Gateways",
            description:
                "Enforce mandatory check frequency at critical routing steps prior to final batch completion to prevent late-stage batch quarantine.",
            priority: criticalFails.length > 0 ? "critical" : "medium",
            targetMetric: "QA Pass Rate",
            expectedImprovement: "Target 99.0%+ first-pass yield and zero critical quarantine holds."
        },
        {
            id: "act-3",
            title: "Targeted Preventive Maintenance on High-Hour Assets",
            description:
                "Schedule off-shift preventive maintenance routines on frequently halted equipment to prevent unplanned cycle downtime.",
            priority: "medium",
            targetMetric: "Asset Uptime",
            expectedImprovement: "Reduce total downtime hours by 30% next cycle."
        }
    ];

    const riskFlags: PPRRiskFlagItem[] = [];
    if (kpis.avgScrapRatePct && kpis.avgScrapRatePct > 5) {
        riskFlags.push({
            id: "risk-1",
            flag: "Excess Material Scrap Loss",
            detail: "Current scrap rate exceeds industry safety tolerance, driving unabsorbed BOM cost variance.",
            severity: "high"
        });
    }
    if (criticalFails.length > 0) {
        riskFlags.push({
            id: "risk-2",
            flag: "Critical QA Parameter Non-Compliance",
            detail: `${criticalFails.map((c) => c.parameterName).join(", ")} recorded non-passing values.`,
            severity: "high"
        });
    }
    if (kpis.avgYieldRatePct && kpis.avgYieldRatePct < 85) {
        riskFlags.push({
            id: "risk-3",
            flag: "Below-Target Yield Completion",
            detail: "Job order completion rates are lagging target requirements, presenting delivery schedule risk.",
            severity: "medium"
        });
    }

    return {
        executiveSummary,
        keyObservations,
        bottlenecks,
        correctiveActions,
        riskFlags
    };
}

export async function POST(request: Request) {
    const access = await authorizeProductionPerformanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as AiAnalysisRequestBody;
        const report = body.reportPayload;

        if (!report || !report.kpis) {
            return NextResponse.json({ error: "Invalid report payload provided." }, { status: 400 });
        }

        const domainSystemInstruction = `
You are an expert Manufacturing Operations & Production Performance AI Analyst.
Analyze the provided manufacturing production report containing job orders, yield rates, scrap rates, work center throughput, downtime events, and QA inspection parameters.
Analyze production trends, identify bottlenecks and loss drivers, and propose high-impact corrective actions.

Rules:
1. Reference ONLY numbers, names, work centers, and parameters present in the payload. Do not invent metrics.
2. Return ONLY clean JSON matching this exact structure:
{
  "executiveSummary": "2-3 sentences synthesizing production health, yield, scrap trends, and OEE",
  "keyObservations": ["Observation 1", "Observation 2", "Observation 3", "Observation 4"],
  "bottlenecks": [
    {
      "id": "btn-1",
      "area": "Specific process, product, or work center",
      "impact": "Quantified loss or throughput drag",
      "severity": "critical" | "high" | "medium" | "low",
      "evidence": "Citing specific data from report"
    }
  ],
  "correctiveActions": [
    {
      "id": "act-1",
      "title": "Actionable title",
      "description": "Specific action to take",
      "priority": "critical" | "high" | "medium" | "low",
      "targetMetric": "Yield Rate | Scrap Rate | QA Pass Rate | Downtime | OEE",
      "expectedImprovement": "Quantified expected gain"
    }
  ],
  "riskFlags": [
    {
      "id": "risk-1",
      "flag": "Short title",
      "detail": "Description of operational risk",
      "severity": "high" | "medium" | "low"
    }
  ]
}
`.trim();

        const buildPrompt = () =>
            JSON.stringify(
                {
                    scope: {
                        dateRange: report.meta.dateLabel,
                        product: report.meta.productLabel,
                        workCenter: report.meta.workCenterLabel,
                        status: report.meta.statusLabel
                    },
                    kpis: report.kpis,
                    topLossDrivers: report.topLossDrivers.slice(0, 6),
                    workCenterThroughput: report.workCenterThroughput.slice(0, 6),
                    qaParameterSummary: report.qaParameterSummary.slice(0, 6),
                    defectPareto: report.defectPareto.slice(0, 6),
                    downtimeSummary: {
                        totalEvents: report.downtimeEvents.length,
                        totalHours: report.kpis.totalDowntimeHrs,
                        sampleEvents: report.downtimeEvents.slice(0, 3)
                    }
                },
                null,
                2
            );

        const coreRes = await runCoreAiAnalysis<ProductionPerformanceReportPayload, RawAiOutput>(
            {
                moduleName: "production-performance-report",
                tierSlug: "pro",
                payload: report,
                domainSystemInstruction,
                buildPrompt,
                fallbackEngine: (sanitized) => buildDeterministicAnalysis(sanitized),
                parseResponse: (rawText) => parseJsonSafe<RawAiOutput>(rawText),
                sanitization: {
                    stripSensitiveKeys: true,
                    redactPii: true,
                    maxItemsCap: 50
                }
            },
            2
        );

        const data = coreRes.data || {};
        const fallback = buildDeterministicAnalysis(report);

        const finalPayload: ProductionAIAnalysisPayload = {
            executiveSummary: String(data.executiveSummary || fallback.executiveSummary || ""),
            keyObservations:
                Array.isArray(data.keyObservations) && data.keyObservations.length > 0
                    ? data.keyObservations.map(String)
                    : fallback.keyObservations || [],
            bottlenecks:
                Array.isArray(data.bottlenecks) && data.bottlenecks.length > 0
                    ? data.bottlenecks
                    : fallback.bottlenecks || [],
            correctiveActions:
                Array.isArray(data.correctiveActions) && data.correctiveActions.length > 0
                    ? data.correctiveActions
                    : fallback.correctiveActions || [],
            riskFlags:
                Array.isArray(data.riskFlags) && data.riskFlags.length > 0
                    ? data.riskFlags
                    : fallback.riskFlags || [],
            meta: {
                modelUsed: coreRes.governance?.modelUsed || "Gemini 2.5 Flash",
                isFallback: Boolean(coreRes.governance?.isFallback),
                generatedAt: new Date().toISOString(),
                freshnessCutoff: report.meta.freshnessCutoff
            }
        };

        return NextResponse.json(finalPayload);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to generate AI production analysis.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
