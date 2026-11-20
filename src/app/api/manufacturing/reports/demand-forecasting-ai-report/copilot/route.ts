import { NextResponse } from "next/server";
import { authorizeDemandForecastingReport } from "../auth";
import { resolveServerAiTier } from "../_report-service";
import { runCoreAiAnalysis, parseJsonSafe } from "@/lib/ai";
import type { GlobalAiTierSlug } from "@/lib/ai";
import type {
    AICommentaryItem,
    DemandAICommentaryPayload,
    DemandForecastReportPayload,
    ScenarioAssumptions
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/types";
import { computeAdjustedPlanningRows } from "@/modules/manufacturing-management/demand-forecasting-ai-report/utils/scenarioMath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CopilotRequestBody {
    reportPayload: DemandForecastReportPayload;
    scenarioAssumptions: ScenarioAssumptions;
}

interface RawAiOutput {
    executiveSummary?: string;
    keyHighlights?: string[];
    accuracyDiagnosis?: string;
    scenarioRiskAssessment?: string;
    commentaryItems?: AICommentaryItem[];
    planningPriorities?: string[];
}

function buildDeterministicCommentary(
    report: DemandForecastReportPayload,
    assumptions: ScenarioAssumptions
): RawAiOutput {
    const k = report.kpis;
    const adjusted = computeAdjustedPlanningRows(report.planningRows, assumptions);
    const totalScenarioForecast = adjusted.reduce(
        (s, r) => s + (r.scenarioForecastUnits ?? 0),
        0
    );
    const totalSuggestedProd = adjusted.reduce(
        (s, r) => s + (r.suggestedProductionUnits ?? 0),
        0
    );
    const totalLaborHours = adjusted.reduce((s, r) => s + (r.suggestedLaborHours ?? 0), 0);
    const stockoutSkus = adjusted.filter((r) => r.planningRisk === "Stockout Risk");
    const topRegion = report.regionComparison[0];
    const topProduct = report.productComparison[0];
    const highErrorRows = [...report.matrixRows]
        .filter((r) => r.wapePct !== null)
        .sort((a, b) => (b.wapePct ?? 0) - (a.wapePct ?? 0))
        .slice(0, 3);

    const wapeLabel =
        k.wapePct !== null ? `${k.wapePct.toFixed(1)}%` : "not yet measured";
    const biasLabel =
        k.biasPct !== null
            ? `${k.biasPct > 0 ? "+" : ""}${k.biasPct.toFixed(1)}% (${k.biasPct > 0 ? "running high" : "running low"})`
            : "not yet measured";

    const unitSuffix = k.isMixedUnits ? "mixed units" : k.activeUnits[0] || "units";

    const executiveSummary = `For ${report.meta.branchLabel} (${report.meta.cadence} cycle, ${report.meta.forecastHorizonLabel}), expected demand totals ${(k.forecastUnits ?? 0).toLocaleString()} ${unitSuffix} at baseline and ${totalScenarioForecast.toLocaleString()} ${unitSuffix} under the active scenario (${assumptions.demandAdjustmentPct >= 0 ? "+" : ""}${assumptions.demandAdjustmentPct}% adjustment). Historical forecast error (WAPE) is ${wapeLabel} with bias at ${biasLabel}, and demand momentum is ${k.trendDirection}.`;

    const keyHighlights: string[] = [
        `Expected horizon demand: ${totalScenarioForecast.toLocaleString()} ${unitSuffix} across ${report.productComparison.length} active SKU(s) and ${report.regionComparison.length} customer region(s).`,
        `Out-of-sample forecast error (WAPE): ${wapeLabel}; directional bias: ${biasLabel}.`,
        topRegion && topRegion.forecastUnits !== null
            ? `Leading customer region is ${topRegion.regionLabel} at ${topRegion.forecastUnits.toLocaleString()} (${topRegion.sharePct.toFixed(1)}% share).`
            : "No regional demand concentration detected in selected filters.",
        (() => {
            const verifiedLaborCount = adjusted.filter((r) => r.laborAuditStatus === "Verified" && (r.suggestedLaborHours || 0) > 0).length;
            const outlierLaborCount = adjusted.filter((r) => r.laborAuditStatus === "Standard Time Outlier").length;
            const missingRoutingCount = adjusted.filter((r) => r.laborAuditStatus === "Missing Routing").length;

            let laborNote = `Suggested planning calls for ${totalSuggestedProd.toLocaleString()} production units and ${totalLaborHours.toFixed(1)} verified direct labor hours (across ${verifiedLaborCount} SKU(s)).`;
            if (outlierLaborCount > 0 || missingRoutingCount > 0) {
                laborNote += ` Note: ${outlierLaborCount > 0 ? `${outlierLaborCount} standard-time outlier(s) excluded; ` : ""}${missingRoutingCount > 0 ? `${missingRoutingCount} missing routing(s)` : ""}.`;
            }
            return laborNote;
        })()
    ];

    if (k.wapePct !== null && k.wapePct > 50) {
        keyHighlights.push(
            `CRITICAL PLANNING GUARDRAIL: Elevated WAPE error (${wapeLabel}) and ${biasLabel} bias indicate uncalibrated baseline demand. Do NOT commit full suggested production (${totalSuggestedProd.toLocaleString()} units) without manual sales order verification.`
        );
    }

    const accuracyDiagnosis =
        k.wapePct === null
            ? "Too few overlapping historical periods to evaluate forecast error and bias. Expand the historical period to calibrate baseline."
            : k.wapePct <= 15
            ? `Forecast performance is strong at ${k.wapePct.toFixed(1)}% WAPE across ${k.evaluatedBacktestPeriods} evaluated period(s) (${k.evaluatedActualUnits.toLocaleString()} evaluated units). Bias sits at ${biasLabel}, supporting lean safety-stock targets.`
            : k.wapePct > 50
            ? `Critical forecast error (${k.wapePct.toFixed(1)}% WAPE) with ${biasLabel} bias proves model deviations exceed historical demand. Suggested production figures must NOT be committed automatically; pace production strictly against confirmed customer orders.`
            : `Elevated forecast error (${k.wapePct.toFixed(1)}% WAPE) with ${biasLabel} bias points to ordering volatility or lumpy demand. Review top-error product-region pairs before locking production runs.`;

    const scenarioRiskAssessment = `Under the ${assumptions.confidenceLevel}% confidence range with ${assumptions.safetyStockDays} safety-stock days and +${assumptions.leadTimeBufferDays}d lead-time buffer, ${stockoutSkus.length} SKU(s) are currently flagged for Stockout Risk after accounting for usable inventory, unburnable expiring FEFO stock, and open Job Orders.`;

    const commentaryItems: AICommentaryItem[] = [];

    if (stockoutSkus.length > 0) {
        const first = stockoutSkus[0];
        commentaryItems.push({
            id: "ai-stockout-risk",
            category: "inventory",
            severity: "critical",
            title: `${stockoutSkus.length} SKU(s) Exposed to Stockout Risk`,
            analysis: `${first.productName} (${first.productCode}) projects ${first.scenarioForecastUnits !== null ? first.scenarioForecastUnits.toLocaleString() : "-"} ${first.unitLabel} against ${first.effectiveUsableOnhandUnits !== null ? first.effectiveUsableOnhandUnits.toLocaleString() : "-"} usable on-hand and ${first.openJobOrderUnits.toLocaleString()} open JO units.`,
            recommendedAction: `Schedule production of ${first.suggestedProductionUnits !== null ? first.suggestedProductionUnits.toLocaleString() : "-"} ${first.unitLabel} and verify ${first.inventoryPolicy} batch availability.`,
            owner: "Demand & Production Planner",
            evidenceIds: first.evidenceIds.slice(0, 8)
        });
    }

    if (highErrorRows.length > 0) {
        const worst = highErrorRows[0];
        commentaryItems.push({
            id: "ai-wape-outlier",
            category: "accuracy",
            severity: (worst.wapePct ?? 0) > 25 ? "warning" : "info",
            title: `Highest Forecast Error: ${worst.productName} in ${worst.regionLabel}`,
            analysis: `Walk-forward WAPE reached ${worst.wapePct}% with ${worst.biasPct !== null ? `${worst.biasPct > 0 ? "+" : ""}${worst.biasPct}%` : "-"} bias across ${worst.orderCount} sales order(s) (${worst.absErrorUnits.toLocaleString()} absolute error units).`,
            recommendedAction: `Confirm with Regional Sales whether recent orders in ${worst.regionLabel} reflect one-off bulk orders or a sustained demand shift.`,
            owner: "Demand Planner & Regional Sales Lead",
            evidenceIds: worst.evidenceIds.slice(0, 8)
        });
    }

    if (topProduct) {
        const matchingMatrix = report.matrixRows.find((r) => r.productId === topProduct.productId);
        const fcStr =
            topProduct.forecastUnits !== null
                ? `${topProduct.forecastUnits.toLocaleString()} ${topProduct.unitLabel}`
                : "Insufficient History";
        commentaryItems.push({
            id: "ai-production-labor",
            category: "production",
            severity: "info",
            title: `Top Volume SKU: ${topProduct.productName}`,
            analysis: `Expected demand is ${fcStr} (${topProduct.trendDirection} trend${topProduct.trendPct !== null ? `, ${topProduct.trendPct > 0 ? "+" : ""}${topProduct.trendPct}% per period` : ""}). Total suggested production across filtered SKUs is ${totalSuggestedProd.toLocaleString()} units requiring ${totalLaborHours.toFixed(1)} direct labor hours.`,
            recommendedAction: `Align shift scheduling and raw-material staging to cover the ${report.meta.forecastHorizonLabel} production wave.`,
            owner: "Plant Production Scheduler & Shift Lead",
            evidenceIds: matchingMatrix ? matchingMatrix.evidenceIds.slice(0, 8) : []
        });
    }

    if (topRegion) {
        const matchingMatrix = report.matrixRows.find((r) => r.regionKey === topRegion.regionKey);
        const regFcStr =
            topRegion.forecastUnits !== null
                ? `${topRegion.forecastUnits.toLocaleString()} units`
                : "insufficient data";
        commentaryItems.push({
            id: "ai-regional-mix",
            category: "regional",
            severity: "info",
            title: `Regional Concentration in ${topRegion.regionLabel}`,
            analysis: `${topRegion.regionLabel} represents ${topRegion.sharePct.toFixed(1)}% of expected demand (${regFcStr}) with regional WAPE of ${topRegion.wapePct !== null ? `${topRegion.wapePct}%` : "-"}.`,
            recommendedAction: `Coordinate branch dispatch staging and outbound capacity for ${topRegion.regionLabel} ahead of peak periods.`,
            owner: "Supply Chain & Logistics Planner",
            evidenceIds: matchingMatrix ? matchingMatrix.evidenceIds.slice(0, 8) : []
        });
    }

    const planningPriorities = [
        stockoutSkus.length > 0
            ? `Address stockout exposure on ${stockoutSkus.slice(0, 3).map((s) => s.productCode).join(", ")} by scheduling ${totalSuggestedProd.toLocaleString()} production units.`
            : "Usable inventory and open Job Orders adequately cover the active demand scenario.",
        `Confirm ${totalLaborHours.toFixed(1)} direct labor hours (${(totalLaborHours / 8).toFixed(1)} standard 8-hour shifts) against line headcount.`,
        "Prioritize near-expiry FEFO batches for immediate dispatch before releasing new replenishment runs."
    ];

    return {
        executiveSummary,
        keyHighlights,
        accuracyDiagnosis,
        scenarioRiskAssessment,
        commentaryItems,
        planningPriorities
    };
}

export async function POST(request: Request) {
    const access = await authorizeDemandForecastingReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as CopilotRequestBody;
        const report = body.reportPayload;
        const assumptions = body.scenarioAssumptions;

        if (!report || !report.meta || !report.kpis) {
            return NextResponse.json({ error: "Invalid demand forecast report payload." }, { status: 400 });
        }

        // Server-side AI tier verification (never trust client-supplied aiTier)
        const tierInfo = await resolveServerAiTier(request.signal);
        if (!tierInfo.assigned || tierInfo.tierLevel === 0 || tierInfo.tierSlug === "unassigned") {
            return NextResponse.json(
                { error: "AI Commentary is not assigned to this module." },
                { status: 403 }
            );
        }

        const validEvidenceIds = new Set(Object.keys(report.evidenceRegistry || {}));
        const adjusted = computeAdjustedPlanningRows(report.planningRows, assumptions);
        const topMatrix = report.matrixRows.slice(0, 12);
        const topPlanning = adjusted.slice(0, 12);

        const domainSystemInstruction = `
You are an expert Manufacturing Demand Planning Advisor.
Analyze the sanitized Sales-Order demand forecast, out-of-sample accuracy metrics (WAPE = sum of absolute forecast errors / sum of evaluated actual demand * 100, Forecast Bias, Demand Trend), scenario assumptions, and Inventory/Production/Labor planning rollup.
Write concise, plain-language business commentary for a Demand Planner (avoid statistical jargon).
Rules:
1. Reference ONLY facts present in the payload. Never invent quantities, SKUs, regions, or evidence IDs.
2. For each commentaryItem, include relevant "evidenceIds" copied EXACTLY from the provided evidenceIds arrays.
3. Return ONLY clean JSON matching this exact schema (no markdown code fences):
{
  "executiveSummary": "2-3 sentence synthesis",
  "keyHighlights": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"],
  "accuracyDiagnosis": "2-3 sentences diagnosing WAPE and Forecast Bias",
  "scenarioRiskAssessment": "2 sentences assessing stockout/excess risk under active scenario assumptions",
  "commentaryItems": [
    {
      "id": "string",
      "category": "demand" | "accuracy" | "inventory" | "production" | "labor" | "regional",
      "severity": "info" | "warning" | "critical",
      "title": "short actionable title",
      "analysis": "2 sentences citing exact numbers",
      "recommendedAction": "concrete planner action",
      "owner": "accountable role",
      "evidenceIds": ["exact_id_from_input"]
    }
  ],
  "planningPriorities": ["priority 1", "priority 2", "priority 3"]
}
        `.trim();

        const buildPrompt = () =>
            JSON.stringify(
                {
                    scope: {
                        cadence: report.meta.cadence,
                        period: `${report.meta.periodLabel} (${report.meta.dateFrom} to ${report.meta.dateTo})`,
                        branch: report.meta.branchLabel,
                        product: report.meta.productLabel,
                        region: report.meta.regionLabel,
                        horizon: report.meta.forecastHorizonLabel
                    },
                    kpis: report.kpis,
                    scenarioAssumptions: assumptions,
                    topProductRegionMatrix: topMatrix.map((r) => ({
                        product: `${r.productName} (${r.productCode})`,
                        region: r.regionLabel,
                        actualUnits: r.historicalActualUnits,
                        forecastUnits: r.forecastUnits,
                        wapePct: r.wapePct,
                        biasPct: r.biasPct,
                        trendDirection: r.trendDirection,
                        evidenceIds: r.evidenceIds.slice(0, 4)
                    })),
                    topPlanningQuantities: topPlanning.map((p) => ({
                        product: `${p.productName} (${p.productCode})`,
                        policy: p.inventoryPolicy,
                        scenarioForecastUnits: p.scenarioForecastUnits,
                        effectiveUsableOnhandUnits: p.effectiveUsableOnhandUnits,
                        atRiskExpiringUnits: p.atRiskExpiringUnits,
                        openJobOrderUnits: p.openJobOrderUnits,
                        suggestedProductionUnits: p.suggestedProductionUnits,
                        suggestedLaborHours: p.suggestedLaborHours,
                        planningRisk: p.planningRisk,
                        evidenceIds: p.evidenceIds.slice(0, 4)
                    }))
                },
                null,
                2
            );

        const requestedTier: GlobalAiTierSlug = tierInfo.tierSlug;

        const coreRes = await runCoreAiAnalysis<DemandForecastReportPayload, RawAiOutput>(
            {
                moduleName: "demand-forecasting-ai-report",
                tierSlug: requestedTier,
                payload: report,
                domainSystemInstruction,
                buildPrompt,
                fallbackEngine: (sanitized) => buildDeterministicCommentary(sanitized, assumptions),
                parseResponse: (rawText) => parseJsonSafe<RawAiOutput>(rawText),
                sanitization: {
                    stripSensitiveKeys: true,
                    redactPii: true,
                    maxItemsCap: 40
                }
            },
            tierInfo.tierLevel
        );

        const data = coreRes.data || {};
        const fallback = buildDeterministicCommentary(report, assumptions);

        const items = (Array.isArray(data.commentaryItems) && data.commentaryItems.length > 0
            ? data.commentaryItems
            : fallback.commentaryItems || []
        ).map((item, idx) => ({
            id: item.id || `commentary-${idx + 1}`,
            category: item.category || "demand",
            severity: item.severity || "info",
            title: String(item.title || "Demand Signal Observation"),
            analysis: String(item.analysis || ""),
            recommendedAction: String(item.recommendedAction || ""),
            owner: String(item.owner || "Demand Planner"),
            evidenceIds: Array.isArray(item.evidenceIds)
                ? item.evidenceIds.filter((id) => validEvidenceIds.has(String(id)))
                : []
        }));

        const finalPayload: DemandAICommentaryPayload = {
            executiveSummary: String(data.executiveSummary || fallback.executiveSummary || ""),
            keyHighlights:
                Array.isArray(data.keyHighlights) && data.keyHighlights.length > 0
                    ? data.keyHighlights.map(String)
                    : fallback.keyHighlights || [],
            accuracyDiagnosis: String(data.accuracyDiagnosis || fallback.accuracyDiagnosis || ""),
            scenarioRiskAssessment: String(
                data.scenarioRiskAssessment || fallback.scenarioRiskAssessment || ""
            ),
            commentaryItems: items,
            planningPriorities:
                Array.isArray(data.planningPriorities) && data.planningPriorities.length > 0
                    ? data.planningPriorities.map(String)
                    : fallback.planningPriorities || [],
            meta: {
                aiTier: tierInfo,
                governance: coreRes.governance,
                dataFreshnessCutoff: report.meta.freshnessCutoff
            }
        };

        return NextResponse.json(finalPayload);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to generate AI demand commentary.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
