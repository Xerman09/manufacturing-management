import { NextResponse } from "next/server";
import { authorizePredictiveMaintenanceReport } from "./auth";
import { buildPredictiveMaintenanceReport } from "./_report-service";
import type { PredictiveMaintenanceFilters, PredictionHorizonOption } from "@/modules/manufacturing-management/predictive-maintenance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizePredictiveMaintenanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);

    const filters: PredictiveMaintenanceFilters = {
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
        horizon: (searchParams.get("horizon") || "30d") as PredictionHorizonOption,
        assetId: searchParams.get("assetId") || "all",
        workCenterId: searchParams.get("workCenterId") || "all",
        branchId: searchParams.get("branchId") || "all",
        status: searchParams.get("status") || "all"
    };

    try {
        const payload = await buildPredictiveMaintenanceReport({
            filters,
            accessToken: access.accessToken,
            signal: request.signal
        });
        return NextResponse.json(payload);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to compute predictive maintenance report.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
