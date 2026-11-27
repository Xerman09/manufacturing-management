import { NextResponse } from "next/server";
import { authorizePredictiveMaintenanceReport } from "../auth";
import { resolveServerAiTier } from "../_report-service";
import { runCoreAiAnalysis, parseJsonSafe } from "@/lib/ai";
import type { GlobalAiTierSlug } from "@/lib/ai";
import type {
    MaintenanceAiFinding,
    PredictiveAiCommentaryPayload,
    PredictiveMaintenanceReportPayload
} from "@/modules/manufacturing-management/predictive-maintenance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AiAnalysisRequestBody {
    reportPayload: PredictiveMaintenanceReportPayload;
}

interface RawAiOutput {
    executiveSummary?: string;
    verifiedFacts?: string[];
    hypotheses?: MaintenanceAiFinding[];
    containmentPriorities?: string[];
}

function buildDeterministicNarrative(report: PredictiveMaintenanceReportPayload): RawAiOutput {
    const kpis = report.kpis;
    const topAssets = report.assetRiskRows.slice(0, 3);
    const topHighRisk = topAssets.filter((a) => a.predictedBreakdownRiskPct >= 50);

    const executiveSummary = `Fleet health assessment across ${kpis.totalAssetsEvaluated} assets shows an aggregate Risk Score of ${kpis.fleetRiskScore}% (${kpis.fleetRiskLevel}). ${
        kpis.highRiskAssetCount > 0
            ? `${kpis.highRiskAssetCount} equipment unit(s) exceed high-risk thresholds, requiring proactive inspection.`
            : "All monitored assets operate within safe reliability parameters."
    } Operating mode: ${kpis.telemetryMode}. Total recorded machine runtime is ${kpis.totalOperatingRunHours.toLocaleString()} hours with ${kpis.totalBreakdownEpisodes} breakdown episode(s).`;

    const verifiedFacts: string[] = [
        `Evaluated ${kpis.totalAssetsEvaluated} production asset(s) with ${kpis.totalOperatingRunHours.toLocaleString()} recorded operational run-hours.`,
        kpis.fleetMtbfHours !== null
            ? `Fleet Mean Time Between Failures (MTBF) is ${kpis.fleetMtbfHours} operating hours.`
            : "No breakdown episodes logged in selected window; MTBF baseline established.",
        topHighRisk.length > 0
            ? `Highest risk concentrated on ${topHighRisk.map((a) => `${a.assetName} (${a.predictedBreakdownRiskPct}%)`).join(", ")}.`
            : "No equipment units currently exceed high breakdown probability thresholds.",
        kpis.openRecommendationsCount > 0
            ? `${kpis.openRecommendationsCount} preventive action recommendation(s) open for planner review.`
            : "Zero urgent maintenance follow-up actions pending."
    ];

    const hypotheses: MaintenanceAiFinding[] = [];
    topHighRisk.forEach((asset, idx) => {
        hypotheses.push({
            id: `hyp-${idx + 1}`,
            title: `Elevated Wear Hypothesis: ${asset.assetName}`,
            type: "HYPOTHESIS",
            observation: `Accumulated ${asset.cumulativeRunHours} run-hours with ${asset.breakdownCount} past failure incident(s).`,
            evidence: `Job order routing load logs in ${asset.workCenterName} and past maintenance repair notes.`,
            recommendedAction: asset.suggestedAction,
            priority: asset.riskLevel,
            confidence: asset.breakdownCount > 0 ? "high" : "medium"
        });
    });

    const containmentPriorities: string[] = topHighRisk.map(
        (a) => `Issue diagnostic work order for ${a.assetName} (${a.workCenterName}) before next production shift.`
    );
    if (containmentPriorities.length === 0) {
        containmentPriorities.push("Maintain standard lubrication schedules and quarterly calibration checks.");
    }

    return {
        executiveSummary,
        verifiedFacts,
        hypotheses,
        containmentPriorities
    };
}

export async function POST(request: Request) {
    const access = await authorizePredictiveMaintenanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let body: AiAnalysisRequestBody;
    try {
        body = (await request.json()) as AiAnalysisRequestBody;
    } catch {
        return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
    }

    const { reportPayload } = body;
    if (!reportPayload) {
        return NextResponse.json({ error: "Missing report payload." }, { status: 400 });
    }

    const aiTier = await resolveServerAiTier(request.signal);
    if (!aiTier.assigned || aiTier.tierLevel === 0 || aiTier.tierSlug === "unassigned") {
        return NextResponse.json(
            {
                executiveSummary: "AI Commentary is disabled because no AI Tier is assigned to the Predictive Maintenance Report module in System Settings.",
                verifiedFacts: [],
                hypotheses: [],
                containmentPriorities: [],
                aiTier
            },
            { status: 200 }
        );
    }

    const requestedTier: GlobalAiTierSlug =
        aiTier.tierSlug === "executive" || aiTier.tierSlug === "pro" || aiTier.tierSlug === "basic"
            ? aiTier.tierSlug
            : "basic";

    const domainSystemInstruction = `
You are an expert industrial reliability engineer and maintenance planner assistant for Vertex Technologies Corporation.
You analyze manufacturing equipment condition, run-hours, failure logs, MTBF/MTTR, and breakdown risks.

Strict Requirements:
1. Distinguish strictly between VERIFIED FACTS (direct records from maintenance history and job routes) and HYPOTHESES/ESTIMATES (inferred wear, risk probabilities, potential root causes awaiting physical check).
2. Never hallucinate sensor readings if telemetry is marked 'Absent / Rule-Based'.
3. Return ONLY clean JSON matching this exact structure:
{
  "executiveSummary": "2-3 sentences summarizing overall fleet health, MTBF, and risk areas",
  "verifiedFacts": ["Fact 1", "Fact 2", "Fact 3"],
  "hypotheses": [
    {
      "id": "hyp-1",
      "title": "Short title",
      "observation": "Specific factual observation from data",
      "evidence": "Citing specific data from report",
      "recommendedAction": "Actionable preventive or inspection measure",
      "priority": "Low" | "Medium" | "High" | "Critical",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "containmentPriorities": ["Action 1", "Action 2"]
}
`.trim();

    const buildPrompt = () =>
        JSON.stringify(
            {
                kpis: reportPayload.kpis,
                topAssets: reportPayload.assetRiskRows.slice(0, 6),
                categoryDistribution: reportPayload.categoryDistribution,
                degradationTrends: reportPayload.degradationTrends
            },
            null,
            2
        );

    try {
        const coreRes = await runCoreAiAnalysis<PredictiveMaintenanceReportPayload, RawAiOutput>(
            {
                moduleName: "predictive-maintenance-report",
                tierSlug: requestedTier,
                payload: reportPayload,
                domainSystemInstruction,
                buildPrompt,
                fallbackEngine: (sanitized) => buildDeterministicNarrative(sanitized),
                parseResponse: (rawText) => parseJsonSafe<RawAiOutput>(rawText),
                sanitization: {
                    stripSensitiveKeys: true,
                    redactPii: true,
                    maxItemsCap: 50
                }
            },
            aiTier.tierLevel
        );

        const data = coreRes.data || buildDeterministicNarrative(reportPayload);
        const responsePayload: PredictiveAiCommentaryPayload = {
            executiveSummary: data.executiveSummary || "",
            verifiedFacts: Array.isArray(data.verifiedFacts) ? data.verifiedFacts.map(String) : [],
            hypotheses: Array.isArray(data.hypotheses) ? data.hypotheses : [],
            containmentPriorities: Array.isArray(data.containmentPriorities) ? data.containmentPriorities.map(String) : [],
            aiTier
        };

        return NextResponse.json(responsePayload);
    } catch {
        const fallback = buildDeterministicNarrative(reportPayload);
        const responsePayload: PredictiveAiCommentaryPayload = {
            executiveSummary: fallback.executiveSummary || "",
            verifiedFacts: fallback.verifiedFacts || [],
            hypotheses: fallback.hypotheses || [],
            containmentPriorities: fallback.containmentPriorities || [],
            aiTier
        };
        return NextResponse.json(responsePayload);
    }
}
