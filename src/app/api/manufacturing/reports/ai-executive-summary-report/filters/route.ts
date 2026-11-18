import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizeAIExecutiveSummaryReport } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const access = await authorizeAIExecutiveSummaryReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const branchRes = await fetch(`${DIRECTUS_URL}/items/branches?fields=id,branch_code,branch_name&limit=-1&sort=branch_name`, {
            headers,
            cache: "no-store",
            signal: request.signal
        });
        const branchData = await branchRes.json();
        const branches = Array.isArray(branchData?.data) ? branchData.data : [];

        return NextResponse.json({
            branches: branches.map((b: { id: number; branch_code?: string; branch_name?: string }) => ({
                id: b.id,
                code: b.branch_code || `B-${b.id}`,
                name: b.branch_name || `Plant ${b.id}`
            }))
        });
    } catch {
        return NextResponse.json({ error: "Failed to load report filter options." }, { status: 500 });
    }
}
