import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizePredictiveMaintenanceReport } from "../auth";
import type { PredictiveMaintenanceReportPayload } from "@/modules/manufacturing-management/predictive-maintenance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOTS_COLLECTION = "manufacturing_predictive_maintenance_reports";

export async function GET(request: Request) {
    const access = await authorizePredictiveMaintenanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        return NextResponse.json({ error: "Directus API is not configured." }, { status: 503 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";
        const status = searchParams.get("status");

        const params = new URLSearchParams({
            sort: "-created_at,-id",
            fields: "id,report_code,version,status,cutoff_date_from,cutoff_date_to,prediction_horizon,filter_asset_id,filter_work_center_id,reviewer_notes,created_by.user_fname,created_by.user_lname,created_at,published_by.user_fname,published_by.user_lname,published_at,rejected_by.user_fname,rejected_by.user_lname,rejected_at",
            limit: "100"
        });

        if (status && status !== "all") {
            params.set("filter[status][_eq]", status);
        }
        if (search) {
            params.set("filter[report_code][_contains]", search);
        }

        const res = await fetch(`${directusBase}/items/${SNAPSHOTS_COLLECTION}?${params.toString()}`, {
            headers,
            cache: "no-store",
            signal: request.signal
        });

        if (!res.ok) {
            return NextResponse.json({ data: [] });
        }

        const json = await res.json();
        return NextResponse.json({ data: Array.isArray(json?.data) ? json.data : [] });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to fetch snapshots";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const access = await authorizePredictiveMaintenanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        return NextResponse.json({ error: "Directus API is not configured." }, { status: 503 });
    }

    try {
        const body = (await request.json()) as {
            reportCode?: string;
            version?: number;
            status?: "Draft" | "In Review" | "Published";
            cutoffDateFrom: string;
            cutoffDateTo: string;
            predictionHorizon: string;
            filterAssetId?: number | null;
            filterWorkCenterId?: number | null;
            reportPayload: PredictiveMaintenanceReportPayload;
            reviewerNotes?: string | null;
        };

        if (!body.reportPayload || !body.cutoffDateFrom || !body.cutoffDateTo) {
            return NextResponse.json({ error: "Missing required snapshot payload data." }, { status: 400 });
        }

        let reportCode = body.reportCode || body.reportPayload.meta.reportId;
        if (!reportCode || reportCode === "PMR") {
            reportCode = `PMR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`;
        }

        let version = body.version || body.reportPayload.meta.version || 1;
        const status = body.status || "Draft";

        // Check if a record with the same report_code already exists to prevent UNIQUE KEY collision (uq_pmr_code_version)
        const checkParams = new URLSearchParams({
            "filter[report_code][_eq]": reportCode,
            sort: "-version",
            fields: "id,version",
            limit: "1"
        });
        const checkRes = await fetch(`${directusBase}/items/${SNAPSHOTS_COLLECTION}?${checkParams.toString()}`, {
            headers,
            cache: "no-store",
            signal: request.signal
        });

        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            const existing = Array.isArray(checkJson?.data) && checkJson.data.length > 0 ? checkJson.data[0] : null;
            if (existing) {
                // If the exact same code already exists, auto-increment the version
                version = (Number(existing.version) || 1) + 1;
            }
        }

        const postBody = {
            report_code: reportCode,
            version,
            status,
            cutoff_date_from: body.cutoffDateFrom,
            cutoff_date_to: body.cutoffDateTo,
            prediction_horizon: body.predictionHorizon || "30d",
            filter_asset_id: body.filterAssetId || null,
            filter_work_center_id: body.filterWorkCenterId || null,
            report_payload: {
                ...body.reportPayload,
                meta: {
                    ...body.reportPayload.meta,
                    reportId: reportCode,
                    version,
                    status
                }
            },
            reviewer_notes: body.reviewerNotes || null,
            created_by: access.userId,
            created_at: new Date().toISOString(),
            published_by: status === "Published" ? access.userId : null,
            published_at: status === "Published" ? new Date().toISOString() : null
        };

        const res = await fetch(`${directusBase}/items/${SNAPSHOTS_COLLECTION}`, {
            method: "POST",
            headers: {
                ...headers,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(postBody),
            signal: request.signal
        });

        if (!res.ok) {
            const errBody = await res.text();
            return NextResponse.json({ error: `Directus error: ${errBody}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json({ data: json?.data || postBody });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to save snapshot";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
