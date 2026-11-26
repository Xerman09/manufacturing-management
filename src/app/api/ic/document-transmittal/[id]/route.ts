import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DocumentTransmittalService } from "@/modules/integrated-communications/document-transmittal/services";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/ic/document-transmittal/[id]
 * Fetches detail for a single transmittal.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;

        if (!token) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const data = await DocumentTransmittalService.getTransmittalDetail(parseInt(id));
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error(`[API][DocumentTransmittal] GET Detail Error:`, error);
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : "Failed to fetch details" },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/ic/document-transmittal/[id]?action=acknowledge|reassign
 * Acknowledges or reassigns specific invoices within a transmittal.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const searchParams = req.nextUrl.searchParams;
        const action = searchParams.get("action");

        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;

        if (!token) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const payload = decodeJwtPayload(token);
        const userId = payload?.sub ? parseInt(payload.sub) : 0;
        const body = await req.json();

        if (action === "acknowledge") {
            const { detailIds, assignedUserId } = body;
            const result = await DocumentTransmittalService.acknowledgeTransmittal(
                parseInt(id),
                detailIds,
                assignedUserId || userId,
                userId
            );
            if (result.success) return NextResponse.json(result);
            return NextResponse.json(result, { status: 400 });
        }

        if (action === "reassign") {
            const { detailIds } = body;
            const result = await DocumentTransmittalService.reassignTransmittal(
                parseInt(id),
                detailIds,
                userId
            );
            if (result.success) return NextResponse.json(result);
            return NextResponse.json(result, { status: 400 });
        }

        return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error(`[API][DocumentTransmittal] PATCH Error:`, error);
        return NextResponse.json(
            { success: false, message: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}
