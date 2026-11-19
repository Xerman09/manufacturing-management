import { NextRequest, NextResponse } from "next/server";
import { MmInventoryMovementError } from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import { OffsetPairingError } from "@/modules/manufacturing-management/physical-inventory-offsetting/utils/offset-pairings";
import type { PhysicalInventoryCountSheetData } from "@/modules/manufacturing-management/physical-inventory-manufacturing/types";
import { parseBooleanFlag } from "../../helper";
import { readPhysicalInventorySheet } from "../_read";
import { CountSheetStockError, loadCountSheetStock } from "./_stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const sheetId = Number((await context.params).id);
        if (!Number.isSafeInteger(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID." }, { status: 400 });
        }

        const sheet = await readPhysicalInventorySheet(sheetId);
        if (!sheet) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found." }, { status: 404 });
        }

        const useCutoffStock = sheet.stock_type === "REGULAR" && sheet.status === "DRAFT"
            && !parseBooleanFlag(sheet.isCommitted) && !parseBooleanFlag(sheet.isCancelled);
        const stock = useCutoffStock
            ? await loadCountSheetStock(sheet)
            : { additionalRows: [], stockCutoff: null, excludedOtherBranchBalanceCount: 0 };
        const data: PhysicalInventoryCountSheetData = { sheet, ...stock };

        return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error: unknown) {
        if (error instanceof CountSheetStockError || error instanceof OffsetPairingError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status });
        }
        if (error instanceof MmInventoryMovementError) {
            const message = error.status === 401
                ? "Sign in again to load stock for this count sheet."
                : error.status === 403
                    ? "You do not have permission to load inventory movements for this count sheet."
                    : "Inventory movements could not be loaded for this count sheet. Try again.";
            return NextResponse.json({ success: false, error: message }, { status: error.status });
        }
        console.error("Failed to prepare the Physical Inventory count sheet:", error);
        return NextResponse.json({ success: false, error: "The physical inventory count sheet could not be loaded. Try again." }, { status: 500 });
    }
}
