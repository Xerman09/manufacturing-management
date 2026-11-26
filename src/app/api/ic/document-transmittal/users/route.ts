import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DocumentTransmittalRepo } from "@/modules/integrated-communications/document-transmittal/services/document-transmittal.repo";
import { COOKIE_NAME } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/ic/document-transmittal/users
 * Fetches all users for the acknowledgment dropdown.
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

        const response = await DocumentTransmittalRepo.fetchAllUsers();

        return NextResponse.json({
            success: true,
            data: response.data || [],
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to fetch users";
        console.error("[API] Error fetching users:", error);
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
