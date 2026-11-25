// src/app/api/manufacturing/sales-and-fulfillment/fulfilment-and-deliveries/branches/route.ts

import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../../directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&sort=branch_name&fields=id,branch_name,branch_code`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!res.ok) {
            return NextResponse.json(
                { message: `Directus error (HTTP ${res.status})` },
                { status: res.status }
            );
        }
        const json = await res.json();
        const branches = (json.data || []).map((b: { id: number | string; branch_name: string; branch_code: string }) => ({
            id: Number(b.id),
            branch_name: b.branch_name,
            branch_code: b.branch_code,
        }));
        return NextResponse.json(branches);
    } catch (error) {
        console.error("[fulfilment-and-deliveries branches GET] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to load branches." },
            { status: 500 }
        );
    }
}
