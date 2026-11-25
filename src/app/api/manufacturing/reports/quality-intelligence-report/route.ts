import { NextResponse } from "next/server";
import { authorizeQualityIntelligenceReport } from "./auth";
import { buildQualityIntelligenceReport } from "./_report-service";
import type { QualityFilters } from "@/modules/manufacturing-management/quality-intelligence-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeQualityIntelligenceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);

    const filters: QualityFilters = {
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
        productId: searchParams.get("productId") || "all",
        workCenterId: searchParams.get("workCenterId") || "all",
        shiftName: searchParams.get("shiftName") || "all",
        status: (searchParams.get("status") || "all") as QualityFilters["status"]
    };

    try {
        const payload = await buildQualityIntelligenceReport({
            filters,
            accessToken: access.accessToken,
            signal: request.signal
        });
        return NextResponse.json(payload);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to compute quality intelligence report.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
