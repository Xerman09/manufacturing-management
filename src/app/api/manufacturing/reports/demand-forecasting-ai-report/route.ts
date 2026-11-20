import { NextResponse } from "next/server";
import { authorizeDemandForecastingReport } from "./auth";
import { buildDemandForecastReport } from "./_report-service";
import type {
    DemandForecastFilters,
    ForecastCadence,
    ForecastHorizonOption,
    HistoricalPeriodPreset
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeDemandForecastingReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const cadence: ForecastCadence =
        searchParams.get("cadence") === "weekly" ? "weekly" : "monthly";
    const period = (searchParams.get("period") ||
        (cadence === "weekly" ? "last12Weeks" : "last6Months")) as HistoricalPeriodPreset;
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    if (period === "custom" && dateFrom && dateTo && dateFrom > dateTo) {
        return NextResponse.json(
            { error: "Start date must be on or before end date." },
            { status: 400 }
        );
    }

    const filters: DemandForecastFilters = {
        cadence,
        period,
        dateFrom,
        dateTo,
        branchId: searchParams.get("branchId") || "all",
        productId: searchParams.get("productId") || "all",
        regionKey: searchParams.get("regionKey") || "all",
        forecastHorizon: (searchParams.get("forecastHorizon") ||
            (cadence === "weekly" ? "8w" : "6m")) as ForecastHorizonOption,
        includeUnmappedRegions: searchParams.get("includeUnmappedRegions") !== "false"
    };

    try {
        const payload = await buildDemandForecastReport({
            filters,
            accessToken: access.accessToken,
            signal: request.signal
        });
        return NextResponse.json(payload);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to compute demand forecasting report.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
