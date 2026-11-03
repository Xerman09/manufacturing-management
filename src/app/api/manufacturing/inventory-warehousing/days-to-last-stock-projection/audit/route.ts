import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loadConsumption } from "../_consumption";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const params = new URL(request.url).searchParams;
        const product = Number(params.get("product_id"));
        const branch = Number(params.get("branch_id"));
        const start = params.get("assessment_start") || null;
        const end = params.get("assessment_end") || "";
        if (!product || !branch || !Number.isFinite(Date.parse(end)) || start && !Number.isFinite(Date.parse(start))) return NextResponse.json({ error: "Valid product, branch and applied assessment dates are required." }, { status: 400 });
        const store = await cookies();
        const token = ["springboot_token", "vos_access_token", "token"].map(key => store.get(key)?.value).find(Boolean);
        const base = (process.env.SPRING_API_BASE_URL || process.env.NEXT_PUBLIC_SPRING_API_URL || "").replace(/\/+$/, "");
        const rows = await loadConsumption(base, token ? { Authorization: `Bearer ${token}` } : {}, start, end);
        const data = rows.filter(row => row.product_id === product && row.branch_id === branch);
        const unit = Number(params.get("unit_id"));
        if (data.some(row => !unit || row.unit_id !== unit)) throw new Error("Verified consumption UOM cannot be reconciled.");
        return NextResponse.json({ success: true, data, total: data.reduce((sum, row) => sum + row.quantity_out, 0) });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Verified consumption unavailable." }, { status: 502 });
    }
}
