import { NextResponse } from "next/server";
import { authorizeAIExecutiveSummaryReport } from "../../auth";
import { generateExecutiveReportPdf } from "@/modules/manufacturing-management/ai-executive-summary-report/utils/exportPdf";
import type { AIExecutiveReportPayload, AIInsightsPayload } from "@/modules/manufacturing-management/ai-executive-summary-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportPdfRequestBody {
    reportPayload?: AIExecutiveReportPayload;
    insights?: AIInsightsPayload | null;
    // Support legacy flat payload as well
    meta?: AIExecutiveReportPayload["meta"];
    kpiCards?: AIExecutiveReportPayload["kpiCards"];
    detailedRows?: AIExecutiveReportPayload["detailedRows"];
}

export async function POST(request: Request) {
    const access = await authorizeAIExecutiveSummaryReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const body = (await request.json()) as ExportPdfRequestBody;
        const payload: AIExecutiveReportPayload = body.reportPayload || (body as AIExecutiveReportPayload);
        const insights: AIInsightsPayload | null | undefined = body.insights;

        if (!payload || !payload.meta || !payload.kpiCards) {
            return NextResponse.json({ error: "Invalid report payload." }, { status: 400 });
        }

        const pdfBuffer = generateExecutiveReportPdf(payload, insights);
        const fileName = `AI-Executive-Summary-${payload.meta.plantName.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.pdf`;

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${fileName}"`
            }
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to generate PDF";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
