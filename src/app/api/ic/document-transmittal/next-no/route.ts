import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DocumentTransmittalRepo } from "@/modules/integrated-communications/document-transmittal/services/document-transmittal.repo";
import { getNextTransmittalNo } from "@/modules/integrated-communications/document-transmittal/services/document-transmittal.helpers";
import { COOKIE_NAME } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/ic/document-transmittal/next-no
 * Returns the next anticipated transmittal number.
 */
export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;

        if (!token) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const latestNo = await DocumentTransmittalRepo.fetchLatestTransmittalNo();
        const nextNo = getNextTransmittalNo(latestNo);

        return NextResponse.json({ success: true, data: nextNo });
    } catch (error) {
        console.error("[API][DocumentTransmittal] GET next-no Error:", error);
        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error ? error.message : "Failed to fetch next transmittal number",
            },
            { status: 500 }
        );
    }
}
