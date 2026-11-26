import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

function parseBufferOrBool(val: unknown): boolean {
    if (val === true || val === 1 || val === "1") return true;
    if (val === false || val === 0 || val === "0" || val === null || val === undefined) return false;
    if (typeof val === "object" && val !== null) {
        const obj = val as Record<string, unknown>;
        if (Array.isArray(obj.data) && obj.data.length > 0) {
            return Number(obj.data[0]) === 1;
        }
        if (typeof obj.data === "number") {
            return obj.data === 1;
        }
    }
    return false;
}

/**
 * POST /api/manufacturing/physical-inventory/[id]/cancel
 * Cancels a draft count sheet (sets isCancelled = 1).
 */
export async function POST(_request: Request, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);

        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid count sheet ID" }, { status: 400 });
        }

        // Fetch count sheet header
        const sheetRes = await fetch(`${DIRECTUS_URL}/items/physical_inventory/${sheetId}`, {
            headers,
            cache: "no-store",
        });

        if (!sheetRes.ok) {
            return NextResponse.json({ success: false, error: "Physical count sheet not found" }, { status: 404 });
        }

        const sheet = (await sheetRes.json()).data;
        if (!sheet) {
            return NextResponse.json({ success: false, error: "Physical count sheet not found" }, { status: 404 });
        }

        const isCommitted = parseBufferOrBool(sheet.isComitted) || parseBufferOrBool(sheet.is_committed);
        const isCancelled = parseBufferOrBool(sheet.isCancelled) || parseBufferOrBool(sheet.is_cancelled);

        if (isCommitted) {
            return NextResponse.json(
                { success: false, error: "Cannot cancel a committed physical count sheet" },
                { status: 400 }
            );
        }

        if (isCancelled) {
            return NextResponse.json(
                { success: false, error: "Physical count sheet is already cancelled" },
                { status: 400 }
            );
        }

        // Update sheet cancellation status matching exact Directus field names
        const patchRes = await fetch(`${DIRECTUS_URL}/items/physical_inventory/${sheetId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                isCancelled: 1,
                is_cancelled: 1,
                cancelled_at: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Manila" }).replace(" ", "T"),
            }),
        });

        if (!patchRes.ok) {
            const errText = await patchRes.text();
            throw new Error(`Directus failed to cancel physical count sheet: ${patchRes.status} - ${errText}`);
        }

        const updatedSheet = (await patchRes.json()).data;

        return NextResponse.json({
            success: true,
            message: "Physical count sheet cancelled successfully",
            data: updatedSheet,
        });
    } catch (e) {
        console.error("[Physical Inventory CANCEL] Error:", e);
        return NextResponse.json(
            { success: false, error: (e as Error).message || "Failed to cancel physical count sheet" },
            { status: 500 }
        );
    }
}
