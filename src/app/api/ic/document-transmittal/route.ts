import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DocumentTransmittalService } from "@/modules/integrated-communications/document-transmittal/services";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import { TransmittalStatus } from "@/modules/integrated-communications/document-transmittal/types/document-transmittal.types";

export const dynamic = "force-dynamic";

/**
 * GET /api/ic/document-transmittal
 * Fetches the master list of document transmittals with server-side filtering.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

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

        const filters = {
            receiverId: userId,
            senderId: searchParams.get("senderId"),
            selectedReceiverId: searchParams.get("receiverId"),
            status: searchParams.getAll("status") as TransmittalStatus[],
            dateFrom: searchParams.get("dateFrom"),
            dateTo: searchParams.get("dateTo"),
        };

        const data = await DocumentTransmittalService.getTransmittalList(filters);
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("[API][DocumentTransmittal] GET Error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error instanceof Error ? error.message : "Failed to fetch transmittals",
            },
            { status: 500 }
        );
    }
}
