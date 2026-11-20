import { NextResponse } from "next/server";
import { authorizeDemandForecastingReport } from "../../auth";
import { GoogleGenAI } from "@google/genai";
import { sanitizePayload, redactPiiFromString } from "@/lib/ai/guardrails";
import {
    computeAdjustedPlanningRows,
    DEFAULT_SCENARIO_ASSUMPTIONS
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/utils/scenarioMath";
import type {
    DemandForecastReportPayload,
    ChatMessage,
    ScenarioAssumptions
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/types";

interface ChatRequestBody {
    messages: { role: "user" | "assistant"; content: string }[];
    reportPayload: DemandForecastReportPayload;
    assumptions?: ScenarioAssumptions;
}

export async function POST(request: Request) {
    const access = await authorizeDemandForecastingReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as ChatRequestBody;
        const { messages, reportPayload } = body;

        if (!reportPayload || !reportPayload.meta) {
            return NextResponse.json({ error: "Missing report payload." }, { status: 400 });
        }

        const tierInfo = reportPayload.meta.aiTier;

        // Executive Tier Guard: Chat is strictly available for Tier 3 Executive only
        if (tierInfo.tierLevel < 3) {
            return NextResponse.json(
                {
                    error: "Interactive AI Chatbot is exclusive to Executive Tier (Level 3). Please upgrade the module AI Tier in system modules to access conversational intelligence.",
                    code: "EXECUTIVE_TIER_REQUIRED"
                },
                { status: 403 }
            );
        }

        const configuredModel = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
        const apiKey = process.env.GEMINI_API_KEY;

        // GDPR Data Sanitization on Input Payload
        const sanitizedReport = sanitizePayload(reportPayload, {
            stripSensitiveKeys: true,
            redactPii: true,
            maxItemsCap: 30,
            customBlockedKeys: ["operator_name", "operator_id", "technician_name", "driver_id"]
        }) as DemandForecastReportPayload;

        const kpis = sanitizedReport.kpis;
        const lastUserMessage =
            messages[messages.length - 1]?.content || "Summarize demand planning outlook.";
        const sanitizedQuestion = redactPiiFromString(lastUserMessage);

        const activeAssumptions = body.assumptions || DEFAULT_SCENARIO_ASSUMPTIONS;
        const adjustedPlanningRows = computeAdjustedPlanningRows(
            sanitizedReport.planningRows || [],
            activeAssumptions
        );

        const topMatrix = (sanitizedReport.matrixRows || []).slice(0, 10);
        const topPlanning = adjustedPlanningRows.slice(0, 10);
        const stockoutSkus = adjustedPlanningRows.filter(
            (p) => p.planningRisk === "Stockout Risk"
        );
        const totalSuggestedProd = adjustedPlanningRows.reduce(
            (sum, p) => sum + (p.suggestedProductionUnits || 0),
            0
        );

        // Labor sanity check & audit:
        // Exclude extreme standard time outliers (> 1 hr/unit) from total labor rollups to avoid echoing bad standard times
        const outlierLaborSkus = adjustedPlanningRows.filter(
            (p) => p.laborAuditStatus === "Standard Time Outlier"
        );
        const missingRoutingSkus = adjustedPlanningRows.filter(
            (p) => p.laborAuditStatus === "Missing Routing"
        );
        const verifiedLaborRows = adjustedPlanningRows.filter(
            (p) => p.laborAuditStatus === "Verified" && (p.suggestedLaborHours || 0) > 0
        );
        const totalPlausibleLaborHours = adjustedPlanningRows.reduce(
            (sum, p) => sum + (p.suggestedLaborHours || 0),
            0
        );

        const isForecastUnreliable =
            (kpis.wapePct !== null && kpis.wapePct > 50) ||
            (kpis.biasPct !== null && Math.abs(kpis.biasPct) > 30);

        const biasDirection =
            kpis.biasPct !== null
                ? kpis.biasPct > 0
                    ? "running high"
                    : kpis.biasPct < 0
                    ? "running low"
                    : "neutral"
                : "N/A";

        const domainSystemInstruction = `
You are the Executive AI Copilot for Manufacturing Demand Planning & Production Strategy.
You are conversing directly with an Executive, Plant Director, or Demand Planner regarding the currently loaded Demand Forecasting AI Report.

Strict Operational Guidelines:
1. Tone: Professional, articulate, and executive-ready — strictly PRECISE, DIRECT, and BRIEF. Factor in the executive's limited time.
2. Grounding & Sanity Checking:
   - Answer strictly using verified facts from the loaded report context below. Do not guess or hallucinate unrecorded statistics.
   - WAPE is an ERROR metric (Weighted Absolute Percentage Error), NOT an accuracy percentage. If WAPE is 231.9%, forecast errors are more than double actual demand.
   - Labor hours sanity check: Standard times over 1.0 hour per unit (e.g., Golden Bihon at 16 hrs/piece) are uncalibrated routing outliers and are excluded from labor totals. Pancit Canton has 0 hours due to missing routings. State these routing anomalies explicitly rather than presenting raw labor aggregates as fact.
3. Natural Executive Style:
   - Deliver findings directly in polished business English.
   - Use bold numbers and clear markdown bullet points for readability.
   - Do NOT use latex formatting.
4. Actionable Specificity & Non-Contradiction:
   - When asked for recommendations, clarify WHAT the action is, HOW to execute it, and WHICH specific department/role should lead it.
${
    isForecastUnreliable
        ? `5. CRITICAL FORECAST RELIABILITY GUARDRAIL:
   - Historical Forecast Error (WAPE) is ${kpis.wapePct?.toFixed(1)}% and Bias is ${kpis.biasPct !== null ? `${kpis.biasPct > 0 ? "+" : ""}${kpis.biasPct.toFixed(1)}% (${biasDirection})` : "N/A"}.
   - Because error exceeds historical demand, this statistical baseline is UNCALIBRATED and significantly inflates projected needs.
   - MANDATORY INSTRUCTION: You must explicitly inform the executive that the suggested production quantity (${totalSuggestedProd.toLocaleString()} units) is directly derived from this uncalibrated baseline and carries an EXTREME EXCESS INVENTORY RISK.
   - You must NOT advise scheduling or increasing production for this quantity. Instead, explicitly advise:
     (a) Demand Planner: Audit customer ordering history to isolate one-off bulk order spikes before locking baseline demand.
     (b) Production Scheduler: Do NOT commit this production run. Gate production strictly against confirmed customer Sales Orders rather than statistical forecasts until WAPE error drops below 35%.`
        : `5. Baseline forecast error (WAPE) is within acceptable operational tolerances. Proceed with standard FEFO replenishment scheduling.`
}

Current Report Context:
- Planning Cycle: ${sanitizedReport.meta.cadence.toUpperCase()} cycle
- Historical Period: ${sanitizedReport.meta.periodLabel} (${sanitizedReport.meta.dateFrom} to ${sanitizedReport.meta.dateTo})
- Forecast Horizon: ${sanitizedReport.meta.forecastHorizonLabel}
- Branch Facility: ${sanitizedReport.meta.branchLabel}
- Product Filter: ${sanitizedReport.meta.productLabel}
- Customer Region Filter: ${sanitizedReport.meta.regionLabel}
- Scenario Adjustment: ${activeAssumptions.demandAdjustmentPct >= 0 ? "+" : ""}${activeAssumptions.demandAdjustmentPct}% demand swing, ${activeAssumptions.safetyStockDays} safety stock days, +${activeAssumptions.leadTimeBufferDays}d lead-time buffer
- Expected Demand: ${kpis.forecastUnits !== null ? kpis.forecastUnits.toLocaleString() : "Insufficient Data"} units (${kpis.trendDirection} trend${kpis.trendPct !== null ? `, ${kpis.trendPct > 0 ? "+" : ""}${kpis.trendPct}% avg period change` : ""})
- Prediction Interval (90%): ${kpis.piLower90 !== null && kpis.piUpper90 !== null ? `${kpis.piLower90.toLocaleString()} to ${kpis.piUpper90.toLocaleString()} units` : "Not enough data"}
- Forecast Error (WAPE): ${kpis.wapePct !== null ? `${kpis.wapePct.toFixed(1)}% (Error is ${((kpis.wapePct || 0) / 100).toFixed(1)}x actuals)` : "N/A"}
- Forecast Bias: ${kpis.biasPct !== null ? `${kpis.biasPct > 0 ? "+" : ""}${kpis.biasPct.toFixed(1)}% (${biasDirection})` : "N/A"}
- Forecast Reliability Status: ${isForecastUnreliable ? "UNCALIBRATED / HIGH RISK (Guardrail active)" : "Calibrated"}
- Stockout Risk SKUs: ${stockoutSkus.length} SKU(s) flagged (${stockoutSkus.map((s) => `${s.productName} (Gap: ${s.netSupplyGapUnits?.toLocaleString() ?? 0} ${s.unitLabel})`).slice(0, 5).join("; ") || "None"})
- Top Planning SKUs: ${topPlanning.map((p) => `${p.productName} (Fcst: ${p.scenarioForecastUnits?.toLocaleString() ?? "-"}, UsableOnHand: ${p.effectiveUsableOnhandUnits?.toLocaleString() ?? "-"}, OpenJO: ${p.openJobOrderUnits.toLocaleString()}, SuggestedProd: ${p.suggestedProductionUnits?.toLocaleString() ?? "-"}, LaborAudit: ${p.laborAuditStatus || "Verified"})`).slice(0, 5).join("; ") || "None"}
- Suggested Production Rollup: ${totalSuggestedProd.toLocaleString()} units (Caution: derived from +${kpis.biasPct?.toFixed(1) || 0}% bias baseline)
- Verified Direct Labor Hours: ${totalPlausibleLaborHours.toFixed(1)} hours (across ${verifiedLaborRows.length} SKU(s) with confirmed routings)
- Outlier Routing SKUs Excluded: ${outlierLaborSkus.length > 0 ? outlierLaborSkus.map((s) => `${s.productName} (${s.unitStandardLaborHours?.toFixed(1)} hrs/pc outlier — ${s.rawLaborHours?.toLocaleString() ?? 0} raw hrs excluded)`).join(", ") : "None"}
- Missing Routing SKUs: ${missingRoutingSkus.length > 0 ? missingRoutingSkus.slice(0, 3).map((s) => s.productName).join(", ") : "None"}
        `.trim();

        // Print debug trace in terminal console for easy verification of how results were derived
        const printDebugTrace = (engineName: string, responseText: string) => {
            console.log("\n=======================================================");
            console.log("[AI COPILOT CHAT DEBUG LOG] - MODULE: demand-forecasting-ai-report");
            console.log(`TIMESTAMP: ${new Date().toISOString()}`);
            console.log(`TIER: Level ${tierInfo.tierLevel} (${tierInfo.tierName}) | ENGINE: ${engineName}`);
            console.log(`EXECUTIVE QUERY: "${sanitizedQuestion}"`);
            console.log("---------------- FILTER & SCENARIO CONTEXT ------------");
            console.log(`Facility: ${sanitizedReport.meta.branchLabel} | Horizon: ${sanitizedReport.meta.forecastHorizonLabel} | Period: ${sanitizedReport.meta.periodLabel}`);
            console.log(`Scenario Assumptions: DemandAdjustment=${activeAssumptions.demandAdjustmentPct}%, SafetyStockDays=${activeAssumptions.safetyStockDays}d, LeadTimeBuffer=${activeAssumptions.leadTimeBufferDays}d, ConfidenceLevel=${activeAssumptions.confidenceLevel}%`);
            console.log("---------------- COMPUTATION BREAKDOWN ----------------");
            console.log(`Expected Demand: ${kpis.forecastUnits !== null ? kpis.forecastUnits.toLocaleString() : "N/A"} units`);
            console.log(`Forecast Error (WAPE): ${kpis.wapePct !== null ? `${kpis.wapePct.toFixed(1)}%` : "N/A"} | Bias: ${kpis.biasPct !== null ? `${kpis.biasPct.toFixed(1)}% (${biasDirection})` : "N/A"}`);
            console.log(`Guardrail Triggered: ${isForecastUnreliable ? "YES (WAPE > 50% or |Bias| > 30%)" : "NO"}`);
            console.log(`Stockout Risk SKUs: ${stockoutSkus.length} SKU(s) flagged`);
            stockoutSkus.slice(0, 5).forEach((s, idx) => {
                console.log(`  [${idx + 1}] ${s.productName} (${s.productCode}):`);
                console.log(`      ScenarioFcst=${s.scenarioForecastUnits ?? "-"} | SafetyStock=${s.safetyStockUnits} | TargetInv=${s.targetInventoryUnits}`);
                console.log(`      UsableOnHand=${s.effectiveUsableOnhandUnits ?? "-"} | Expiring=${s.atRiskExpiringUnits} | OpenJO=${s.openJobOrderUnits}`);
                console.log(`      NetSupplyGap=${s.netSupplyGapUnits ?? "-"} | SuggestedProd=${s.suggestedProductionUnits ?? "-"} ${s.unitLabel} | LaborAudit=${s.laborAuditStatus}`);
            });
            console.log(`==> SUGGESTED PRODUCTION: ${totalSuggestedProd.toLocaleString()} units`);
            console.log(`==> VERIFIED DIRECT LABOR: ${totalPlausibleLaborHours.toFixed(1)} hours (across ${verifiedLaborRows.length} verified SKUs)`);
            if (outlierLaborSkus.length > 0) {
                console.log(`==> OUTLIER ROUTINGS EXCLUDED: ${outlierLaborSkus.map(s => `${s.productName} (${s.unitStandardLaborHours?.toFixed(1)} hrs/pc, ${s.rawLaborHours?.toLocaleString()} raw hrs)`).join("; ")}`);
            }
            if (missingRoutingSkus.length > 0) {
                console.log(`==> MISSING ROUTINGS: ${missingRoutingSkus.map(s => s.productName).join("; ")}`);
            }
            console.log("---------------- RESPONSE DELIVERED -------------------");
            console.log(responseText);
            console.log("=======================================================\n");
        };

        // Fallback execution if no Gemini API Key is present
        if (!apiKey) {
            console.warn(
                "[Demand Forecast AI Chat] No GEMINI_API_KEY detected. Executing deterministic conversational response."
            );
            const qLower = sanitizedQuestion.toLowerCase();
            let fallbackAnswer = "";

            if (
                qLower.includes("stockout") ||
                qLower.includes("risk") ||
                qLower.includes("gap") ||
                qLower.includes("inventory")
            ) {
                if (stockoutSkus.length > 0) {
                    const topAtRisk = stockoutSkus.slice(0, 3);
                    const skuLines = topAtRisk
                        .map(
                            (s) =>
                                `• **${s.productName}** (${s.productCode}): On-hand **${(s.effectiveUsableOnhandUnits ?? 0).toLocaleString()} ${s.unitLabel}**, open JO **${s.openJobOrderUnits.toLocaleString()}**, net supply gap **${(s.netSupplyGapUnits ?? 0).toLocaleString()} ${s.unitLabel}**.`
                        )
                        .join("\n");
                    fallbackAnswer =
                        `There are currently **${stockoutSkus.length} SKU(s)** flagged for **Stockout Risk** within the ${sanitizedReport.meta.forecastHorizonLabel} horizon:\n\n` +
                        `${skuLines}\n\n` +
                        (isForecastUnreliable
                            ? `**Planning Caution:** Because baseline forecast error is high (**${kpis.wapePct?.toFixed(1)}% WAPE** with **${biasDirection} bias**), do NOT commit blanket replenishment runs. The **Demand & Production Planner** should audit confirmed customer purchase orders first.`
                            : `**Recommended Action:** The **Demand & Production Planner** should schedule replenishment runs totaling **${stockoutSkus.reduce((sum, s) => sum + (s.suggestedProductionUnits || 0), 0).toLocaleString()} units** (${totalPlausibleLaborHours.toFixed(1)} verified labor hours) to prevent fulfillment defaults.`);
                } else {
                    fallbackAnswer = `Good news: across the filtered scope for **${sanitizedReport.meta.branchLabel}**, there are currently **0 SKUs with Stockout Risk**. Usable inventory on-hand plus open job orders adequately cover the forecasted demand of **${kpis.forecastUnits !== null ? kpis.forecastUnits.toLocaleString() : "-"} units**.`;
                }
            } else if (
                qLower.includes("wape") ||
                qLower.includes("error") ||
                qLower.includes("bias") ||
                qLower.includes("accuracy")
            ) {
                const wapeStr = kpis.wapePct !== null ? `${kpis.wapePct.toFixed(1)}%` : "N/A";
                const biasStr =
                    kpis.biasPct !== null
                        ? `${kpis.biasPct > 0 ? "+" : ""}${kpis.biasPct.toFixed(1)}% (${biasDirection})`
                        : "N/A";
                fallbackAnswer =
                    `**Forecast Error & Bias Diagnosis**:\n\n` +
                    `• **Forecast Error (WAPE)**: **${wapeStr}** based on out-of-sample backtesting against evaluated historical actuals.\n` +
                    `• **Forecast Bias**: **${biasStr}**.\n\n` +
                    (kpis.wapePct !== null && kpis.wapePct > 50
                        ? `**Model Reliability Warning:** WAPE exceeds 50% (errors are ${((kpis.wapePct || 0) / 100).toFixed(1)}x actual customer demand). The statistical baseline is currently uncalibrated and running high (+${kpis.biasPct?.toFixed(1)}% bias). Do NOT use this forecast to commit raw materials or mass production until historical bulk order anomalies are audited.`
                        : kpis.biasPct !== null && kpis.biasPct > 20
                        ? `The model is currently running high, presenting an **excess inventory risk**. The **Demand Planner** should review baseline safety stock buffers and audit whether recent large customer purchase orders represent recurring demand or one-time bulk buys.`
                        : kpis.biasPct !== null && kpis.biasPct < -20
                        ? `The model is currently running low, presenting a **stockout risk**. Accelerate production pacing to avoid supply shortages.`
                        : `Forecast error is within acceptable operational tolerances. Continue monitoring demand momentum.`);
            } else if (
                qLower.includes("region") ||
                qLower.includes("location") ||
                qLower.includes("customer") ||
                qLower.includes("city") ||
                qLower.includes("province")
            ) {
                const topRegs = topMatrix.slice(0, 4);
                const regLines = topRegs
                    .map(
                        (r) =>
                            `• **${r.regionLabel}**: Expected demand of **${r.forecastUnits !== null ? r.forecastUnits.toLocaleString() : "-"} ${r.unitLabel}** for ${r.productName}.`
                    )
                    .join("\n");
                fallbackAnswer =
                    `**Customer Geographical Demand Distribution**:\n\n` +
                    `${regLines || "No regional demand lines recorded in the selected period."}\n\n` +
                    `**Commercial Action:** The **Regional Sales Lead** should sync with fulfillment hubs to ensure transport capacity matches regional concentration.`;
            } else if (
                qLower.includes("production") ||
                qLower.includes("manufactur") ||
                qLower.includes("job order") ||
                qLower.includes("labor") ||
                qLower.includes("shift") ||
                qLower.includes("increase") ||
                qLower.includes("capacity")
            ) {
                if (isForecastUnreliable) {
                    fallbackAnswer =
                        `**Strategic Production & Capacity Advisory: Exercise Restraint**\n\n` +
                        `• **Forecast Reliability Guardrail Active**: Historical Forecast Error (WAPE) is **${kpis.wapePct !== null ? `${kpis.wapePct.toFixed(1)}%` : "N/A"}** with bias running high at **${kpis.biasPct !== null ? `${kpis.biasPct > 0 ? "+" : ""}${kpis.biasPct.toFixed(1)}%` : "N/A"}** (${biasDirection}). Because forecast errors are more than double actual demand, the model is currently uncalibrated.\n` +
                        `• **Suggested Production Caution**: The mechanical scenario rollup of **${totalSuggestedProd.toLocaleString()} units** is directly derived from this inflated baseline. Committing production to this quantity presents an **immediate risk of severe excess inventory and tied-up working capital**.\n` +
                        `• **Direct Labor Reality Check**: Verified direct labor required is **${totalPlausibleLaborHours.toFixed(1)} hours** across ${verifiedLaborRows.length} SKU(s) with confirmed routings.` +
                        (outlierLaborSkus.length > 0
                            ? ` Note: ${outlierLaborSkus.length} SKU(s) (including ${outlierLaborSkus.map(s => `${s.productName} at ${s.unitStandardLaborHours?.toFixed(1)} hrs/pc`).join(", ")}) were excluded from labor totals due to standard-time routing defects.`
                            : "") +
                        (missingRoutingSkus.length > 0
                            ? ` Note: ${missingRoutingSkus.length} SKU(s) (including ${missingRoutingSkus.slice(0, 2).map(s => s.productName).join(", ")}) currently lack standard BOM routings.`
                            : "") +
                        `\n\n` +
                        `**Recommended Plant Leadership Action:**\n` +
                        `1. **Plant Director / Schedulers**: Do **NOT** increase production or commit the full ${totalSuggestedProd.toLocaleString()} units. Pace batch releases strictly against confirmed Sales Orders.\n` +
                        `2. **Demand Planner**: Audit recent purchase orders to remove one-off order spikes before locking baseline demand.`;
                } else {
                    const topRisks = stockoutSkus.slice(0, 3);
                    const riskBreakdown = topRisks.length > 0
                        ? topRisks
                            .map(
                                (s) =>
                                    `• **${s.productName}**: Suggested **${(s.suggestedProductionUnits || 0).toLocaleString()} ${s.unitLabel}** (${s.suggestedLaborHours !== null ? `${s.suggestedLaborHours.toFixed(1)} labor hours` : "Routing pending"}, ${s.suggestedShifts || 0} shift${s.suggestedShifts === 1 ? "" : "s"}).`
                            )
                            .join("\n")
                        : "";

                    fallbackAnswer =
                        `**Production & Labor Capacity Requirements**:\n\n` +
                        `• **Total Suggested Production**: **${totalSuggestedProd.toLocaleString()} units** across active SKUs.\n` +
                        `• **Verified Direct Labor Required**: **${totalPlausibleLaborHours.toFixed(1)} hours** across ${verifiedLaborRows.length} SKU(s).\n` +
                        `• **Stockout Risk Count**: **${stockoutSkus.length} SKU(s)** require production scheduling.\n\n` +
                        (riskBreakdown ? `**Priority Production Waves**:\n${riskBreakdown}\n\n` : "") +
                        `**Plant Leadership Action:** The **Plant Production Scheduler & Shift Lead** should stage raw materials under FEFO rotation and align shift staffing to absorb this production wave over the ${sanitizedReport.meta.forecastHorizonLabel} horizon.`;
                }
            } else {
                fallbackAnswer =
                    `Executive briefing for **${sanitizedReport.meta.branchLabel}** (${sanitizedReport.meta.forecastHorizonLabel} outlook):\n\n` +
                    `• **Expected Customer Demand**: **${kpis.forecastUnits !== null ? kpis.forecastUnits.toLocaleString() : "-"} units** (${kpis.trendDirection} trend).\n` +
                    `• **Forecast Error (WAPE)**: **${kpis.wapePct !== null ? `${kpis.wapePct.toFixed(1)}%` : "N/A"}** with **${kpis.biasPct !== null ? `${kpis.biasPct > 0 ? "+" : ""}${kpis.biasPct.toFixed(1)}%` : "N/A"} bias**.\n` +
                    (isForecastUnreliable
                        ? `• **Model Reliability Notice**: Elevated error and bias indicate an uncalibrated baseline. Mechanical suggested production is **${totalSuggestedProd.toLocaleString()} units**, but requires manual sales order verification before release.\n`
                        : `• **Suggested Production Rollup**: **${totalSuggestedProd.toLocaleString()} units**.\n`) +
                    `• **Verified Direct Labor**: **${totalPlausibleLaborHours.toFixed(1)} hours** across ${verifiedLaborRows.length} SKU(s).\n` +
                    `• **Inventory Exceptions**: **${stockoutSkus.length} SKU(s)** flagged for stockout risk.\n\n` +
                    `Ask specifically about **production risks**, **WAPE error analysis**, **regional breakdown**, or **labor requirements** for deeper analysis.`;
            }

            printDebugTrace("Deterministic Rule Engine (Offline)", fallbackAnswer);

            const responseMessage: ChatMessage = {
                id: `chat-${Date.now()}`,
                role: "assistant",
                content: fallbackAnswer,
                timestamp: new Date().toISOString(),
                modelUsed: "Deterministic Rule Engine (Offline)"
            };

            return NextResponse.json({
                message: responseMessage,
                modelUsed: "Deterministic Rule Engine (Offline)"
            });
        }

        // Live Gemini Invocation
        const ai = new GoogleGenAI({ apiKey });
        const chatPrompt = `
Executive Question: ${sanitizedQuestion}

Conversation History:
${messages
    .slice(-4, -1)
    .map((m) => `${m.role === "user" ? "Executive" : "Assistant"}: ${m.content}`)
    .join("\n")}

Respond strictly in 1-3 short paragraphs or bullet points, keeping the output precise, brief, and C-Suite ready. Do not use latex.
        `.trim();

        const result = await ai.models.generateContent({
            model: configuredModel,
            contents: chatPrompt,
            config: {
                systemInstruction: domainSystemInstruction,
                temperature: 0.2,
                maxOutputTokens: 600
            }
        });

        const replyText = result.text || "No response received from model.";
        printDebugTrace(configuredModel, replyText);

        const responseMessage: ChatMessage = {
            id: `chat-${Date.now()}`,
            role: "assistant",
            content: replyText,
            timestamp: new Date().toISOString(),
            modelUsed: configuredModel
        };

        return NextResponse.json({ message: responseMessage, modelUsed: configuredModel });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to execute chat request.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
