import { NextResponse } from "next/server";
import { authorizeProductionPerformanceReport } from "../../auth";
import { resolveServerAiTier } from "../../_report-service";
import { GoogleGenAI } from "@google/genai";
import { sanitizePayload, redactPiiFromString } from "@/lib/ai/guardrails";
import type {
    ProductionPerformanceReportPayload,
    ChatMessage
} from "@/modules/manufacturing-management/production-performance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
    messages: { role: "user" | "assistant"; content: string }[];
    reportPayload: ProductionPerformanceReportPayload;
}

export async function POST(request: Request) {
    const access = await authorizeProductionPerformanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as ChatRequestBody;
        const { messages, reportPayload } = body;

        if (!reportPayload || !reportPayload.meta || !reportPayload.kpis) {
            return NextResponse.json({ error: "Missing report payload." }, { status: 400 });
        }

        // Server-side AI tier verification (never trust client-supplied tier)
        const tierInfo = await resolveServerAiTier(request.signal);

        // Executive Tier Guard: Chatbot is exclusive to Executive Tier (Level 3)
        if (tierInfo.tierLevel < 3) {
            return NextResponse.json(
                {
                    error: "Interactive AI Chatbot is exclusive to Executive Tier (Level 3). Please upgrade the module AI Tier in system modules to access conversational intelligence.",
                    code: "EXECUTIVE_TIER_REQUIRED"
                },
                { status: 403 }
            );
        }

        const configuredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const apiKey = process.env.GEMINI_API_KEY;

        // GDPR Data Sanitization on Input Payload
        const sanitizedReport = sanitizePayload(reportPayload, {
            stripSensitiveKeys: true,
            redactPii: true,
            maxItemsCap: 40,
            customBlockedKeys: ["inspector_name", "inspector_id", "technician_name"]
        }) as ProductionPerformanceReportPayload;

        const kpis = sanitizedReport.kpis;
        const lastUserMessage =
            messages[messages.length - 1]?.content || "Summarize production performance.";
        const sanitizedQuestion = redactPiiFromString(lastUserMessage);

        const topLoss = sanitizedReport.topLossDrivers.slice(0, 5);
        const worstWorkCenter = [...sanitizedReport.workCenterThroughput].sort(
            (a, b) => (b.avgScrapRatePct || 0) - (a.avgScrapRatePct || 0)
        )[0];
        const criticalFails = sanitizedReport.qaParameterSummary.filter(
            (p) => p.isCritical && p.failedChecks > 0
        );
        const topDowntimes = sanitizedReport.downtimeEvents.slice(0, 4);

        const domainSystemInstruction = `
You are the Executive AI Copilot for Manufacturing Operations, Production Performance & Quality.
You are conversing directly with an Executive, Plant Director, or Production Manager regarding the currently loaded Production Performance AI Report.

Strict Operational Guidelines:
1. Tone: Professional, articulate, executive-ready — strictly PRECISE, DIRECT, and BRIEF.
2. Grounding: Answer strictly using verified facts from the loaded report context below. Do not guess or hallucinate unrecorded statistics.
3. Natural Executive Style:
   - Deliver findings directly in polished business English.
   - Use bold numbers and clear markdown bullet points for readability.
   - DO NOT use latex formatting (e.g. no \\frac, no LaTeX equations). Use plain text or standard markdown.
4. Actionable Specificity:
   - Clarify WHAT the bottleneck or loss driver is, HOW to address it, and WHO should take action.

Current Report Context:
- Period: ${sanitizedReport.meta.dateLabel}
- Product Filter: ${sanitizedReport.meta.productLabel}
- Work Center Filter: ${sanitizedReport.meta.workCenterLabel}
- Status Filter: ${sanitizedReport.meta.statusLabel}
- Total Evaluated Job Orders: ${kpis.totalJobOrders} (${kpis.completedJobOrders} completed, completion rate: ${kpis.completionRatePct !== null ? `${kpis.completionRatePct}%` : "N/A"})
- Estimated OEE: ${kpis.oeePct !== null ? `${kpis.oeePct}%` : "N/A"} (Availability: ${kpis.availabilityPct !== null ? `${kpis.availabilityPct}%` : "N/A"}, Performance: ${kpis.performancePct !== null ? `${kpis.performancePct}%` : "N/A"}, Quality: ${kpis.qualityPct !== null ? `${kpis.qualityPct}%` : "N/A"})
- Average Yield Rate: ${kpis.avgYieldRatePct !== null ? `${kpis.avgYieldRatePct}%` : "N/A"}
- Average Scrap Rate: ${kpis.avgScrapRatePct !== null ? `${kpis.avgScrapRatePct}%` : "N/A"}
- Average Rejection Rate: ${kpis.avgRejectionRatePct !== null ? `${kpis.avgRejectionRatePct}%` : "N/A"}
- QA Pass Rate: ${kpis.qaPassRatePct !== null ? `${kpis.qaPassRatePct}%` : "N/A"}
- Average Cycle Time: ${kpis.avgCycleTimeHrs !== null ? `${kpis.avgCycleTimeHrs} hrs` : "N/A"}
- Total Unplanned Downtime: ${kpis.totalDowntimeHrs !== null ? `${kpis.totalDowntimeHrs} hrs` : "0 hrs"} (${sanitizedReport.downtimeEvents.length} maintenance events)
- Top Loss Drivers: ${topLoss.map((l) => `${l.label} (${l.lossQty.toLocaleString()} units, ${l.percentageOfTotal}%)`).join("; ") || "None"}
- Highest Scrap Station: ${worstWorkCenter ? `${worstWorkCenter.workCenterName} (${worstWorkCenter.avgScrapRatePct}% scrap, ${worstWorkCenter.actualQty.toLocaleString()} units)` : "None"}
- Critical QA Parameter Failures: ${criticalFails.map((p) => `${p.parameterName} (${p.failedChecks} failures, ${p.passRatePct}% pass)`).join("; ") || "None"}
- Top Downtime Incidents: ${topDowntimes.map((d) => `${d.assetName}: ${d.durationHrs} hrs (${d.breakdownCategory || "Breakdown"} - ${d.rootCause || "Unspecified"})`).join("; ") || "None"}
        `.trim();

        // Print debug trace in terminal console
        const printDebugTrace = (engineName: string, responseText: string) => {
            console.log("\n=======================================================");
            console.log("[AI COPILOT CHAT DEBUG LOG] - MODULE: production-performance-report");
            console.log(`TIMESTAMP: ${new Date().toISOString()}`);
            console.log(`TIER: Level ${tierInfo.tierLevel} (${tierInfo.tierName}) | ENGINE: ${engineName}`);
            console.log(`EXECUTIVE QUERY: "${sanitizedQuestion}"`);
            console.log("---------------- FILTER CONTEXT -----------------------");
            console.log(`Period: ${sanitizedReport.meta.dateLabel} | Product: ${sanitizedReport.meta.productLabel} | Station: ${sanitizedReport.meta.workCenterLabel}`);
            console.log("---------------- KPIS ---------------------------------");
            console.log(`OEE: ${kpis.oeePct}% | Yield: ${kpis.avgYieldRatePct}% | Scrap: ${kpis.avgScrapRatePct}% | QA: ${kpis.qaPassRatePct}% | Downtime: ${kpis.totalDowntimeHrs} hrs`);
            console.log("---------------- RESPONSE DELIVERED -------------------");
            console.log(responseText);
            console.log("=======================================================\n");
        };

        // Fallback execution if no Gemini API Key is present
        if (!apiKey) {
            console.warn(
                "[Production Performance AI Chat] No GEMINI_API_KEY detected. Executing deterministic conversational response."
            );
            const qLower = sanitizedQuestion.toLowerCase();
            let fallbackAnswer = "";

            if (
                qLower.includes("bottleneck") ||
                qLower.includes("loss") ||
                qLower.includes("drag") ||
                qLower.includes("driver")
            ) {
                if (topLoss.length > 0) {
                    const lossLines = topLoss
                        .map(
                            (l) =>
                                `• **${l.label}** (${l.lossType.replace("_", " ").toUpperCase()}): Loss volume of **${l.lossQty.toLocaleString()} units** (${l.percentageOfTotal}% of total recorded loss).`
                        )
                        .join("\n");
                    fallbackAnswer =
                        `**Identified Production Bottlenecks & Loss Drivers** for **${sanitizedReport.meta.dateLabel}**:\n\n` +
                        `${lossLines}\n\n` +
                        (worstWorkCenter
                            ? `**Station Concentration**: Work center **${worstWorkCenter.workCenterName}** is exhibiting the highest scrap intensity at **${worstWorkCenter.avgScrapRatePct}% scrap rate** across ${worstWorkCenter.jobOrderCount} batches.\n\n`
                            : "") +
                        `**Recommended Action:** The **Plant Production Supervisor** should audit tooling tolerances and operator machine calibration at ${worstWorkCenter?.workCenterName || "the primary work center"} to mitigate high-volume scrap.`;
                } else {
                    fallbackAnswer = `Across the filtered scope for **${sanitizedReport.meta.dateLabel}**, there are **no recorded yield losses or scrap drivers**. Production volume tracked cleanly across all ${kpis.totalJobOrders} job orders.`;
                }
            } else if (
                qLower.includes("scrap") ||
                qLower.includes("yield") ||
                qLower.includes("rejection")
            ) {
                const yieldStr = kpis.avgYieldRatePct !== null ? `${kpis.avgYieldRatePct}%` : "N/A";
                const scrapStr = kpis.avgScrapRatePct !== null ? `${kpis.avgScrapRatePct}%` : "N/A";
                const rejStr = kpis.avgRejectionRatePct !== null ? `${kpis.avgRejectionRatePct}%` : "N/A";

                fallbackAnswer =
                    `**Yield & Material Scrap Analysis**:\n\n` +
                    `• **Average Yield Rate**: **${yieldStr}** (${kpis.completedJobOrders} of ${kpis.totalJobOrders} batches completed).\n` +
                    `• **Average Scrap Rate**: **${scrapStr}** lost during in-process transformation.\n` +
                    `• **Defect Rejection Rate**: **${rejStr}** of target volume.\n\n` +
                    (kpis.avgScrapRatePct !== null && kpis.avgScrapRatePct > 1.5
                        ? `**Operational Alert:** Scrap rate is running above acceptable lean limits (benchmark: < 1.0%). Focus scrap containment on ${topLoss[0]?.label || "the leading loss driver"} to recover lost margins.`
                        : `Material conversion efficiency is within expected tolerances. Maintain standard shift controls.`);
            } else if (
                qLower.includes("oee") ||
                qLower.includes("overall equipment") ||
                qLower.includes("efficiency") ||
                qLower.includes("availability") ||
                qLower.includes("performance")
            ) {
                const oeeStr = kpis.oeePct !== null ? `${kpis.oeePct}%` : "N/A";
                const availStr = kpis.availabilityPct !== null ? `${kpis.availabilityPct}%` : "N/A";
                const perfStr = kpis.performancePct !== null ? `${kpis.performancePct}%` : "N/A";
                const qualStr = kpis.qualityPct !== null ? `${kpis.qualityPct}%` : "N/A";

                fallbackAnswer =
                    `**Overall Equipment Effectiveness (OEE) Breakdown**:\n\n` +
                    `• **Estimated OEE**: **${oeeStr}**\n` +
                    `• **Availability Rate**: **${availStr}** (driven by ${kpis.totalDowntimeHrs || 0} hrs of unplanned equipment downtime)\n` +
                    `• **Performance Rate**: **${perfStr}** (actual produced units vs planned capacity targets)\n` +
                    `• **Quality Rate**: **${qualStr}** (in-process inspection pass rate and finished goods release)\n\n` +
                    `**Strategic Summary:** OEE reflects the compound product of Availability, Performance, and Quality. ` +
                    (kpis.oeePct !== null && kpis.oeePct < 65
                        ? `Current OEE is below world-class manufacturing benchmark (85%). Priority focus should be on reducing equipment breakdown downtime and elevating QA test compliance.`
                        : `Overall line effectiveness is healthy across the active evaluation period.`);
            } else if (
                qLower.includes("downtime") ||
                qLower.includes("maintenance") ||
                qLower.includes("breakdown") ||
                qLower.includes("equipment") ||
                qLower.includes("machine")
            ) {
                if (sanitizedReport.downtimeEvents.length > 0) {
                    const dtLines = topDowntimes
                        .map(
                            (d) =>
                                `• **${d.assetName}**: **${d.durationHrs} hrs** (${d.breakdownCategory || "Unplanned Breakdown"}${d.rootCause ? ` - Root Cause: ${d.rootCause}` : ""})`
                        )
                        .join("\n");
                    fallbackAnswer =
                        `**Equipment Downtime & Maintenance Episodes**:\n\n` +
                        `• **Total Unplanned Downtime**: **${kpis.totalDowntimeHrs || 0} hours** across **${sanitizedReport.downtimeEvents.length} episode(s)**.\n\n` +
                        `**Top Incidents**:\n${dtLines}\n\n` +
                        `**Maintenance Recommendation:** The **Maintenance Lead** should implement preventive maintenance inspections on assets experiencing repeat electrical or mechanical faults.`;
                } else {
                    fallbackAnswer = `Good operational news: across the filtered period for **${sanitizedReport.meta.dateLabel}**, there was **0 hours of recorded unplanned downtime**. Equipment availability remained at 100%.`;
                }
            } else if (
                qLower.includes("qa") ||
                qLower.includes("quality") ||
                qLower.includes("test") ||
                qLower.includes("inspection") ||
                qLower.includes("fail")
            ) {
                const qaStr = kpis.qaPassRatePct !== null ? `${kpis.qaPassRatePct}%` : "N/A";
                const failLines = criticalFails.length > 0
                    ? criticalFails
                          .map(
                              (p) =>
                                  `• **CRITICAL: ${p.parameterName}**: Pass rate of **${p.passRatePct}%** (${p.failedChecks} failure(s) out of ${p.totalChecks} checks).`
                          )
                          .join("\n")
                    : "• No critical parameter failures detected.";

                fallbackAnswer =
                    `**Quality Assurance & Inspection Compliance**:\n\n` +
                    `• **Overall QA Pass Rate**: **${qaStr}** across all logged in-process route inspections.\n` +
                    `• **Critical Parameter Compliance**:\n${failLines}\n\n` +
                    `**Quality Recommendation:** The **QA Supervisor** must inspect calibration records and verify batch containment for batches failing critical QA specifications.`;
            } else if (
                qLower.includes("action") ||
                qLower.includes("recommend") ||
                qLower.includes("corrective") ||
                qLower.includes("priorit")
            ) {
                fallbackAnswer =
                    `**Top Recommended Corrective Actions** for **${sanitizedReport.meta.dateLabel}**:\n\n` +
                    `1. **Scrap Containment**: Audit work center ${worstWorkCenter?.workCenterName || "hotspots"} to address the **${topLoss[0]?.label || "primary loss driver"}** (${topLoss[0]?.lossQty.toLocaleString() || 0} units lost).\n` +
                    `2. **OEE Recovery**: Mitigate ${kpis.totalDowntimeHrs || 0} hours of downtime through preventive asset servicing.\n` +
                    `3. **Critical QA Compliance**: Revalidate testing protocols for ${criticalFails[0]?.parameterName || "critical inspection parameters"} before authorizing final lot release.\n` +
                    `4. **FEFO Inventory Dispatch**: Ensure lots closest to expiration are transferred and shipped first to prevent inventory aging.`;
            } else {
                fallbackAnswer =
                    `Executive briefing for **${sanitizedReport.meta.dateLabel}** (${sanitizedReport.meta.productLabel}, ${sanitizedReport.meta.workCenterLabel}):\n\n` +
                    `• **Evaluated Volume**: **${kpis.totalJobOrders} job orders** (${kpis.completedJobOrders} completed).\n` +
                    `• **Estimated OEE**: **${kpis.oeePct !== null ? `${kpis.oeePct}%` : "N/A"}** (Availability: ${kpis.availabilityPct !== null ? `${kpis.availabilityPct}%` : "N/A"}, Quality: ${kpis.qualityPct !== null ? `${kpis.qualityPct}%` : "N/A"}).\n` +
                    `• **Material Yield**: **${kpis.avgYieldRatePct !== null ? `${kpis.avgYieldRatePct}%` : "N/A"}** with scrap at **${kpis.avgScrapRatePct !== null ? `${kpis.avgScrapRatePct}%` : "N/A"}**.\n` +
                    `• **Downtime Impact**: **${kpis.totalDowntimeHrs || 0} hours** across ${sanitizedReport.downtimeEvents.length} events.\n\n` +
                    `What specific operational area, station, or QA metric would you like to drill into?`;
            }

            printDebugTrace("DETERMINISTIC_FALLBACK", fallbackAnswer);

            const responseMessage: ChatMessage = {
                id: `chat-${Date.now()}`,
                role: "assistant",
                content: fallbackAnswer,
                timestamp: new Date().toISOString(),
                modelUsed: `${tierInfo.tierName} Deterministic Engine`
            };

            return NextResponse.json({ message: responseMessage, modelUsed: responseMessage.modelUsed });
        }

        // Live Gemini API Execution
        const ai = new GoogleGenAI({ apiKey });

        const chatPrompt = `
Executive Inquiry: "${sanitizedQuestion}"

Recent Conversation History:
${messages
    .slice(-4, -1)
    .map((m) => `${m.role === "user" ? "Executive" : "Assistant"}: ${m.content}`)
    .join("\n")}

Instructions:
- Provide an articulate, executive-level response answering the inquiry using the provided report context.
- Keep response strictly to 1-3 concise paragraphs or bullet points.
- Highlight key numbers in bold.
- DO NOT use latex equations or latex symbols.
        `.trim();

        const result = await ai.models.generateContent({
            model: configuredModel,
            contents: chatPrompt,
            config: {
                systemInstruction: domainSystemInstruction,
                temperature: 0.2,
                maxOutputTokens: 800
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
