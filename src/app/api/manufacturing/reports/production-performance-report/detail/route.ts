import { NextResponse } from "next/server";
import { authorizeProductionPerformanceReport } from "../auth";
import { fetchJobOrderDetail } from "../_report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeProductionPerformanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const jobOrderId = Number(searchParams.get("jobOrderId"));

    if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0) {
        return NextResponse.json(
            { error: "A valid jobOrderId is required." },
            { status: 400 }
        );
    }

    try {
        const detail = await fetchJobOrderDetail(jobOrderId, request.signal);
        return NextResponse.json(detail);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to load Job Order details.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
