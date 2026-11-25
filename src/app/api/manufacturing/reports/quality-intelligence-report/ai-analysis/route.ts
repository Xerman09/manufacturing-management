import { NextResponse } from "next/server";
import { authorizeQualityIntelligenceReport } from "../auth";
import { resolveServerAiTier } from "../_report-service";
import { runCoreAiAnalysis, parseJsonSafe } from "@/lib/ai";
import type { GlobalAiTierSlug } from "@/lib/ai";
import type {
    QualityAICommentaryPayload,
    QualityAIHypothesisItem,
    QualityReportPayload
} from "@/modules/manufacturing-management/quality-intelligence-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AiAnalysisRequestBody {
    reportPayload: QualityReportPayload;
}

interface RawAiOutput {
    executiveSummary?: string;
    verifiedFacts?: string[];
    hypotheses?: QualityAIHypothesisItem[];
    containmentPriorities?: string[];
}

function buildDeterministicAnalysis(report: QualityReportPayload): RawAiOutput {
    const kpis = report.kpis;
    const topDefects = report.defectPareto.slice(0, 3);
    const worstCorrelation = report.rootCauseCorrelations[0];

    const dRateStr = kpis.defectRatePct !== null ? `${kpis.defectRatePct}%` : "undetermined";
    const fpyStr = kpis.fpyPct !== null ? `${kpis.fpyPct}%` : "undetermined";
    const scrapStr = kpis.scrapRatePct !== null ? `${kpis.scrapRatePct}%` : "undetermined";

    const executiveSummary = `For ${report.meta.dateLabel}, evaluation across ${kpis.totalJobOrders} batches revealed a Defect Rate of ${dRateStr}, First Pass Yield (FPY) of ${fpyStr}, and Scrap Rate of ${scrapStr}. ${
        topDefects.length > 0
            ? `Primary failure drivers concentrate in ${topDefects.map((d) => `${d.defectLabel} (${d.defectQuantity} units)`).join(", ")}.`
            : "No recurring defect parameters were recorded."
    }`;

    const verifiedFacts: string[] = [
        `Inspected ${kpis.totalInspectedUnits.toLocaleString()} units with ${kpis.totalDefectiveUnits.toLocaleString()} defective units recorded.`,
        kpis.fpyPct !== null
            ? `First Pass Yield (FPY) reached ${kpis.fpyPct}% without rework.`
            : "First Pass Yield could not be computed from available yield records.",
        topDefects.length > 0
            ? `Top defect category is '${topDefects[0].defectLabel}' accounting for ${topDefects[0].cumulativePct}% of cumulative defect quantity.`
            : "No defect parameter failures logged.",
        kpis.qaHoldBatchCount > 0
            ? `${kpis.qaHoldBatchCount} batch(es) currently placed on QA Hold or awaiting disposition.`
            : "All evaluated production batches passed conforming inspection."
    ];

    const hypotheses: QualityAIHypothesisItem[] = [];

    if (topDefects.length > 0) {
        hypotheses.push({
            id: "hyp-1",
            title: `Recurring Defect: ${topDefects[0].defectLabel}`,
            observation: `Observed ${topDefects[0].defectQuantity} defect occurrences (${topDefects[0].defectiveUnits} defective units).`,
            hypothesis: `Potential process deviation in sealing/tooling or raw material specification drift causing elevated ${topDefects[0].defectLabel}. (Labelled as Hypothesis until QA root-cause verification).`,
            confidence: "high",
            evidence: `Defect Pareto and in-process QA inspections for ${report.meta.dateLabel}.`,
            proposedAction: `Initiate containment inspection on active batches and audit calibration parameters for ${topDefects[0].defectLabel}.`
        });
    }

    if (worstCorrelation) {
        hypotheses.push({
            id: "hyp-2",
            title: `Elevated Defect Concentration in ${worstCorrelation.dimensionLabel}`,
            observation: `${worstCorrelation.dimensionType.replace("_", " ").toUpperCase()} '${worstCorrelation.dimensionLabel}' accounts for ${worstCorrelation.defectiveQty} defective units.`,
            hypothesis: `Environmental, operational, or tooling variability associated with ${worstCorrelation.dimensionLabel} may be driving rejection spikes. (Labelled as Hypothesis).`,
            confidence: "medium",
            evidence: `Cross-correlation score of ${worstCorrelation.correlationScore}% across ${worstCorrelation.defectCount} defect logs.`,
            proposedAction: `Inspect machinery and review shift handover logs for ${worstCorrelation.dimensionLabel}.`
        });
    }

    if (kpis.qaHoldBatchCount > 0) {
        hypotheses.push({
            id: "hyp-3",
            title: `Active QA Hold Batches (${kpis.qaHoldBatchCount})`,
            observation: `${kpis.qaHoldBatchCount} Job Order batch(es) flagged under QA Hold or awaiting reconciliation.`,
            hypothesis: `Batches require immediate QA disposition or root-cause review before finished goods warehouse release. (Labelled as Hypothesis).`,
            confidence: "high",
            evidence: `Yield ledger and QA hold disposition status in active production records.`,
            proposedAction: `Review parameter failure breakdown and complete QA disposition audit before staging.`
        });
    }

    const containmentPriorities = [
        "Quarantine any active lots flagged under QA Hold or exceeding defect thresholds.",
        "Calibrate inspection tools and verify test parameters for critical defect categories.",
        "Verify raw material component lot certificates before staging into production."
    ];

    return {
        executiveSummary,
        verifiedFacts,
        hypotheses,
        containmentPriorities
    };
}

export async function POST(request: Request) {
    const access = await authorizeQualityIntelligenceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as AiAnalysisRequestBody;
        const report = body.reportPayload;

        if (!report || !report.meta || !report.kpis) {
            return NextResponse.json({ error: "Missing report payload." }, { status: 400 });
        }

        const tierInfo = await resolveServerAiTier(request.signal);
        const requestedTier: GlobalAiTierSlug =
            tierInfo.tierSlug === "executive" || tierInfo.tierSlug === "pro" || tierInfo.tierSlug === "basic"
                ? tierInfo.tierSlug
                : "basic";

        const domainSystemInstruction = `
You are the Quality Intelligence AI Copilot for Manufacturing Quality Assurance & Lot Traceability.
Analyze the provided quality intelligence report containing defect pareto, scrap rates, first-pass yield (FPY), job-order lot genealogy traces, and root-cause correlations.

Strict Requirements:
1. Grounding: Rely strictly on the structured numbers, lot numbers, and defect parameters provided. Do not hallucinate unrecorded statistics.
2. Scope: Job order production quality only. Do not discuss purchase orders, receiving inspections, or supplier performance.
3. Verified Facts vs. Hypotheses:
   - "verifiedFacts": Direct statements of fact supported by data (e.g. Defect Rate, scrap totals, First Pass Yield).
   - "hypotheses": Plausible root-cause narratives linking defects to specific work centers, shifts, operators, or consumed component lots. MUST explicitly state they are hypotheses pending QA confirmation.
4. Containment Actions: Practical, immediate containment and corrective steps.
5. DO NOT use LaTeX math formatting (e.g. no \\frac). Use plain text or standard markdown.
6. Return ONLY clean JSON matching this exact structure:
{
  "executiveSummary": "2-3 sentences summarizing overall quality health, FPY, defect rates, and primary risk areas",
  "verifiedFacts": ["Fact 1", "Fact 2", "Fact 3"],
  "hypotheses": [
    {
      "id": "hyp-1",
      "title": "Short title",
      "observation": "Specific factual observation from data",
      "hypothesis": "Hypothesized root cause (clearly noted as a hypothesis)",
      "confidence": "high" | "medium" | "low",
      "evidence": "Citing specific data from report",
      "proposedAction": "Actionable containment or corrective measure"
    }
  ],
  "containmentPriorities": ["Action 1", "Action 2", "Action 3"]
}
`.trim();

        const buildPrompt = () =>
            JSON.stringify(
                {
                    scope: {
                        dateRange: report.meta.dateLabel,
                        product: report.meta.productLabel,
                        workCenter: report.meta.workCenterLabel,
                        shift: report.meta.shiftLabel,
                        status: report.meta.statusLabel
                    },
                    kpis: report.kpis,
                    defectPareto: report.defectPareto.slice(0, 6),
                    rootCauseCorrelations: report.rootCauseCorrelations.slice(0, 6),
                    sampleLots: report.lotTrace.slice(0, 8).map((l) => ({
                        jobOrder: l.jobOrderNo,
                        lotNumber: l.finishedLotNumber,
                        qaStatus: l.qaStatus,
                        producedQty: l.producedQty,
                        rejectedQty: l.rejectedQty,
                        components: l.componentBatches.map((c) => `${c.componentProductName}: ${c.componentBatchNo}`)
                    }))
                },
                null,
                2
            );

        const coreRes = await runCoreAiAnalysis<QualityReportPayload, RawAiOutput>(
            {
                moduleName: "quality-intelligence-report",
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

        const isDeterministic = coreRes.governance?.isFallback === true;
        const data = coreRes.data || {};
        const executiveSummary = String(data.executiveSummary || "");

        if (!executiveSummary) {
            return NextResponse.json(
                { error: "The quality analysis response did not contain usable content. Try again." },
                { status: 502 }
            );
        }

        const finalPayload: QualityAICommentaryPayload = {
            executiveSummary,
            verifiedFacts: Array.isArray(data.verifiedFacts) ? data.verifiedFacts.map(String) : [],
            hypotheses: Array.isArray(data.hypotheses) ? data.hypotheses : [],
            containmentPriorities: Array.isArray(data.containmentPriorities)
                ? data.containmentPriorities.map(String)
                : [],
            meta: {
                modelUsed: coreRes.governance?.modelUsed || "Quality Intelligence Engine",
                isFallback: isDeterministic,
                generatedAt: new Date().toISOString(),
                aiTier: tierInfo
            }
        };

        return NextResponse.json(finalPayload);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to generate Quality AI analysis.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
