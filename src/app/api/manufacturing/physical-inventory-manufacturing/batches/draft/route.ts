import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { extractId, parseBooleanFlag, roundMoney } from "../../helper";
import { getJwtSubFromReq } from "@/lib/directus";
import {
    matchesProductTypeScope,
    normalizeProductTypeId,
    normalizeProductTypeName,
} from "@/modules/manufacturing-management/physical-inventory-manufacturing/utils/product-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/batches/draft
 * Create a draft batch record held in mm_physical_inventory_draft_batches or mm_inventory_lots (status=INACTIVE)
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            physical_inventory_id,
            lot_id,
            branch_id,
            product_id,
            batch_no,
            manufacturing_date,
            expiry_date,
            expiration_date,
            unit_cost,
        } = body;

        const lotId = extractId(lot_id);
        const branchId = extractId(branch_id);
        const productId = extractId(product_id);
        const sheetId = physical_inventory_id ? extractId(physical_inventory_id) : null;
        const batchNoClean = typeof batch_no === "string" ? batch_no.trim() : "";

        if (!sheetId || !lotId || !branchId || !productId || !batchNoClean) {
            return NextResponse.json(
                { success: false, error: "physical_inventory_id, lot_id, branch_id, product_id, and batch_no are required." },
                { status: 400 }
            );
        }

        const mfgDateVal = manufacturing_date || null;
        const expDateVal = expiry_date || expiration_date || null;
        const isValidDate = (value: unknown) => {
            if (!value) return true;
            const dateText = String(value);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;
            const parsedDate = new Date(`${dateText}T00:00:00.000Z`);
            return Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === dateText;
        };
        if (!isValidDate(mfgDateVal) || !isValidDate(expDateVal)) {
            return NextResponse.json({ success: false, error: "Manufacturing and expiration dates must be valid calendar dates." }, { status: 400 });
        }

        const sheetRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}?fields=physical_inventory_id,pi_no,status,isCommitted,isCancelled,branch_id,product_type_id`, { headers, cache: "no-store" });
        if (!sheetRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found." }, { status: 404 });
        }
        const sheet = (await sheetRes.json()).data;
        if (String(sheet.status || "").toUpperCase() !== "DRAFT" || parseBooleanFlag(sheet.isCommitted) || parseBooleanFlag(sheet.isCancelled)) {
            return NextResponse.json({ success: false, error: "New batches can only be added to a draft Physical Inventory sheet." }, { status: 409 });
        }
        const sheetBranchId = extractId(sheet.branch_id, "branch_id");
        if (sheetBranchId !== branchId) {
            return NextResponse.json({ success: false, error: "Batch branch must match the Physical Inventory sheet branch." }, { status: 400 });
        }

        const [lotRes, productRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/mm_lots/${lotId}?fields=lot_id,branch_id,unit_id`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=product_id,product_name,product_type,unit_of_measurement.*,product_shelf_life,cost_per_unit`, { headers, cache: "no-store" }),
        ]);
        if (!lotRes.ok) {
            return NextResponse.json({ success: false, error: "Selected storage lot does not exist." }, { status: 404 });
        }
        if (!productRes.ok) {
            return NextResponse.json({ success: false, error: "Selected product does not exist in the product catalog." }, { status: 404 });
        }

        const lot = (await lotRes.json()).data;
        const product = (await productRes.json()).data;
        if (extractId(lot.branch_id, "branch_id") !== branchId) {
            return NextResponse.json({ success: false, error: "Selected storage lot does not belong to the batch branch." }, { status: 400 });
        }

        const lotUnitId = extractId(lot.unit_id, "unit_id");
        const productUnitId = extractId(product.unit_of_measurement, "unit_id");
        if (!lotUnitId || !productUnitId || lotUnitId !== productUnitId) {
            return NextResponse.json({ success: false, error: "The selected product uses a different UOM from this lot." }, { status: 400 });
        }

        const sheetProductTypeId = normalizeProductTypeId(sheet.product_type_id);
        const sheetProductTypeName = normalizeProductTypeName(sheet.product_type_id);
        const hasProductTypeScope = sheetProductTypeId > 0 || Boolean(sheetProductTypeName);
        if (hasProductTypeScope && !matchesProductTypeScope(sheet.product_type_id, product.product_type)) {
            return NextResponse.json({ success: false, error: "Selected product is outside this Physical Inventory sheet's product scope." }, { status: 400 });
        }

        const shelfLife = Number(product.product_shelf_life || 0);
        if (shelfLife > 0 && !expDateVal) {
            return NextResponse.json({ success: false, error: "Expiration date is required for this product." }, { status: 400 });
        }
        if (mfgDateVal && expDateVal && new Date(mfgDateVal) > new Date(expDateVal)) {
            return NextResponse.json({ success: false, error: "Manufacturing date cannot be after expiration date." }, { status: 400 });
        }

        const duplicateUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?filter[batch_no][_eq]=${encodeURIComponent(batchNoClean)}&limit=1&fields=inventory_lot_id`;
        const duplicateRes = await fetch(duplicateUrl, { headers, cache: "no-store" });
        if (!duplicateRes.ok) {
            return NextResponse.json({ success: false, error: "Unable to verify batch number availability. Please retry." }, { status: 502 });
        }
        const duplicateRows = (await duplicateRes.json()).data || [];
        if (duplicateRows.length > 0) {
            return NextResponse.json({ success: false, error: `Batch number '${batchNoClean}' already exists.` }, { status: 409 });
        }

        const duplicateDraftUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_draft_batches?filter[batch_no][_eq]=${encodeURIComponent(batchNoClean)}&filter[status][_eq]=DRAFT&limit=1`;
        const duplicateDraftRes = await fetch(duplicateDraftUrl, { headers, cache: "no-store" });
        if (duplicateDraftRes.ok && ((await duplicateDraftRes.json()).data || []).length > 0) {
            return NextResponse.json({ success: false, error: `Batch number '${batchNoClean}' already exists in a physical inventory draft.` }, { status: 409 });
        }

        const authUserId = getJwtSubFromReq(request);
        const costVal = roundMoney(unit_cost !== undefined ? unit_cost : product.cost_per_unit);

        // First attempt: Create in mm_physical_inventory_draft_batches
        const draftPayload = {
            physical_inventory_id: sheetId,
            lot_id: lotId,
            branch_id: branchId,
            product_id: productId,
            batch_no: batchNoClean,
            manufacturing_date: mfgDateVal,
            expiry_date: expDateVal,
            expiration_date: expDateVal,
            unit_cost: costVal,
            qa_status: "GOOD",
            status: "DRAFT",
            created_by: authUserId || null,
        };

        const draftUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_draft_batches`;
        const draftRes = await fetch(draftUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(draftPayload),
        });

        if (draftRes.ok) {
            const createdDraft = (await draftRes.json()).data;
            const draftId = extractId(createdDraft.draft_batch_id || createdDraft.id);
            return NextResponse.json(
                {
                    success: true,
                    data: {
                        ...createdDraft,
                        draft_batch_id: draftId,
                        batch_kind: "DRAFT",
                        is_draft: true,
                    },
                },
                { status: 201 }
            );
        }

        // Fallback: If table mm_physical_inventory_draft_batches is not created in Directus yet,
        // create in mm_inventory_lots with status='INACTIVE' and source_type='PHYSICAL_INVENTORY_DRAFT'
        const fallbackPayload = {
            lot_id: lotId,
            branch_id: branchId,
            product_id: productId,
            batch_no: batchNoClean,
            manufacturing_date: mfgDateVal,
            expiry_date: expDateVal,
            unit_cost: costVal,
            qa_status: "GOOD",
            status: "INACTIVE", // Held in uncommitted status until sheet commit
            source_type: "PHYSICAL_INVENTORY_DRAFT",
            source_reference: `PI-#${sheetId}`,
            created_by: authUserId || null,
        };

        const fallbackUrl = `${DIRECTUS_URL}/items/mm_inventory_lots`;
        const fallbackRes = await fetch(fallbackUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(fallbackPayload),
        });

        if (!fallbackRes.ok) {
            const errText = await fallbackRes.text();
            throw new Error(`Directus failed to create draft batch: ${errText}`);
        }

        const createdFallback = (await fallbackRes.json()).data;
        const bId = extractId(createdFallback.inventory_lot_id || createdFallback.id);
        return NextResponse.json(
            {
                success: true,
                data: {
                    ...createdFallback,
                    inventory_lot_id: bId,
                    id: bId,
                    batch_kind: "MASTER",
                    is_draft: false,
                },
            },
            { status: 201 }
        );
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
