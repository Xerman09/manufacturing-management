import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DocumentTransmittalService } from "@/modules/integrated-communications/document-transmittal/services/document-transmittal.service";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/ic/document-transmittal/pending
 * Fetches all pending transmittal details assigned to the logged-in user.
 */
export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;

        if (!token) {
            return NextResponse.json(
                { success: false, message: "Authentication required" },
                { status: 401 }
            );
        }

        const payload = decodeJwtPayload(token);
        const userId = payload?.sub ? parseInt(payload.sub) : undefined;

        if (!userId) {
            return NextResponse.json(
                { success: false, message: "Invalid user token" },
                { status: 401 }
            );
        }

        const response = await DocumentTransmittalService.getPendingInvoices(userId);

        return NextResponse.json({
            success: true,
            data: response || [],
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to fetch pending transmittals";
        console.error("[API] Error fetching pending transmittals:", error);
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
