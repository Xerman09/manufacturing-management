import { NextResponse } from "next/server";
import { authorizeQualityIntelligenceReport } from "../../auth";
import { resolveServerAiTier } from "../../_report-service";
import { GoogleGenAI } from "@google/genai";
import { sanitizePayload, redactPiiFromString } from "@/lib/ai/guardrails";
import type { QualityReportPayload } from "@/modules/manufacturing-management/quality-intelligence-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
    messages: { role: "user" | "assistant"; content: string }[];
    reportPayload: QualityReportPayload;
}

export async function POST(request: Request) {
    const access = await authorizeQualityIntelligenceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as ChatRequestBody;
        const { messages, reportPayload } = body;

        if (!reportPayload || !reportPayload.meta || !reportPayload.kpis) {
            return NextResponse.json({ error: "Missing report payload." }, { status: 400 });
        }

        const tierInfo = await resolveServerAiTier(request.signal);
        if (tierInfo.tierLevel < 3) {
            return NextResponse.json(
                {
                    error: "Interactive Quality AI Chatbot is exclusive to Executive Tier (Level 3). Please upgrade module tier in Directus modules to access conversational intelligence.",
                    code: "EXECUTIVE_TIER_REQUIRED"
                },
                { status: 403 }
            );
        }

        const configuredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const apiKey = process.env.GEMINI_API_KEY;

        const sanitizedReport = sanitizePayload(reportPayload, {
            stripSensitiveKeys: true,
            redactPii: true,
            maxItemsCap: 40
        }) as QualityReportPayload;

        const kpis = sanitizedReport.kpis;
        const lastUserMessage =
            messages[messages.length - 1]?.content || "Summarize quality intelligence.";
        const sanitizedQuestion = redactPiiFromString(lastUserMessage);

        const domainSystemInstruction = `
You are the Executive AI Copilot for Manufacturing Quality Intelligence, Root-Cause Analysis, and Lot Traceability.
You are conversing with a Plant Quality Director or Operations Manager regarding the currently loaded Quality Intelligence Report.

Guidelines:
1. Tone: Professional, direct, articulate, concise.
2. Grounding: Answer strictly using facts and figures from the loaded Quality Intelligence context below.
3. Scope: Job order production quality only. If asked about purchase orders, receiving inspections or supplier performance, state that this report does not cover them.
4. Rule on Hypotheses: When discussing potential causes for defects, explicitly state that correlations are hypotheses pending QA confirmation.
5. DO NOT use LaTeX formatting (e.g. no \\frac). Use standard text or markdown.
6. Provide actionable containment steps when asked about defect resolutions.

Current Report Context:
- Period: ${sanitizedReport.meta.dateLabel}
- Evaluated Batches: ${kpis.totalJobOrders}
- Defect Rate: ${kpis.defectRatePct !== null ? `${kpis.defectRatePct}%` : "undetermined"}
- First Pass Yield (FPY): ${kpis.fpyPct !== null ? `${kpis.fpyPct}%` : "undetermined"}
- Scrap Rate: ${kpis.scrapRatePct !== null ? `${kpis.scrapRatePct}%` : "undetermined"}
- Repeat Defect Types: ${kpis.repeatDefectCount}
- Active QA Hold Batches: ${kpis.qaHoldBatchCount}
- Inspected Units: ${kpis.totalInspectedUnits.toLocaleString()} (Defective: ${kpis.totalDefectiveUnits.toLocaleString()}, Scrap: ${kpis.totalScrapUnits.toLocaleString()})
- Top Defect Pareto: ${sanitizedReport.defectPareto.slice(0, 5).map((d) => `${d.defectLabel} (${d.defectQuantity} units, ${d.cumulativePct}%)`).join("; ") || "None"}
- Root-Cause Correlations: ${sanitizedReport.rootCauseCorrelations.slice(0, 5).map((r) => `${r.dimensionType} '${r.dimensionLabel}' (${r.defectiveQty} defective units)`).join("; ") || "None"}
`.trim();

        if (!apiKey) {
            // Safe deterministic response if API key is not configured
            return NextResponse.json({
                reply: `Based on the evaluated period (${sanitizedReport.meta.dateLabel}): Defect Rate is ${
                    kpis.defectRatePct !== null ? `${kpis.defectRatePct}%` : "undetermined"
                }, First Pass Yield is ${
                    kpis.fpyPct !== null ? `${kpis.fpyPct}%` : "undetermined"
                }, and ${kpis.repeatDefectCount} repeat defect types were identified. The leading defect parameter is '${
                    sanitizedReport.defectPareto[0]?.defectLabel || "None"
                }'.`,
                modelUsed: "Rule-Based Engine (API Key Unset)"
            });
        }

        const ai = new GoogleGenAI({ apiKey });

        const historyContents = messages.slice(0, -1).map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: redactPiiFromString(m.content) }]
        }));

        const chat = ai.chats.create({
            model: configuredModel,
            config: {
                systemInstruction: domainSystemInstruction,
                temperature: 0.2
            },
            history: historyContents
        });

        const result = await chat.sendMessage({
            message: sanitizedQuestion
        });

        const reply = result.text || "I was unable to synthesize a quality response.";

        return NextResponse.json({
            reply,
            modelUsed: configuredModel
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to execute Quality AI chat.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
