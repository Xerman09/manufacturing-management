import { NextResponse } from "next/server";
import { authorizeProductionPerformanceReport } from "./auth";
import { buildProductionPerformanceReport } from "./_report-service";
import type {
    PPRStatusFilter,
    ProductionPerformanceFilters
} from "@/modules/manufacturing-management/production-performance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeProductionPerformanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    if (dateFrom && dateTo && dateFrom > dateTo) {
        return NextResponse.json(
            { error: "Start date must be on or before end date." },
            { status: 400 }
        );
    }

    const filters: ProductionPerformanceFilters = {
        dateFrom,
        dateTo,
        productId: searchParams.get("productId") || "all",
        workCenterId: searchParams.get("workCenterId") || "all",
        routeId: searchParams.get("routeId") || "all",
        status: (searchParams.get("status") || "all") as PPRStatusFilter
    };

    try {
        const payload = await buildProductionPerformanceReport({
            filters,
            accessToken: access.accessToken,
            signal: request.signal
        });
        return NextResponse.json(payload);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to load production performance report.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
