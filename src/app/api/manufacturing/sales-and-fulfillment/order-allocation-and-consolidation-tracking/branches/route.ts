import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await fetch(
            `${DIRECTUS_URL}/items/branches?limit=-1&sort=branch_name&fields=id,branch_name,branch_code`,
            {
                headers: directusHeaders,
                cache: "no-store",
            }
        );

        if (!res.ok) {
            const errTxt = await res.text().catch(() => "");
            return NextResponse.json(
                { success: false, message: `Failed to fetch branches: HTTP ${res.status} ${errTxt}` },
                { status: res.status }
            );
        }

        const json = await res.json();
        const branches = (json.data || []).map((b: { id: number; branch_name: string; branch_code?: string }) => ({
            id: Number(b.id),
            branch_name: b.branch_name || `Branch #${b.id}`,
            branch_code: b.branch_code || "",
        }));

        return NextResponse.json({
            success: true,
            data: branches,
        });
    } catch (err) {
        console.error("[Order Tracking Branches API] Error:", err);
        return NextResponse.json(
            { success: false, message: "Internal server error while fetching branches" },
            { status: 500 }
        );
    }
}
