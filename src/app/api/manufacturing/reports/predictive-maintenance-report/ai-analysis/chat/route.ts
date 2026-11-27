import { NextResponse } from "next/server";
import { authorizePredictiveMaintenanceReport } from "../../auth";
import { resolveServerAiTier } from "../../_report-service";
import { runCoreAiAnalysis, parseJsonSafe } from "@/lib/ai";
import type { GlobalAiTierSlug } from "@/lib/ai";
import type { PredictiveMaintenanceReportPayload } from "@/modules/manufacturing-management/predictive-maintenance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
    message: string;
    reportPayload: PredictiveMaintenanceReportPayload;
}

interface ChatResponseOutput {
    reply: string;
}

export async function POST(request: Request) {
    const access = await authorizePredictiveMaintenanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let body: ChatRequestBody;
    try {
        body = (await request.json()) as ChatRequestBody;
    } catch {
        return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
    }

    const { message, reportPayload } = body;
    if (!message || !reportPayload) {
        return NextResponse.json({ error: "Message and reportPayload are required." }, { status: 400 });
    }

    const aiTier = await resolveServerAiTier(request.signal);
    const requestedTier: GlobalAiTierSlug =
        aiTier.tierSlug === "executive" || aiTier.tierSlug === "pro" || aiTier.tierSlug === "basic"
            ? aiTier.tierSlug
            : "basic";

    const domainSystemInstruction = `
You are a conversational Predictive Maintenance Copilot for Vertex Technologies Corporation.
You advise maintenance planners based solely on the provided report data.
Always cite specific asset names, work centers, MTBF, or historical breakdown root causes when answering.
If data is missing (e.g., condition sensors are absent), state it clearly.
Return JSON with { "reply": "your text response" }.
`.trim();

    const buildPrompt = () =>
        JSON.stringify({
            userQuestion: message,
            fleetSummary: reportPayload.kpis,
            topAssets: reportPayload.assetRiskRows.slice(0, 5)
        });

    const fallbackReply = `Based on current records, fleet risk is ${reportPayload.kpis.fleetRiskScore}%. For detailed asset inspections, refer to ${reportPayload.assetRiskRows[0]?.assetName || "the top risk asset"} in the detail grid.`;

    try {
        const coreRes = await runCoreAiAnalysis<ChatRequestBody, ChatResponseOutput>(
            {
                moduleName: "predictive-maintenance-report",
                tierSlug: requestedTier,
                payload: body,
                domainSystemInstruction,
                buildPrompt,
                fallbackEngine: () => ({ reply: fallbackReply }),
                parseResponse: (rawText) => parseJsonSafe<ChatResponseOutput>(rawText),
                sanitization: {
                    stripSensitiveKeys: true,
                    redactPii: true
                }
            },
            aiTier.tierLevel
        );

        return NextResponse.json({
            reply: coreRes.data?.reply || fallbackReply,
            aiTier
        });
    } catch {
        return NextResponse.json({
            reply: fallbackReply,
            aiTier
        });
    }
}
