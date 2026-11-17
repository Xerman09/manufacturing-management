import { NextResponse } from "next/server";
import { authorizeAIExecutiveSummaryReport } from "../../auth";
import { GoogleGenAI } from "@google/genai";
import { sanitizePayload, redactPiiFromString } from "@/lib/ai/guardrails";
import type { AIExecutiveReportPayload, ChatMessage } from "@/modules/manufacturing-management/ai-executive-summary-report/types";

interface ChatRequestBody {
    messages: { role: "user" | "assistant"; content: string }[];
    reportPayload: AIExecutiveReportPayload;
}

export async function POST(request: Request) {
    const access = await authorizeAIExecutiveSummaryReport(request.signal);
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

        // 1. Executive Tier Guard: Chat is strictly available for Tier 3 Executive only
        if (tierInfo.tierLevel < 3) {
            return NextResponse.json(
                {
                    error: "Interactive AI Copilot Chat is exclusive to Executive Tier (Level 3). Please upgrade the module AI Tier in system modules to access conversational intelligence.",
                    code: "EXECUTIVE_TIER_REQUIRED"
                },
                { status: 403 }
            );
        }

        const configuredModel = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
        const apiKey = process.env.GEMINI_API_KEY;

        // 2. GDPR Data Sanitization on Input Payload
        const sanitizedReport = sanitizePayload(reportPayload, {
            stripSensitiveKeys: true,
            redactPii: true,
            maxItemsCap: 30,
            customBlockedKeys: ["operator_name", "operator_id", "technician_name", "driver_id"]
        });

        const k = sanitizedReport.kpiCards;
        const lastUserMessage = messages[messages.length - 1]?.content || "Summarize operational performance.";
        const sanitizedQuestion = redactPiiFromString(lastUserMessage);

        const domainSystemInstruction = `
You are the Executive AI Copilot for Manufacturing Plant Operations.
You are conversing directly with a C-Suite Executive or Plant Director regarding the currently loaded Executive Summary Report.

Strict Operational Guidelines:
1. Tone: Professional, articulate, and executive-ready — strictly PRECISE, DIRECT, and BRIEF. Factor in the executive's limited time.
2. Grounding: Answer strictly using verified facts from the loaded report context below. Do not guess or hallucinate unrecorded statistics.
3. Natural Executive Style:
   - Do NOT use bracketed tags like [VERIFIED FACT], [ESTIMATE], or [HYPOTHESIS].
   - Deliver findings directly in polished business English.
   - Use bold numbers and clear markdown bullet points for readability.
4. Actionable Specificity: When asked for recommendations, clarify WHAT the action is, HOW to execute it, and WHICH specific department/role should lead it (e.g., Procurement Lead, Plant Maintenance Supervisor, Logistics & Dispatch Manager).
5. If the requested data is not present in the report or is zero, clearly state that no records or events were logged for that query.

Current Report Context:
- Plant Facility: ${sanitizedReport.meta.plantName}
- Reporting Period: ${sanitizedReport.meta.reportingPeriod} (${sanitizedReport.meta.dateFrom} - ${sanitizedReport.meta.dateTo})
- Output vs Target: ${k.output.actual} units produced vs ${k.output.target} target (${k.output.variancePercent}% variance)
- Plant OEE (Weighted): ${k.plantOee.actual}% vs ${k.plantOee.target}% benchmark
- Scrap & Defect Rate: ${k.scrapRate.actual}% vs ${k.scrapRate.target}% quality ceiling
- Unplanned Downtime: ${k.downtimeMinutes.actual} minutes logged across equipment lines (Target: ${k.downtimeMinutes.target} mins)
- Customer Fulfillment OTIF: ${k.otif.actual}% vs ${k.otif.target}% SLA
- Material Cost Variance: ${k.costVariance.actual}% vs standard recipe BOM
        `.trim();

        // 3. Terminal Prompt Logging for Audit & Verification
        console.log("\n=======================================================");
        console.log("[AI COPILOT CHAT PROMPT LOG] - MODULE: ai-executive-summary-report");
        console.log(`TIER: ${tierInfo.tierLevel} (${tierInfo.tierName}) | FEATURE: Executive Interactive Chat`);
        console.log(`GEMINI_MODEL: ${configuredModel}`);
        console.log(`API KEY STATUS: ${apiKey ? "CONFIGURED (Live Mode)" : "MISSING (Deterministic Fallback)"}`);
        console.log("---------------- SYSTEM INSTRUCTION -------------------");
        console.log(domainSystemInstruction);
        console.log("------------------- SANITIZED USER QUESTION -----------");
        console.log(sanitizedQuestion);
        console.log("=======================================================\n");

        // 4. Fallback execution if no Gemini API Key is present
        if (!apiKey) {
            console.warn("[Core AI Chat] No GEMINI_API_KEY detected. Executing deterministic conversational response.");
            const qLower = sanitizedQuestion.toLowerCase();
            let fallbackAnswer = "";

            if (qLower.includes("oee") || qLower.includes("equipment")) {
                fallbackAnswer = `**Plant Overall Equipment Effectiveness (OEE)** is currently **${k.plantOee.actual}%** against the **${k.plantOee.target}%** world-class baseline.\n\n` +
                    `While unplanned downtime remained controlled at **${k.downtimeMinutes.actual} minutes**, performance is severely constrained by production volume throughput. To recover OEE, the **Plant Operations Lead** should rebalance work center staffing and accelerate batch job order completions.`;
            } else if (qLower.includes("scrap") || qLower.includes("defect") || qLower.includes("quality")) {
                fallbackAnswer = `**Scrap & Defect Rate** is **${k.scrapRate.actual}%**, compared to our **${k.scrapRate.target}** engineering tolerance ceiling.\n\n` +
                    `Quality containment is operating within limits. However, the **QA Supervisor** should maintain active station temperature monitoring to avoid finished batch quarantines during high-speed runs.`;
            } else if (qLower.includes("downtime") || qLower.includes("stop") || qLower.includes("maintenance")) {
                fallbackAnswer = `**Unplanned Machine Downtime** stands at **${k.downtimeMinutes.actual} minutes** against an SLA ceiling of **${k.downtimeMinutes.target}**.\n\n` +
                    `Given the significant production shortfall, the **IT/OT Systems Lead** and **Head of Maintenance** should urgently audit MES telemetry to verify that idle machine hours are not being masked as operational uptime.`;
            } else if (qLower.includes("delivery") || qLower.includes("otif") || qLower.includes("sales") || qLower.includes("dispatch")) {
                fallbackAnswer = `**On-Time In-Full Delivery (OTIF)** is currently **${k.otif.actual}%** against the **${k.otif.target}** commercial SLA.\n\n` +
                    `Completed purchase orders are experiencing staging lags at the shipping docks. The **Logistics & Dispatch Manager** must immediately expedite carrier bookings for pending finished goods to eliminate customer backlog.`;
            } else if (qLower.includes("cost") || qLower.includes("material") || qLower.includes("variance")) {
                fallbackAnswer = `**Material Consumption Variance** is **${k.costVariance.actual}%** against the standard recipe BOM.\n\n` +
                    `This represents a substantial financial overage. The **Procurement Lead (Materials Management)** should audit raw ingredient consumption logs, halt emergency spot-purchases, and verify supplier batch dosing.`;
            } else {
                fallbackAnswer = `For **${sanitizedReport.meta.plantName}** (${sanitizedReport.meta.reportingPeriod}), production output reached **${k.output.actual} units** against a target of **${k.output.target} units** (${k.output.variancePercent}% variance).\n\n` +
                    `Plant OEE is currently **${k.plantOee.actual}%** with material cost variance at **${k.costVariance.actual}%**. Primary leadership priority is syncing finished goods staging with outbound carriers via the **Logistics Manager** and auditing raw material usage with **Procurement**.`;
            }

            const responseMessage: ChatMessage = {
                id: `chat-${Date.now()}`,
                role: "assistant",
                content: fallbackAnswer,
                timestamp: new Date().toISOString()
            };

            return NextResponse.json({ message: responseMessage, modelUsed: "Deterministic Rule Engine (Offline)" });
        }

        // 5. Live Gemini Invocation
        const ai = new GoogleGenAI({ apiKey });
        const chatPrompt = `
Executive Question: ${sanitizedQuestion}

Conversation History:
${messages.slice(-4, -1).map((m) => `${m.role === "user" ? "Executive" : "Assistant"}: ${m.content}`).join("\n")}

Respond strictly in 1-3 short paragraphs, keeping the output precise, brief, and C-Suite ready.
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

        const responseMessage: ChatMessage = {
            id: `chat-${Date.now()}`,
            role: "assistant",
            content: replyText,
            timestamp: new Date().toISOString()
        };

        return NextResponse.json({ message: responseMessage, modelUsed: configuredModel });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to execute chat request.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
