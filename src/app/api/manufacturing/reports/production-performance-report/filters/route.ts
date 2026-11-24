import { NextResponse } from "next/server";
import { authorizeProductionPerformanceReport } from "../auth";
import { fetchProductionFilterCatalog } from "../_report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeProductionPerformanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const catalog = await fetchProductionFilterCatalog(request.signal);
        return NextResponse.json(catalog);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to load filter options.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
