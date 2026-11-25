import { NextResponse } from "next/server";
import { authorizeQualityIntelligenceReport } from "../auth";
import { fetchQualityJobOrderDetail } from "../_report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeQualityIntelligenceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("jobOrderId"));
    if (!Number.isSafeInteger(id) || id <= 0) {
        return NextResponse.json({ error: "Invalid Job Order ID." }, { status: 400 });
    }

    try {
        const detail = await fetchQualityJobOrderDetail(id, request.signal);
        return NextResponse.json(detail);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to load Job Order quality details.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
