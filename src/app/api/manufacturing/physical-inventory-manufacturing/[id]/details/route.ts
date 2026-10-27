import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { extractId, roundQty, recalculateHeaderTotals, parseBooleanFlag, resolveProductPrice } from "../../helper";
import { getSingleItemSystemOnhand } from "../../movements-helper";
import { getJwtSubFromReq } from "@/lib/directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/[id]/details
 * Add a detail row to a draft physical inventory sheet.
 */
export async function POST(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        // 1. Fetch PI Header
        const headerRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}?fields=*,price_type_id.*,product_type_id.*`, { headers, cache: "no-store" });
        if (!headerRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }
        const sheet = (await headerRes.json()).data;
        const statusUpper = String(sheet.status || "").toUpperCase();
        const isCommitted = parseBooleanFlag(sheet.isCommitted);
        const isCancelled = parseBooleanFlag(sheet.isCancelled);

        if (statusUpper !== "DRAFT" || isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: `Details can only be added to DRAFT sheets. Current status: ${sheet.status}` }, { status: 400 });
        }

        const piBranchId = extractId(sheet.branch_id);

        const body = await request.json();
        const {
            inventory_lot_id,
            lot_id,
            product_id,
            physical_count,
            inventory_condition,
            remarks,
        } = body;

        const inventoryLotId = extractId(inventory_lot_id);
        const draftBatchId = extractId(body.draft_batch_id);
        const lotId = extractId(lot_id);
        const productId = extractId(product_id);

        if ((inventoryLotId > 0) === (draftBatchId > 0) || inventoryLotId < 0 || draftBatchId < 0 || !lotId || !productId) {
            return NextResponse.json({ success: false, error: "Batch, Lot, and Product are required." }, { status: 400 });
        }

        const physCountNum = physical_count !== undefined && physical_count !== null && physical_count !== ""
            ? roundQty(physical_count)
            : 0;
        if (physCountNum < 0) {
            return NextResponse.json({ success: false, error: "Physical count cannot be negative." }, { status: 400 });
        }

        const conditionStr = (inventory_condition || "GOOD").trim().toUpperCase();

        const isDraftLot = lotId < 0;
        let finalLotId = lotId;
        let finalInventoryLotId = inventoryLotId;

        // 2a. Resolve Draft Lot if lotId < 0
        if (isDraftLot) {
            const lotNameClean = (body.lot_name || `Storage Lot #${Math.abs(lotId)}`).trim();
            const findLotUrl = `${DIRECTUS_URL}/items/mm_lots?filter[branch_id][_eq]=${piBranchId}&filter[lot_name][_eq]=${encodeURIComponent(lotNameClean)}&limit=1`;
            const findLotRes = await fetch(findLotUrl, { headers, cache: "no-store" });
            if (findLotRes.ok) {
                const findLotJson = await findLotRes.json();
                if (findLotJson.data && findLotJson.data.length > 0) {
                    finalLotId = extractId(findLotJson.data[0].lot_id || findLotJson.data[0].id);
                }
            }
            if (finalLotId < 0) {
                // Formally create Lot master record
                const authUserId = getJwtSubFromReq(request);
                const createLotRes = await fetch(`${DIRECTUS_URL}/items/mm_lots`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        lot_name: lotNameClean,
                        branch_id: piBranchId,
                        unit_id: body.unit_id || 1,
                        max_batch_capacity: Number(body.max_batch_capacity || 100),
                        description: "Storage lot created during physical count draft",
                        created_by: authUserId || null,
                        isActive: 1,
                    }),
                });
                if (!createLotRes.ok) {
                    const errTxt = await createLotRes.text();
                    return NextResponse.json({ success: false, error: `Failed to create storage lot: ${errTxt}` }, { status: 500 });
                }
                const newLot = (await createLotRes.json()).data;
                finalLotId = extractId(newLot.lot_id || newLot.id);
            }
        }

        // 2b. Resolve the selected draft or master batch from its own collection.
        let batch: Record<string, unknown> | null = null;
        let draftBatch: Record<string, unknown> | null = null;
        if (draftBatchId > 0) {
            const draftRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_draft_batches/${draftBatchId}?fields=*,lot_id.*,product_id.*,product_id.unit_of_measurement.*`, { headers, cache: "no-store" });
            if (!draftRes.ok) {
                return NextResponse.json({ success: false, error: "Selected draft batch was not found. Refresh the batch list and try again." }, { status: 404 });
            }
            draftBatch = (await draftRes.json()).data;
            if (String(draftBatch?.status || "DRAFT").toUpperCase() !== "DRAFT") {
                return NextResponse.json({ success: false, error: "Selected draft batch has already been converted. Refresh the batch list and select its inventory batch." }, { status: 409 });
            }
            const draftSheetId = extractId(draftBatch?.physical_inventory_id, "physical_inventory_id");
            if (draftSheetId > 0 && draftSheetId !== sheetId) {
                return NextResponse.json({ success: false, error: "Selected draft batch belongs to a different Physical Inventory sheet." }, { status: 409 });
            }
            batch = draftBatch;
        } else {
            const masterRes = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots/${inventoryLotId}?fields=*,lot_id.*,product_id.*,product_id.unit_of_measurement.*`, { headers, cache: "no-store" });
            if (!masterRes.ok) {
                return NextResponse.json({ success: false, error: "Selected inventory batch was not found. Refresh the batch list and try again." }, { status: 404 });
            }
            batch = (await masterRes.json()).data;
        }

        if (!batch) {
            return NextResponse.json({ success: false, error: "Selected batch does not exist." }, { status: 404 });
        }

        const batchLotId = extractId(batch.lot_id, "lot_id");
        const batchBranchId = extractId(batch.branch_id, "branch_id");
        const batchProductId = extractId(batch.product_id, "product_id");

        if (batchLotId !== finalLotId) {
            return NextResponse.json({ success: false, error: "Batch does not belong to the selected lot." }, { status: 400 });
        }
        if (batchProductId !== productId) {
            return NextResponse.json({ success: false, error: "Batch does not belong to the selected product." }, { status: 400 });
        }
        if (batchBranchId !== piBranchId) {
            return NextResponse.json({ success: false, error: "Batch branch does not match the Physical Inventory branch." }, { status: 400 });
        }

        // 3. Load & Validate Lot from mm_lots
        const lotRes = await fetch(`${DIRECTUS_URL}/items/mm_lots/${finalLotId}`, { headers, cache: "no-store" });
        if (!lotRes.ok) {
            return NextResponse.json({ success: false, error: "Selected lot does not exist." }, { status: 404 });
        }
        const lot = (await lotRes.json()).data;
        const lotBranchId = extractId(lot.branch_id);
        const lotUnitId = extractId(lot.unit_id);

        if (lotBranchId !== piBranchId) {
            return NextResponse.json({ success: false, error: "Lot does not belong to the Physical Inventory branch." }, { status: 400 });
        }

        // 4. Load & Validate Product from products
        const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=*,unit_of_measurement.*`, { headers, cache: "no-store" });
        if (!prodRes.ok) {
            return NextResponse.json({ success: false, error: "Selected product does not exist." }, { status: 404 });
        }
        const product = (await prodRes.json()).data;
        const prodUnitId = extractId(product.unit_of_measurement, "unit_id");

        if (prodUnitId !== lotUnitId) {
            return NextResponse.json({ success: false, error: "The selected product uses a different UOM from this lot." }, { status: 400 });
        }

        // 5. Expiration & Manufacturing Date Rules
        const shelfLife = Number(product.product_shelf_life || 0);
        const expDate = batch.expiry_date ? String(batch.expiry_date) : batch.expiration_date ? String(batch.expiration_date) : null;
        const mfgDate = batch.manufacturing_date ? String(batch.manufacturing_date) : null;

        if (shelfLife > 0 && !expDate) {
            return NextResponse.json({ success: false, error: "Expiration date is required for this product." }, { status: 400 });
        }
        if (mfgDate && expDate && new Date(mfgDate) > new Date(expDate)) {
            return NextResponse.json({ success: false, error: "Manufacturing date cannot be after expiration date." }, { status: 400 });
        }

        // Draft IDs belong to mm_physical_inventory_draft_batches and cannot be stored in
        // mm_physical_inventory_details.inventory_lot_id. Materialize the master first.
        if (draftBatch && draftBatchId > 0) {
            const batchNo = String(draftBatch.batch_no || "").trim();
            if (!batchNo) {
                return NextResponse.json({ success: false, error: "Draft batch number is required." }, { status: 400 });
            }

            const existingUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?filter[batch_no][_eq]=${encodeURIComponent(batchNo)}&limit=-1&fields=inventory_lot_id,lot_id,branch_id,product_id`;
            const existingRes = await fetch(existingUrl, { headers, cache: "no-store" });
            if (!existingRes.ok) {
                return NextResponse.json({ success: false, error: "Unable to verify whether this batch already exists. Please retry." }, { status: 502 });
            }
            const existingBatches = (await existingRes.json()).data || [];
            const matchingBatch = existingBatches.find((candidate: Record<string, unknown>) =>
                extractId(candidate.lot_id, "lot_id") === finalLotId
                && extractId(candidate.branch_id, "branch_id") === piBranchId
                && extractId(candidate.product_id, "product_id") === productId
            );

            if (existingBatches.length > 0 && !matchingBatch) {
                return NextResponse.json({ success: false, error: `Batch number '${batchNo}' already exists for a different lot, branch, or product.` }, { status: 409 });
            }

            if (matchingBatch) {
                finalInventoryLotId = extractId(matchingBatch.inventory_lot_id || matchingBatch.id);
            } else {
                const authUserId = getJwtSubFromReq(request);
                const createMasterRes = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        lot_id: finalLotId,
                        branch_id: piBranchId,
                        product_id: productId,
                        batch_no: batchNo,
                        manufacturing_date: mfgDate,
                        expiry_date: expDate,
                        unit_cost: Number(draftBatch.unit_cost || 0),
                        qa_status: draftBatch.qa_status || "GOOD",
                        status: "INACTIVE",
                        source_type: "PHYSICAL_INVENTORY_DRAFT",
                        source_reference: sheet.pi_no || `PI-#${sheetId}`,
                        created_by: authUserId || draftBatch.created_by || null,
                    }),
                });

                if (!createMasterRes.ok) {
                    const errTxt = await createMasterRes.text();
                    return NextResponse.json({ success: false, error: `Failed to create inventory batch '${batchNo}': ${errTxt}` }, { status: 502 });
                }

                const createdMaster = (await createMasterRes.json()).data;
                finalInventoryLotId = extractId(createdMaster.inventory_lot_id || createdMaster.id);
            }

            if (finalInventoryLotId <= 0) {
                return NextResponse.json({ success: false, error: "The selected draft batch could not be linked to an inventory lot. Refresh the batch list and try again." }, { status: 502 });
            }
        }

        // 6. Check Duplicate Batch + Condition combination in this PI
        const dupCheckUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&filter[inventory_lot_id][_eq]=${finalInventoryLotId}&filter[inventory_condition][_eq]=${encodeURIComponent(conditionStr)}&limit=1`;
        const dupRes = await fetch(dupCheckUrl, { headers, cache: "no-store" });
        if (dupRes.ok) {
            const dupJson = await dupRes.json();
            if (dupJson.data && dupJson.data.length > 0) {
                return NextResponse.json({ success: false, error: "Duplicate batch and condition combinations are not allowed in the same Physical Inventory." }, { status: 409 });
            }
        }

        // 7. Load System Count from Movements API
        const productTypeId = extractId(sheet.product_type_id);
        const batchNoStr = batch?.batch_no ? String(batch.batch_no) : null;
        const systemCount = await getSingleItemSystemOnhand(piBranchId, finalInventoryLotId, finalLotId, productId, conditionStr, productTypeId, batchNoStr);

        const priceTypeId = extractId(sheet.price_type_id);
        const unitCost = await resolveProductPrice(productId, priceTypeId);

        // DO NOT include generated columns `variance` and `difference_cost` in INSERT!
        const detailPayload = {
            physical_inventory_id: sheetId,
            inventory_lot_id: finalInventoryLotId,
            lot_id: finalLotId,
            product_id: productId,
            unit_id: prodUnitId,
            batch_no: batch.batch_no,
            manufacturing_date: mfgDate,
            expiration_date: expDate,
            inventory_condition: conditionStr,
            system_count: systemCount,
            physical_count: physCountNum,
            unit_cost: unitCost,
            remarks: remarks ? String(remarks).trim() : null,
        };

        const createDetailUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details`;
        const res = await fetch(createDetailUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(detailPayload),
        });

        if (!res.ok) {
            const errText = await res.text();
            if (errText.includes("INVALID_FOREIGN_KEY") && errText.includes("inventory_lot_id")) {
                return NextResponse.json({ success: false, error: "Selected batch could not be resolved to an inventory lot. Refresh the batch list and try again." }, { status: 409 });
            }
            throw new Error(`Directus failed to insert detail row: ${errText}`);
        }

        const createdDetail = (await res.json()).data;

        // Mark the source draft as converted only after the detail row successfully references
        // its real mm_inventory_lots record.
        if (draftBatchId > 0) {
            try {
                const markDraftRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_draft_batches/${draftBatchId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "CONVERTED", physical_inventory_id: sheetId }),
                });
                if (!markDraftRes.ok) {
                    console.error(`Failed to mark draft batch ${draftBatchId} as converted: ${await markDraftRes.text()}`);
                }
            } catch (error) {
                console.error(`Failed to mark draft batch ${draftBatchId} as converted:`, error);
            }
        }

        // Recalculate totals on header
        await recalculateHeaderTotals(sheetId);

        return NextResponse.json({ success: true, data: createdDetail }, { status: 201 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        console.error("POST detail error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

/**
 * PATCH /api/manufacturing/physical-inventory-manufacturing/[id]/details
 * Update an existing detail row (physical_count, inventory_condition, remarks).
 */
export async function PATCH(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        const headerRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`, { headers, cache: "no-store" });
        if (!headerRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }
        const sheet = (await headerRes.json()).data;
        const statusUpper = String(sheet.status || "").toUpperCase();
        const isCommitted = parseBooleanFlag(sheet.isCommitted);
        const isCancelled = parseBooleanFlag(sheet.isCancelled);

        if (statusUpper !== "DRAFT" || isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: `Details can only be updated on DRAFT sheets. Current status: ${sheet.status}` }, { status: 400 });
        }

        const body = await request.json();
        const detailId = extractId(body.physical_inventory_detail_id || body.id);
        if (!detailId || detailId <= 0) {
            return NextResponse.json({ success: false, error: "Detail ID is required." }, { status: 400 });
        }

        const existingDetailRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_details/${detailId}`, { headers, cache: "no-store" });
        if (!existingDetailRes.ok) {
            return NextResponse.json({ success: false, error: "Detail row not found." }, { status: 404 });
        }
        const existingDetail = (await existingDetailRes.json()).data;

        const isOpening = sheet.stock_type === "OPENING";
        const physCountNum = body.physical_count !== undefined
            ? (body.physical_count !== null && body.physical_count !== "" ? roundQty(body.physical_count) : 0)
            : roundQty(existingDetail.physical_count || 0);

        if (physCountNum < 0) {
            return NextResponse.json({ success: false, error: "Physical count cannot be negative." }, { status: 400 });
        }

        const conditionStr = body.inventory_condition ? String(body.inventory_condition).trim().toUpperCase() : existingDetail.inventory_condition;
        const remarksStr = body.remarks !== undefined ? (body.remarks ? String(body.remarks).trim() : null) : existingDetail.remarks;

        const systemCount = roundQty(existingDetail.system_count);
        const calculatedVariance = roundQty(physCountNum - systemCount);
        if (!isOpening && calculatedVariance !== 0 && (!remarksStr || !remarksStr.trim())) {
            return NextResponse.json({ success: false, error: "Variance reason is required when a Regular Physical Inventory has a nonzero variance." }, { status: 400 });
        }

        // DO NOT send generated columns `variance` or `difference_cost`
        const updatePayload: Record<string, unknown> = {
            physical_count: physCountNum,
            inventory_condition: conditionStr,
            remarks: remarksStr,
        };

        const updateUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details/${detailId}`;
        const res = await fetch(updateUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to update detail: ${errText}`);
        }

        const updatedDetail = (await res.json()).data;
        await recalculateHeaderTotals(sheetId);

        return NextResponse.json({ success: true, data: updatedDetail });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

/**
 * DELETE /api/manufacturing/physical-inventory-manufacturing/[id]/details
 * Remove a detail row from a draft physical inventory sheet.
 */
export async function DELETE(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        const headerRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`, { headers, cache: "no-store" });
        if (!headerRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }
        const sheet = (await headerRes.json()).data;
        const statusUpper = String(sheet.status || "").toUpperCase();
        const isCommitted = parseBooleanFlag(sheet.isCommitted);
        const isCancelled = parseBooleanFlag(sheet.isCancelled);

        if (statusUpper !== "DRAFT" || isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: `Details can only be removed from DRAFT sheets. Current status: ${sheet.status}` }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const detailIdParam = searchParams.get("detail_id") || searchParams.get("id");
        const detailId = Number(detailIdParam);
        if (!detailId || detailId <= 0) {
            return NextResponse.json({ success: false, error: "Detail ID parameter is required." }, { status: 400 });
        }

        const detailRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_details/${detailId}`, { headers, cache: "no-store" });
        if (!detailRes.ok) {
            return NextResponse.json({ success: false, error: "Detail row not found." }, { status: 404 });
        }
        const detail = (await detailRes.json()).data;
        const systemCount = Number(detail.system_count || 0);
        const isAutoPopulated = Boolean(detail.remarks && String(detail.remarks).toLowerCase().includes("auto-populated"));

        if (systemCount > 0 || isAutoPopulated) {
            return NextResponse.json({
                success: false,
                error: "Deletion restricted: Line items with system stock (SYSTEM > 0) or derived from automated system stock population cannot be deleted."
            }, { status: 400 });
        }

        const deleteUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details/${detailId}`;
        const res = await fetch(deleteUrl, { method: "DELETE", headers });
        if (!res.ok && res.status !== 204) {
            const errText = await res.text();
            throw new Error(`Directus failed to delete detail: ${errText}`);
        }

        await recalculateHeaderTotals(sheetId);
        return NextResponse.json({ success: true, message: "Detail removed successfully." });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

export const PUT = PATCH;
