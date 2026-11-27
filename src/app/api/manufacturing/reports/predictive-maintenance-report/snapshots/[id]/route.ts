import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizePredictiveMaintenanceReport } from "../../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOTS_COLLECTION = "manufacturing_predictive_maintenance_reports";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const access = await authorizePredictiveMaintenanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { id } = await params;
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        return NextResponse.json({ error: "Directus API is not configured." }, { status: 503 });
    }

    try {
        const res = await fetch(`${directusBase}/items/${SNAPSHOTS_COLLECTION}/${id}`, {
            headers,
            cache: "no-store",
            signal: request.signal
        });

        if (!res.ok) {
            return NextResponse.json({ error: "Snapshot not found." }, { status: 404 });
        }

        const json = await res.json();
        return NextResponse.json({ data: json?.data });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load snapshot.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const access = await authorizePredictiveMaintenanceReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { id } = await params;
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        return NextResponse.json({ error: "Directus API is not configured." }, { status: 503 });
    }

    try {
        const body = (await request.json()) as {
            status?: "Draft" | "In Review" | "Published";
            reviewerNotes?: string | null;
        };

        const patchPayload: Record<string, unknown> = {};
        if (body.status) {
            patchPayload.status = body.status;
            if (body.status === "Published") {
                patchPayload.published_by = access.userId;
                patchPayload.published_at = new Date().toISOString();
            } else if (body.status === "Draft") {
                // If rejected, record rejected_by and rejected_at
                patchPayload.rejected_by = access.userId;
                patchPayload.rejected_at = new Date().toISOString();
            }
        }
        if (body.reviewerNotes !== undefined) {
            patchPayload.reviewer_notes = body.reviewerNotes;
        }

        const res = await fetch(`${directusBase}/items/${SNAPSHOTS_COLLECTION}/${id}`, {
            method: "PATCH",
            headers: {
                ...headers,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(patchPayload),
            signal: request.signal
        });

        if (!res.ok) {
            const errBody = await res.text();
            return NextResponse.json({ error: `Directus error: ${errBody}` }, { status: res.status });
        }

        const json = await res.json();
        return NextResponse.json({ data: json?.data });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update snapshot.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
