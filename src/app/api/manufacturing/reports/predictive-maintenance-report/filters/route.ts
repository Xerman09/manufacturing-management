import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizePredictiveMaintenanceReport } from "../auth";
import type { FilterCatalogPayload } from "@/modules/manufacturing-management/predictive-maintenance-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusRecord = Record<string, unknown>;

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
        const [assetsRes, wcRes, branchesRes] = await Promise.all([
            fetch(`${directusBase}/items/assets_and_equipment?fields=id,item_id.item_name,serial,barcode,condition&limit=-1`, {
                headers,
                cache: "no-store",
                signal: request.signal
            }).then((r) => (r.ok ? r.json() : { data: [] })),
            fetch(`${directusBase}/items/manufacturing_work_centers?fields=work_center_id,work_center_name&limit=-1`, {
                headers,
                cache: "no-store",
                signal: request.signal
            }).then((r) => (r.ok ? r.json() : { data: [] })),
            fetch(`${directusBase}/items/branches?fields=id,branch_name&limit=-1`, {
                headers,
                cache: "no-store",
                signal: request.signal
            }).then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
        ]);

        const assetsList: DirectusRecord[] = Array.isArray(assetsRes?.data) ? assetsRes.data : [];
        const wcList: DirectusRecord[] = Array.isArray(wcRes?.data) ? wcRes.data : [];
        const branchList: DirectusRecord[] = Array.isArray(branchesRes?.data) ? branchesRes.data : [];

        const payload: FilterCatalogPayload = {
            assets: assetsList.map((a) => {
                const item = typeof a.item_id === "object" && a.item_id !== null ? (a.item_id as Record<string, unknown>) : null;
                const name = String(item?.item_name || a.serial || a.barcode || `Asset #${a.id}`);
                return {
                    id: String(a.id),
                    label: name,
                    subLabel: a.serial ? `SN: ${String(a.serial)}` : undefined
                };
            }),
            workCenters: wcList.map((w) => ({
                id: String(w.work_center_id),
                label: String(w.work_center_name || `Work Center #${w.work_center_id}`)
            })),
            branches: branchList.map((b) => ({
                id: String(b.id),
                label: String(b.branch_name || `Branch #${b.id}`)
            })),
            horizons: [
                { id: "7d", label: "7 Days (Immediate)", days: 7 },
                { id: "14d", label: "14 Days (Bi-weekly)", days: 14 },
                { id: "30d", label: "30 Days (Monthly)", days: 30 },
                { id: "60d", label: "60 Days (Bi-monthly)", days: 60 },
                { id: "90d", label: "90 Days (Quarterly)", days: 90 }
            ]
        };

        return NextResponse.json(payload);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load filter catalogs";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
