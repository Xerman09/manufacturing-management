import { NextResponse } from "next/server";
import { authorizeQualityIntelligenceReport } from "../auth";
import { fetchQualityFilterCatalog } from "../_report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeQualityIntelligenceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const catalog = await fetchQualityFilterCatalog(request.signal);
        return NextResponse.json(catalog);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to load quality filter options.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
