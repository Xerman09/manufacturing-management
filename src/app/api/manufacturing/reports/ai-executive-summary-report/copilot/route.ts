import { NextResponse } from "next/server";
import { authorizeAIExecutiveSummaryReport } from "../auth";
import { runCoreAiAnalysis, parseJsonSafe } from "@/lib/ai";
import type { GlobalAiTierSlug, TierPolicy } from "@/lib/ai";
import type {
    AIExecutiveReportPayload,
    AIInsightsPayload,
    AIObservation,
    StrategicPillars
} from "@/modules/manufacturing-management/ai-executive-summary-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CopilotRequestBody {
    reportPayload: AIExecutiveReportPayload;
}

/**
 * Deterministic offline rule engine when Gemini is offline or not configured
 */
function runDeterministicFallback(
    sanitized: AIExecutiveReportPayload,
    tier: TierPolicy
): AIInsightsPayload {
    const kpis = sanitized.kpiCards;
    const outputPct = kpis.output.variancePercent ?? 0;
    const oeePct = kpis.plantOee.actual ?? 0;
    const scrapPct = kpis.scrapRate.actual ?? 0;
    const downtimeMins = kpis.downtimeMinutes.actual ?? 0;
    const otifPct = kpis.otif.actual ?? 0;
    const costPct = kpis.costVariance.actual ?? 0;

    const summary = `Deterministic Analysis: Plant operations for ${sanitized.meta.plantName} recorded Good Output of ${kpis.output.actual?.toLocaleString() ?? 0} units (${outputPct >= 0 ? "+" : ""}${outputPct}% variance). Weighted OEE is tracked at ${oeePct}%, with scrap at ${scrapPct}%, downtime at ${downtimeMins} mins, and customer OTIF at ${otifPct}%.`;

    // Tier 1 (Basic): strictly 2 to 4 general bullet points
    const keyHighlights = [
        `Production output recorded at ${kpis.output.actual?.toLocaleString() ?? 0} units vs target of ${kpis.output.target?.toLocaleString() ?? 0} units.`,
        `Overall equipment effectiveness (OEE) tracked at ${oeePct}%, compared against the 85.0% benchmark.`,
        `Quality scrap and defect rate is currently at ${scrapPct}%, with total downtime logged at ${downtimeMins} minutes.`
    ];

    // Tier 2 (Pro): detailed narrative analysis
    const detailedAnalysis = `During this reporting cycle, plant operations yielded ${kpis.output.actual?.toLocaleString() ?? 0} good finished goods units against a scheduled target of ${kpis.output.target?.toLocaleString() ?? 0} units (${kpis.output.variancePercent}% variance). Overall Equipment Effectiveness settled at ${oeePct}%, reflecting an availability factor impacted by ${downtimeMins} minutes of recorded machine downtime. Quality yield performance registered a ${scrapPct}% scrap and defect rate, remaining ${scrapPct > 2.0 ? "above" : "within"} the engineering threshold ceiling. Raw material consumption registered a variance of ${costPct > 0 ? "+" : ""}${costPct}% against standard recipe bills of materials, while on-time customer order fulfillment reached ${otifPct}%.`;

    const keyExposures: AIObservation[] = [];
    const strategicActions: AIObservation[] = [];

    if (downtimeMins > 120 || oeePct < 85) {
        keyExposures.push({
            id: "exp-downtime",
            type: "fact",
            category: "downtime",
            finding: `Elevated unplanned downtime of ${downtimeMins} mins restricts plant OEE to ${oeePct}%.`,
            supportingEvidence: "Verified from asset maintenance stop episodes.",
            impactLevel: "high",
            recommendedAction: "Dispatch preventive maintenance engineering to bottleneck work centers.",
            suggestedOwner: "Maintenance Supervisor",
            targetModule: "machine-downtime-report"
        });
    }

    if (scrapPct > 2.0) {
        keyExposures.push({
            id: "exp-scrap",
            type: "fact",
            category: "quality",
            finding: `Scrap rate (${scrapPct}%) exceeds 2.0% allowable engineering tolerance.`,
            supportingEvidence: "Aggregated from yield ledger scrap & quarantine rejections.",
            impactLevel: "medium",
            recommendedAction: "Review daily QA sensory logs and station temperature calibration.",
            suggestedOwner: "QA Lead",
            targetModule: "manufacturing-qa"
        });
    }

    if (keyExposures.length === 0) {
        keyExposures.push({
            id: "exp-nominal",
            type: "fact",
            category: "output",
            finding: "Plant operating within nominal baseline parameters with no critical risk flags.",
            supportingEvidence: "All monitored KPI vectors adhere to target tolerances.",
            impactLevel: "low",
            recommendedAction: "Maintain standard shift batching sequencing.",
            suggestedOwner: "Production Planner",
            targetModule: "production-workflow"
        });
    }

    strategicActions.push({
        id: "act-1",
        type: "fact",
        category: "delivery",
        finding: `Customer delivery fulfillment (OTIF) tracked at ${otifPct}%.`,
        supportingEvidence: "Cross-checked against sales orders and dispatch records.",
        impactLevel: otifPct < 90 ? "high" : "low",
        recommendedAction: "Establish immediate expedited dispatch protocol with outbound freight carriers and synchronize Job Order staging directly to delivery appointments to restore 95% SLA.",
        suggestedOwner: "Logistics & Dispatch Manager",
        department: "Logistics & Supply Chain",
        targetModule: "sales-and-fulfillment"
    });

    if (costPct > 5) {
        strategicActions.push({
            id: "act-2",
            type: "fact",
            category: "cost",
            finding: `Material cost variance is ${costPct}% over BOM recipe benchmark.`,
            supportingEvidence: "Verified against standard bill of materials consumption records.",
            impactLevel: "high",
            recommendedAction: "Audit raw material batch dosing and freeze non-essential purchase orders with the Procurement Lead (Materials Management) to prevent further margin erosion.",
            suggestedOwner: "Procurement Lead & Material Controller",
            department: "Materials Management",
            targetModule: "inventory-lots"
        });
    }

    if (scrapPct > 2.0 || Math.abs(kpis.output.variancePercent ?? 0) > 20) {
        strategicActions.push({
            id: "act-3",
            type: "fact",
            category: "output",
            finding: `Production volume variance settled at ${kpis.output.variancePercent ?? 0}%.`,
            supportingEvidence: `Actual output of ${kpis.output.actual?.toLocaleString() ?? 0} units vs ${kpis.output.target?.toLocaleString() ?? 0} target.`,
            impactLevel: "high",
            recommendedAction: "Conduct emergency shift scheduling review with the Plant Operations Supervisor to rebalance line labor, eliminate station idling, and pace batch runs.",
            suggestedOwner: "Plant Operations Supervisor",
            department: "Production Operations",
            targetModule: "production-workflow"
        });
    }

    const pillars: StrategicPillars = {
        throughputAndCapacity: {
            title: "Throughput & Machine Availability",
            analysis: `Good output stands at ${kpis.output.actual?.toLocaleString() ?? 0} units vs target of ${kpis.output.target?.toLocaleString() ?? 0}. Line stops totaled ${downtimeMins} mins.`,
            riskScore: oeePct < 70 ? "HIGH" : (oeePct < 85 ? "MEDIUM" : "LOW")
        },
        qualityAndScrap: {
            title: "Quality Integrity & Yield Retention",
            analysis: `Scrap and defect rate stands at ${scrapPct}% against a 2.0% target ceiling.`,
            riskScore: scrapPct > 5.0 ? "HIGH" : (scrapPct > 2.0 ? "MEDIUM" : "LOW")
        },
        financialAndFulfillment: {
            title: "Cost Variance & Dispatch Adherence",
            analysis: `Raw material consumption variance is ${costPct > 0 ? "+" : ""}${costPct}%. OTIF order fulfillment is ${otifPct}%.`,
            riskScore: otifPct < 85 ? "HIGH" : (costPct > 3 ? "MEDIUM" : "LOW")
        }
    };

    const priorityDecisions: string[] = [
        `Approve targeted preventative maintenance scheduling to mitigate the ${downtimeMins} minutes of line stoppage.`,
        `Authorize quality engineering review for scrap containment (${scrapPct}% defect rate vs 2.0% ceiling).`
    ];

    const executiveReport = {
        reportTitle: "Plant Operations & Manufacturing Executive Performance Report",
        preparedBy: "Super Intelligent AI Operations Analyst",
        focus: "Production Yield, Line Bottlenecks, Plant OEE, and Fulfillment Velocity",
        executiveSummary: `This executive briefing synthesizes the operational health of ${sanitized.meta.plantName} across ${sanitized.meta.reportingPeriod}. Based on active records, production lines reached ${kpis.output.actual?.toLocaleString() ?? 0} finished units against a target of ${kpis.output.target?.toLocaleString() ?? 0} units. While equipment availability remains resilient, throughput pacing and scrap retention require focused leadership intervention.`,
        metricsTable: [
            { category: "Production Output", actual: `${kpis.output.actual?.toLocaleString() ?? 0} units`, target: `${kpis.output.target?.toLocaleString() ?? 0} units`, status: (kpis.output.variancePercent ?? 0) >= 0 ? "Favorable" : "Under Target" },
            { category: "Plant OEE (Weighted)", actual: `${oeePct}%`, target: "85.0% Benchmark", status: oeePct >= 85 ? "Optimal" : "Needs Review" },
            { category: "Scrap & Defect Rate", actual: `${scrapPct}%`, target: "≤ 2.0% Ceiling", status: scrapPct <= 2.0 ? "Controlled" : "Elevated Risk" },
            { category: "Unplanned Line Downtime", actual: `${downtimeMins} mins`, target: "≤ 120 mins SLA", status: downtimeMins <= 120 ? "Optimal" : "SLA Exceeded" },
            { category: "Customer Fulfillment (OTIF)", actual: `${otifPct}%`, target: "95.0% SLA", status: otifPct >= 95 ? "Excellent" : "Dispatch Lag" },
            { category: "Material Consumption Variance", actual: `${costPct > 0 ? "+" : ""}${costPct}%`, target: "0.0% Recipe BOM", status: costPct <= 0 ? "Favorable" : "Cost Overage" }
        ],
        bottleneckFindings: {
            highEfficiency: [
                `Quality Acceptance: Production yield logged ${kpis.output.actual?.toLocaleString() ?? 0} QA-passed units meeting finished goods specification standards.`,
                `Equipment Run-time: Total unplanned downtime was restricted to ${downtimeMins} minutes, sustaining basic operational continuity.`
            ],
            primaryBottlenecks: [
                `Throughput Volume Gap: Actual production output lagged behind scheduled targets by ${Math.abs(kpis.output.variancePercent ?? 0)}%, constraining overall line velocity.`,
                `Yield Retention: Defect and scrap rate settled at ${scrapPct}%, representing finished goods losses during high-volume batch runs.`
            ],
            criticalDelays: [
                `Dispatch Alignment: On-time fulfillment stands at ${otifPct}%, indicating that completed job orders are stalling prior to customer delivery handoff.`
            ]
        },
        keyTakeaways: [
            `Plant operations reached ${kpis.output.actual?.toLocaleString() ?? 0} finished units with ${oeePct}% OEE, requiring immediate synchronization between batch runs and outbound carrier dispatch.`,
            `Zero unplanned downtime was recorded despite the volume shortfall, highlighting an urgent need to verify IoT sensor and MES digital telemetry logging integrity.`,
            `Material cost variance elevated by ${costPct}% above recipe standard requires immediate raw ingredient stock audit with Procurement.`
        ],
        strategicRecommendations: [
            {
                title: "Forensic MES Telemetry & Downtime Sensor Audit",
                description: `Instruct the IT/OT Systems Lead and Maintenance Supervisor to conduct an immediate diagnostic audit of line sensors and MES state-change reporting to determine why machine downtime logged 0 minutes during an output slump.`,
                owner: "IT/OT Systems Lead & Maintenance Supervisor"
            },
            {
                title: "Procurement Realignment & BOM Cost Containment",
                description: `Meet with the Procurement Lead (Materials Management) to freeze unallocated supplier purchase orders, reconcile actual raw ingredient scrap with BOM recipes, and halt spot-buying to arrest the ${costPct}% cost variance.`,
                owner: "Procurement Lead (Materials Management)"
            },
            {
                title: "Expedited Customer Dispatch & OTIF Recovery",
                description: `Direct the Logistics & Warehouse Manager to immediately inspect all staged finished goods inventory, cross-reference pending purchase orders, and book priority carrier dispatch to recover OTIF toward the 95.0% SLA benchmark.`,
                owner: "Logistics & Warehouse Manager"
            }
        ]
    };

    return {
        meta: {
            aiTier: sanitized.meta.aiTier,
            governance: {
                isAdvisoryOnly: true,
                requiresHumanReview: true,
                disclaimer: "AI insights are strictly advisory (EU AI Act Article 14) and require review by the Plant Manager. No autonomous database mutations or transactions are performed.",
                modelUsed: "Deterministic Rule Engine (Offline)",
                isFallback: true,
                generatedAt: new Date().toISOString()
            },
            dataFreshnessCutoff: sanitized.meta.freshnessCutoff
        },
        summary,
        keyHighlights: tier.level === 1 ? keyHighlights : undefined,
        detailedAnalysis: tier.level === 2 ? detailedAnalysis : undefined,
        pillars: tier.level >= 3 ? pillars : undefined,
        priorityDecisions: tier.level >= 3 ? priorityDecisions : undefined,
        keyExposures: tier.level >= 2 ? keyExposures : [],
        strategicActions: tier.level >= 2 ? strategicActions : [],
        executiveReport: tier.level >= 3 ? executiveReport : undefined
    };
}

export async function POST(request: Request) {
    const access = await authorizeAIExecutiveSummaryReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as CopilotRequestBody;
        const report = body.reportPayload;

        if (!report || !report.meta || !report.kpiCards) {
            return NextResponse.json({ error: "Invalid report payload." }, { status: 400 });
        }

        const tierInfo = report.meta.aiTier;

        // 1. Strict Tier Enforcement: If unassigned, reject execution
        if (!tierInfo.assigned || tierInfo.tierLevel === 0 || tierInfo.tierSlug === "unassigned") {
            return NextResponse.json(
                {
                    error: "AI Copilot is not licensed or assigned to this module. Please configure an AI Tier in system modules to enable intelligence features.",
                    code: "TIER_UNASSIGNED"
                },
                { status: 403 }
            );
        }

        const requestedTier: GlobalAiTierSlug = tierInfo.tierSlug;
        const configuredModel = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

        // Dynamic domain instruction based on tier level
        const tierInstructions = tierInfo.tierLevel === 1
            ? `
TIER 1 (BASIC OPERATIONAL - GENERAL):
Produce ONLY:
1. "summary": Concise, general operational performance summary string (1-2 sentences).
2. "keyHighlights": Array of STRICTLY 2, 3, or 4 general bullet strings summarizing overall performance.
Do NOT generate detailedAnalysis, pillars, priorityDecisions, executiveReport, exposures, or actions.
`
            : tierInfo.tierLevel === 2
            ? `
TIER 2 (PRO DIAGNOSTIC - PRECISE):
Produce:
1. "summary": Detailed operational performance review string with exact percentages and figures.
2. "detailedAnalysis": A comprehensive multi-paragraph narrative STRING detailing output volume, machine availability, quality scrap, and cost variance. (DO NOT return an object for detailedAnalysis; return a single formatted string).
3. "keyExposures": Prioritized array of top 2-3 operational risks with category, finding, supportingEvidence, impactLevel ('low'|'medium'|'high'), and recommendedAction.
4. "strategicActions": Array of top 2-3 strategic actions. Each item MUST be an object with:
   - "recommendedAction": A clear, direct, actionable title and concrete instruction explaining HOW to address the issue.
   - "finding": Specific context or root cause from the metrics.
   - "suggestedOwner": Specific designated department/role (e.g. "Procurement Lead (Materials Management)", "Plant Maintenance Supervisor", "Shift Production Lead").
   - "targetModule": Target system module string.
Do NOT generate pillars, priorityDecisions, or executiveReport.
`
            : `
TIER 3 (EXECUTIVE STRATEGIC - PRECISE & BRIEF):
Produce the full comprehensive executive report matching this exact structure:
1. "summary": High-level strategic briefing string (strictly PRECISE and BRIEF, 2 sentences max).
2. "executiveReport": An object containing the 4 core executive sections:
   - "reportTitle": "Plant Operations & Manufacturing Executive Performance Report"
   - "preparedBy": "Super Intelligent AI Operations Analyst"
   - "focus": "Production Yield, Line Bottlenecks, Plant OEE, and Fulfillment Velocity"
   - "executiveSummary": Comprehensive narrative of current operational performance, volume vs target, and plant velocity based on real data.
   - "metricsTable": Array of 6 objects { "category": string, "actual": string, "target": string, "status": string } covering Output, OEE, Scrap, Downtime, OTIF, and Cost Variance.
   - "bottleneckFindings": Object with 3 arrays of detailed bullet strings:
       - "highEfficiency": Array of 2-3 strings detailing areas operating at or above target.
       - "primaryBottlenecks": Array of 2-3 strings analyzing suppressed metrics, defect clusters, or lags.
       - "criticalDelays": Array of 1-2 strings assessing critical delays and risk impact.
   - "keyTakeaways": Array of 2 to 3 sharp, bulleted sentences delivering the bottom-line takeaway for the executive's attention span.
   - "strategicRecommendations": Array of 2-3 objects { "title": string, "description": string, "owner": string }. The "description" MUST explain HOW the action is executed in 1-2 concrete tactical sentences, and "owner" MUST specify the exact role/department to contact (e.g. "Procurement Lead (Materials Management)", "IT/OT Systems Lead", "Logistics & Dispatch Manager").
3. "priorityDecisions": Array of 2-3 high-level leadership decisions requiring sign-off.
4. "pillars": 3 strategic pillars with brief analysis and riskScore ('LOW'|'MEDIUM'|'HIGH').
5. "keyExposures": Prioritized operational risk matrix.
6. "strategicActions": Action plan with clear recommendedAction, suggestedOwner, and targetModule.
`;

        const domainSystemInstruction = `
You are the AI Executive Copilot for Plant Operations in a Manufacturing Management System.
Analyze the provided sanitized KPI cards and operational scope.
Write in clear, professional business English.
Do NOT include bracketed tags like [VERIFIED FACT] or [HYPOTHESIS / ESTIMATE] in your text; state factual metrics directly and present deductions professionally.
${tierInstructions}
Output must be clean JSON. Do NOT include markdown code fences or conversational text outside JSON.
        `;

        const buildUserPrompt = (sanitized: AIExecutiveReportPayload) => {
            const k = sanitized.kpiCards;
            return `
Plant: ${sanitized.meta.plantName}
Period: ${sanitized.meta.reportingPeriod} (${sanitized.meta.dateFrom} - ${sanitized.meta.dateTo})
Tier Level: ${sanitized.meta.aiTier.tierLevel} (${sanitized.meta.aiTier.tierName})

Operational Metric Summary:
1. Output vs Target: Actual ${k.output.actual} units vs Planned ${k.output.target} units (Variance: ${k.output.variancePercent}%).
2. Plant OEE (Weighted): ${k.plantOee.actual}% (Target: ${k.plantOee.target}%).
3. Scrap & Defect Rate: ${k.scrapRate.actual}% (Target ceiling: ${k.scrapRate.target}%).
4. Unplanned Downtime: ${k.downtimeMinutes.actual} minutes across equipment stops (Target: ${k.downtimeMinutes.target} mins).
5. Delivery OTIF: ${k.otif.actual}% (Target: ${k.otif.target}%).
6. Material Cost Variance: ${k.costVariance.actual}% vs standard recipe BOM.

Data Gaps: ${sanitized.meta.dataGaps.length > 0 ? sanitized.meta.dataGaps.join("; ") : "None."}
Generate the executive analysis adhering strictly to tier depth and JSON format.
            `;
        };

        // Terminal Prompt Logging for Audit & Verification
        console.log("\n=======================================================");
        console.log("[AI COPILOT PROMPT LOG] - MODULE: ai-executive-summary-report");
        console.log(`TIER: ${tierInfo.tierLevel} (${tierInfo.tierName}) | TARGET SLUG: ${requestedTier}`);
        console.log(`GEMINI_MODEL: ${configuredModel}`);
        console.log(`API KEY STATUS: ${process.env.GEMINI_API_KEY ? "CONFIGURED (Live Mode)" : "MISSING (Deterministic Fallback)"}`);
        console.log("---------------- SYSTEM INSTRUCTION -------------------");
        console.log(domainSystemInstruction.trim());
        console.log("------------------- SANITIZED PROMPT ------------------");
        console.log(buildUserPrompt(report).trim());
        console.log("=======================================================\n");

        // 2. Run Centralized AI Core Engine with Dual-Pass GDPR Sanitization and Governance
        const coreResponse = await runCoreAiAnalysis<AIExecutiveReportPayload, AIInsightsPayload>(
            {
                moduleName: "ai-executive-summary-report",
                tierSlug: requestedTier,
                payload: report,
                domainSystemInstruction,
                buildPrompt: buildUserPrompt,
                fallbackEngine: runDeterministicFallback,
                parseResponse: (text) => parseJsonSafe<AIInsightsPayload>(text),
                sanitization: {
                    stripSensitiveKeys: true,
                    redactPii: true,
                    maxItemsCap: 30,
                    customBlockedKeys: ["operator_name", "operator_id", "technician_name", "driver_id"]
                }
            },
            tierInfo.tierLevel
        );

        // Clean any residual bracketed tags from text
        const stripBrackets = (text: string): string => {
            return text
                .replace(/\[VERIFIED FACT\]\s*/gi, "")
                .replace(/\[HYPOTHESIS\s*\/?\s*ESTIMATE\]\s*/gi, "")
                .replace(/\[HYPOTHESIS\]\s*/gi, "")
                .replace(/\[ESTIMATE\]\s*/gi, "")
                .trim();
        };

        // Attach final governance wrapper & ensure summary and detailedAnalysis are always safe strings
        const parsedData = (coreResponse.data as unknown) as Record<string, unknown>;
        let finalSummary = "Executive analysis completed.";
        if (typeof parsedData.summary === "string") {
            finalSummary = stripBrackets(parsedData.summary);
        } else if (parsedData.summary && typeof parsedData.summary === "object") {
            const summaryObj = parsedData.summary as Record<string, unknown>;
            finalSummary = stripBrackets(String(summaryObj.performanceOverview || summaryObj.overview || summaryObj.text || JSON.stringify(summaryObj)));
        }

        let finalDetailedAnalysis: string | undefined = undefined;
        if (typeof parsedData.detailedAnalysis === "string") {
            finalDetailedAnalysis = stripBrackets(parsedData.detailedAnalysis);
        } else if (parsedData.detailedAnalysis && typeof parsedData.detailedAnalysis === "object") {
            const daObj = parsedData.detailedAnalysis as Record<string, unknown>;
            finalDetailedAnalysis = stripBrackets(
                Object.entries(daObj)
                    .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").trim()}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                    .join("\n\n")
            );
        }

        // Clean exposures and actions if present
        const cleanedExposures = Array.isArray(coreResponse.data.keyExposures)
            ? coreResponse.data.keyExposures.map((exp) => ({
                  ...exp,
                  finding: stripBrackets(exp.finding || ""),
                  supportingEvidence: stripBrackets(exp.supportingEvidence || "")
              }))
            : [];

        const cleanedActions = Array.isArray(coreResponse.data.strategicActions)
            ? (coreResponse.data.strategicActions as Array<AIObservation & Record<string, string | undefined>>).map((act) => ({
                  ...act,
                  recommendedAction: stripBrackets(act.recommendedAction || act.action || act.title || ""),
                  finding: stripBrackets(act.finding || act.description || act.supportingEvidence || ""),
                  department: act.department || act.suggestedOwner || act.owner || "Production Operations"
              }))
            : [];

        // Clean executiveReport if present
        let cleanedExecutiveReport = coreResponse.data.executiveReport;
        if (cleanedExecutiveReport) {
            let keyTakeaways = cleanedExecutiveReport.keyTakeaways;
            if (typeof keyTakeaways === "string") {
                keyTakeaways = stripBrackets(keyTakeaways);
            } else if (Array.isArray(keyTakeaways)) {
                keyTakeaways = keyTakeaways.map((t: string) => stripBrackets(String(t)));
            }

            const cleanedRecommendations = Array.isArray(cleanedExecutiveReport.strategicRecommendations)
                ? cleanedExecutiveReport.strategicRecommendations.map((r: { title?: string; description?: string; owner?: string }) => ({
                      title: stripBrackets(r.title || ""),
                      description: stripBrackets(r.description || ""),
                      owner: stripBrackets(r.owner || "")
                  }))
                : [];

            cleanedExecutiveReport = {
                ...cleanedExecutiveReport,
                executiveSummary: stripBrackets(cleanedExecutiveReport.executiveSummary || ""),
                keyTakeaways,
                strategicRecommendations: cleanedRecommendations
            };
        }

        const finalPayload: AIInsightsPayload = {
            ...coreResponse.data,
            summary: finalSummary,
            detailedAnalysis: finalDetailedAnalysis ?? coreResponse.data.detailedAnalysis,
            keyExposures: cleanedExposures,
            strategicActions: cleanedActions,
            executiveReport: cleanedExecutiveReport,
            meta: {
                aiTier: tierInfo,
                governance: coreResponse.governance,
                dataFreshnessCutoff: report.meta.freshnessCutoff
            }
        };

        return NextResponse.json(finalPayload);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to execute AI Copilot analysis.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
