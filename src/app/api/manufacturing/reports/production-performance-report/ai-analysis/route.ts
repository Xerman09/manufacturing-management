import { NextResponse } from "next/server";
import { authorizeProductionPerformanceReport } from "../auth";
import { resolveServerAiTier } from "../_report-service";
import { runCoreAiAnalysis, parseJsonSafe } from "@/lib/ai";
import type { GlobalAiTierSlug } from "@/lib/ai";
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

    const measured = [
        kpis.oeePct !== null && `estimated OEE ${oeeLabel}`,
        kpis.avgYieldRatePct !== null && `yield rate ${yieldLabel}`,
        kpis.avgScrapRatePct !== null && `scrap rate ${scrapLabel}`,
        kpis.qaPassRatePct !== null && `QA pass rate ${qaLabel}`
    ]
        .filter(Boolean)
        .join(", ");

    const executiveSummary = `For ${report.meta.dateLabel}, ${kpis.totalJobOrders} job orders were evaluated${
        measured ? `, returning ${measured}.` : ", and none of the headline rates could be derived from the recorded data."
    } ${
        topLoss.length > 0
            ? `Recorded loss concentrates in ${topLoss
                  .map((l) => `${l.label} (${l.lossQty.toLocaleString()} units)`)
                  .join(", ")}.`
            : "No scrap or rejected quantities were recorded in this scope."
    }`;

    const keyObservations: string[] = [
        kpis.totalJobOrders > 0
            ? `${kpis.totalJobOrders} job orders evaluated: OEE ${oeeLabel}, average yield ${yieldLabel}.`
            : "No job orders fell within the selected scope.",
        kpis.avgScrapRatePct !== null
            ? `Scrap measured at ${scrapLabel} across ${kpis.totalJobOrders} evaluated job orders.`
            : "Scrap rate undetermined — no yield ledger rows in the selected scope.",
        worstWorkCenter?.avgScrapRatePct != null
            ? `Work center '${worstWorkCenter.workCenterName}' exhibited the highest scrap intensity at ${worstWorkCenter.avgScrapRatePct}%.`
            : "No work center recorded scrap in the selected scope.",
        criticalFails.length > 0
            ? `${criticalFails.length} critical QA parameters encountered inspection failures: ${criticalFails
                  .map((c) => c.parameterName)
                  .join(", ")}.`
            : "No critical QA parameters recorded a failed check in the selected scope."
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

    const correctiveActions: PPRCorrectiveActionItem[] = [];

    if (worstWorkCenter) {
        correctiveActions.push({
            id: "act-1",
            title: `Station Recalibration for ${worstWorkCenter.workCenterName}`,
            description:
                "Inspect mechanical condition, tooling alignment and feed speed on the station carrying the highest recorded scrap share.",
            priority: worstWorkCenter.avgScrapRatePct && worstWorkCenter.avgScrapRatePct > 5 ? "critical" : "high",
            targetMetric: "Scrap Rate"
        });
    }

    correctiveActions.push({
        id: "act-2",
        title: "Review In-Process QA Check Frequency",
        description: criticalFails.length > 0
            ? `Increase check frequency at the steps producing ${criticalFails
                  .map((c) => c.parameterName)
                  .join(", ")} so failures are caught before batch completion.`
            : "Confirm in-process checks are being recorded at each routing step before final batch completion.",
        priority: criticalFails.length > 0 ? "critical" : "medium",
        targetMetric: "QA Pass Rate"
    });

    if (kpis.totalDowntimeHrs && kpis.totalDowntimeHrs > 0) {
        correctiveActions.push({
            id: "act-3",
            title: "Schedule Preventive Maintenance on Halted Assets",
            description: `Plan off-shift maintenance for the ${
                report.downtimeEvents.length
            } assets logged with breakdown events totalling ${kpis.totalDowntimeHrs} hours.`,
            priority: kpis.totalDowntimeHrs > 10 ? "high" : "medium",
            targetMetric: "Asset Uptime"
        });
    }

    const riskFlags: PPRRiskFlagItem[] = [];
    if (kpis.avgScrapRatePct && kpis.avgScrapRatePct > 5) {
        riskFlags.push({
            id: "risk-1",
            flag: "Excess Material Scrap Loss",
            detail: `Scrap measured at ${kpis.avgScrapRatePct}% of production volume for ${report.meta.dateLabel}.`,
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
            detail: `Average yield of ${kpis.avgYieldRatePct}% is below the 85% level this report colours as attention.`,
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

        // Server-side AI tier verification (never trust client-supplied tier)
        const tierInfo = await resolveServerAiTier(request.signal);
        if (!tierInfo.assigned || tierInfo.tierLevel === 0 || tierInfo.tierSlug === "unassigned") {
            return NextResponse.json(
                { error: "AI Operations & Quality Insight is not assigned to this module." },
                { status: 403 }
            );
        }

        const requestedTier: GlobalAiTierSlug =
            tierInfo.tierSlug === "executive" || tierInfo.tierSlug === "pro" || tierInfo.tierSlug === "basic"
                ? tierInfo.tierSlug
                : "basic";

        const domainSystemInstruction = `
You are an expert Manufacturing Operations & Production Performance AI Analyst.
Analyze the provided manufacturing production report containing job orders, yield rates, scrap rates, work center throughput, downtime events, and QA inspection parameters.
Analyze production trends, identify bottlenecks and loss drivers, and propose high-impact corrective actions.

Rules:
1. Reference ONLY numbers, names, work centers, and parameters present in the payload. Do not invent metrics, tolerance thresholds, or forecasted improvement percentages.
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
      "targetMetric": "Yield Rate | Scrap Rate | QA Pass Rate | Downtime | OEE"
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
                tierSlug: requestedTier,
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
            tierInfo.tierLevel
        );

        // coreRes.data is already the deterministic engine's output whenever isFallback is set, so the
        // payload is never a blend of model and rule text under one model name.
        const isDeterministic = coreRes.governance?.isFallback === true;
        const data = coreRes.data || {};
        const executiveSummary = String(data.executiveSummary || "");

        if (!executiveSummary) {
            return NextResponse.json(
                { error: "The analysis response did not contain usable content. Try again." },
                { status: 502 }
            );
        }

        const finalPayload: ProductionAIAnalysisPayload = {
            executiveSummary,
            keyObservations: Array.isArray(data.keyObservations) ? data.keyObservations.map(String) : [],
            bottlenecks: Array.isArray(data.bottlenecks) ? data.bottlenecks : [],
            correctiveActions: Array.isArray(data.correctiveActions) ? data.correctiveActions : [],
            riskFlags: Array.isArray(data.riskFlags) ? data.riskFlags : [],
            meta: {
                modelUsed: coreRes.governance?.modelUsed || "Unspecified model",
                isFallback: isDeterministic,
                generatedAt: new Date().toISOString(),
                freshnessCutoff: report.meta.freshnessCutoff,
                aiTier: tierInfo
            }
        };

        return NextResponse.json(finalPayload);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to generate AI production analysis.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
