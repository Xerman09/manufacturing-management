import { NextResponse } from "next/server";
import { DIRECTUS_URL, getDirectusHeaders } from "./directus";
import { fetchWipInventoryMovements } from "./inventory-movements";
import {
    calculateRemainingWip,
    determineLotStatus,
    determineWipStatus,
    EPSILON,
    isLotExpired,
    round4,
} from "@/modules/manufacturing-management/shop-floor-and-quality/work-in-progress/utils/wip-calculations";
import type {
    WipInventoryMovement,
    WipLotReservation,
    WipMaterialItem,
    WipMaterialStatus,
    WipShiftConsumption,
    WipSummaryMetrics,
} from "@/modules/manufacturing-management/shop-floor-and-quality/work-in-progress/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusJobOrderRaw {
    job_order_id: number;
    job_order_no?: string;
    product_id?: number | { product_id?: number; product_name?: string };
    branch_id?: number | { id?: number; branch_name?: string };
    version_id?: number;
    status?: string;
    target_quantity?: number;
    actual_quantity_produced?: number;
    start_date?: string;
    end_date?: string;
    created_at?: string;
}

interface DirectusMaterialRaw {
    jo_material_id: number;
    job_order_id?: number | { job_order_id?: number };
    product_id?: number | { product_id?: number };
    uom_id?: number | { unit_id?: number; unit_shortcut?: string };
    allocated_quantity?: number;
    reserved_quantity?: number;
    actual_consumed_quantity?: number;
    scrap_quantity?: number;
}

interface DirectusReservationRaw {
    jo_materials_reservation_id: number;
    jo_material_id?: number | { jo_material_id?: number };
    product_id?: number | { product_id?: number };
    branch_id?: number | { id?: number; branch_name?: string };
    mm_lot_id?: number | null;
    inventory_lot_id?: number | null;
    batch_no?: string | null;
    reserved_quantity?: number;
    staged_quantity?: number;
    issued_to_wip_quantity?: number;
    actual_used_quantity?: number;
    returned_quantity?: number;
    remaining_wip_quantity?: number;
    staging_bin?: string | null;
    reservation_status?: string | null;
    expiry_date?: string | null;
    wip_started_at?: string | null;
}

interface DirectusYieldLedgerRaw {
    ledger_id: number;
    job_order_id?: number | { job_order_id?: number };
    shift_name?: string;
    yield_quantity?: number;
    scrap_quantity?: number;
    qa_status?: string;
    logged_at?: string;
    logged_by?: number;
    remarks?: string;
}

interface DirectusBomConsumageRaw {
    consumage_id: number;
    ledger_id?: number | { ledger_id?: number };
    product_id?: number | { product_id?: number };
    quantity_consumed?: number;
    jo_material_id?: number | { jo_material_id?: number };
    reservation_id?: number | { jo_materials_reservation_id?: number };
    batch_no?: string | null;
    uom_id?: number | null;
    theoretical_quantity?: number;
    variance_quantity?: number;
    variance_reason?: string | null;
}

interface DirectusProductRaw {
    product_id: number;
    product_name?: string;
    product_code?: string;
    description?: string | null;
    unit_of_measurement?: { unit_id?: number; unit_shortcut?: string; unit_name?: string };
    product_type?: { product_type_id?: number; product_type_name?: string };
}

interface DirectusLotRaw {
    lot_id: number;
    lot_name?: string | null;
}

interface DirectusBranchRaw {
    id: number;
    branch_name?: string;
    branch_code?: string;
}

function resolveId(value: unknown): number {
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        return Number(obj.id ?? obj.job_order_id ?? obj.product_id ?? obj.jo_material_id ?? obj.ledger_id ?? 0);
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function num(val: unknown): number {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchFilter = searchParams.get("branch_id");

        const headers = getDirectusHeaders();

        // Concurrent fetching of Directus registries & Spring Boot movements
        const [
            joRes,
            materialsRes,
            reservationsRes,
            yieldsRes,
            consumagesRes,
            productsRes,
            branchesRes,
            workCentersRes,
            lotsRes,
            movementsList,
        ] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&sort=-job_order_id`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?limit=-1`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?limit=-1`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1&sort=-logged_at`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger_bom_consumage?limit=-1`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,description,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,product_type.product_type_name`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=lot_id,lot_name`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetchWipInventoryMovements({
                sourceModule: "MM_JOB_ORDER",
                branch: branchFilter && branchFilter !== "all" ? Number(branchFilter) : null,
            }).catch(() => []),
        ]);

        if (!joRes || !joRes.ok) {
            return NextResponse.json({ error: "Failed to read Job Orders from Manufacturing Directus." }, { status: 502 });
        }

        const rawJOs: DirectusJobOrderRaw[] = (await joRes.json()).data || [];
        const rawMaterials: DirectusMaterialRaw[] = materialsRes && materialsRes.ok ? (await materialsRes.json()).data || [] : [];
        const rawReservations: DirectusReservationRaw[] = reservationsRes && reservationsRes.ok ? (await reservationsRes.json()).data || [] : [];
        const rawYields: DirectusYieldLedgerRaw[] = yieldsRes && yieldsRes.ok ? (await yieldsRes.json()).data || [] : [];
        const rawConsumages: DirectusBomConsumageRaw[] = consumagesRes && consumagesRes.ok ? (await consumagesRes.json()).data || [] : [];
        const rawProducts: DirectusProductRaw[] = productsRes && productsRes.ok ? (await productsRes.json()).data || [] : [];
        const rawBranches: DirectusBranchRaw[] = branchesRes && branchesRes.ok ? (await branchesRes.json()).data || [] : [];
        const rawWorkCenters: Array<{ work_center_id?: number; work_center_name?: string }> =
            workCentersRes && workCentersRes.ok ? (await workCentersRes.json()).data || [] : [];
        const rawLots: DirectusLotRaw[] = lotsRes && lotsRes.ok ? (await lotsRes.json()).data || [] : [];

        // Build Product Lookup Map
        const productMap = new Map<number, {
            name: string;
            code: string;
            description: string;
            uom: string;
            isPackaging: boolean;
        }>();
        for (const p of rawProducts) {
            const id = Number(p.product_id);
            if (id > 0) {
                const typeName = String(p.product_type?.product_type_name || "").toLowerCase();
                const isPkg = typeName.includes("packaging") || typeName.includes("box") || typeName.includes("label") || typeName.includes("bottle");
                productMap.set(id, {
                    name: p.product_name || "-",
                    code: p.product_code || "-",
                    description: p.description || "-",
                    uom: p.unit_of_measurement?.unit_shortcut || "-",
                    isPackaging: isPkg,
                });
            }
        }

        // Build Lot Lookup Map (lot_id -> lot_name)
        const lotMap = new Map<number, string>();
        for (const l of rawLots) {
            const id = Number(l.lot_id);
            if (id > 0 && l.lot_name) {
                lotMap.set(id, String(l.lot_name).trim());
            }
        }

        // Build Branch Lookup Map
        const branchMap = new Map<number, { name: string; code: string }>();
        for (const b of rawBranches) {
            const id = Number(b.id);
            if (id > 0) {
                branchMap.set(id, {
                    name: b.branch_name || "-",
                    code: b.branch_code || "-",
                });
            }
        }

        // Build Work Center Lookup Map
        const workCenterMap = new Map<number, string>();
        for (const wc of rawWorkCenters) {
            const id = Number(wc.work_center_id);
            if (id > 0 && wc.work_center_name) {
                workCenterMap.set(id, String(wc.work_center_name).trim());
            }
        }

        const resolveStagingBinDetails = (
            rawBin: string | null | undefined
        ): { friendlyName: string | null; rawCode: string | null } => {
            if (!rawBin || !rawBin.trim()) {
                return { friendlyName: null, rawCode: null };
            }
            const trimmed = rawBin.trim();
            const wcMatch = trimmed.match(/^FLOOR-STAGING-(\d+)$/i);
            if (wcMatch) {
                const wcId = Number(wcMatch[1]);
                const wcName = workCenterMap.get(wcId);
                return {
                    friendlyName: wcName || `Work Center #${wcId}`,
                    rawCode: trimmed,
                };
            }
            if (trimmed.toUpperCase() === "FLOOR-STAGING") {
                return { friendlyName: "General Floor Staging", rawCode: trimmed };
            }
            if (trimmed.toUpperCase() === "MAIN-STORE") {
                return { friendlyName: "Main Warehouse Store", rawCode: trimmed };
            }
            return { friendlyName: trimmed, rawCode: trimmed };
        };

        // Build Job Order Lookup Map
        const joMap = new Map<number, {
            no: string;
            status: string;
            productId: number;
            branchId: number;
            startDate: string | null;
            endDate: string | null;
        }>();
        for (const jo of rawJOs) {
            const id = Number(jo.job_order_id);
            if (id > 0) {
                joMap.set(id, {
                    no: jo.job_order_no || "-",
                    status: jo.status || "-",
                    productId: resolveId(jo.product_id),
                    branchId: resolveId(jo.branch_id),
                    startDate: jo.start_date || jo.created_at || null,
                    endDate: jo.end_date || null,
                });
            }
        }

        // Build Yield Ledger Map
        const yieldMap = new Map<number, DirectusYieldLedgerRaw>();
        for (const y of rawYields) {
            yieldMap.set(Number(y.ledger_id), y);
        }

        // Pre-map materials by jo_material_id and by `${job_order_id}_${product_id}`
        const joMatIdByJoAndProduct = new Map<string, number>();
        for (const mat of rawMaterials) {
            const joMatId = Number(mat.jo_material_id);
            const joId = resolveId(mat.job_order_id);
            const prodId = resolveId(mat.product_id);
            if (joMatId > 0 && joId > 0 && prodId > 0) {
                joMatIdByJoAndProduct.set(`${joId}_${prodId}`, joMatId);
            }
        }

        // Index Consumages by jo_material_id (with fallback to jobOrderId + productId)
        const consumagesByMaterial = new Map<number, WipShiftConsumption[]>();
        for (const c of rawConsumages) {
            let joMatId = resolveId(c.jo_material_id);
            const ledger = yieldMap.get(resolveId(c.ledger_id));
            const cProdId = resolveId(c.product_id);
            const cJoId = ledger ? resolveId(ledger.job_order_id) : 0;

            if (joMatId <= 0 && cJoId > 0 && cProdId > 0) {
                joMatId = joMatIdByJoAndProduct.get(`${cJoId}_${cProdId}`) || 0;
            }

            if (joMatId > 0) {
                const prod = productMap.get(cProdId);
                const entry: WipShiftConsumption = {
                    consumageId: Number(c.consumage_id),
                    ledgerId: resolveId(c.ledger_id),
                    jobOrderId: cJoId,
                    shiftName: ledger?.shift_name || "-",
                    productId: cProdId,
                    productName: prod?.name || "-",
                    quantityConsumed: num(c.quantity_consumed),
                    theoreticalQuantity: num(c.theoretical_quantity),
                    varianceQuantity: num(c.variance_quantity),
                    varianceReason: c.variance_reason || null,
                    batchNo: c.batch_no || null,
                    uomShortcut: prod?.uom || "-",
                    loggedAt: ledger?.logged_at || null,
                    loggedBy: ledger?.logged_by ?? null,
                    qaStatus: ledger?.qa_status || "-",
                };
                const existing = consumagesByMaterial.get(joMatId) || [];
                existing.push(entry);
                consumagesByMaterial.set(joMatId, existing);
            }
        }

        // Index Reservations by jo_material_id
        const reservationsByMaterial = new Map<number, DirectusReservationRaw[]>();
        for (const r of rawReservations) {
            const joMatId = resolveId(r.jo_material_id);
            if (joMatId > 0) {
                const list = reservationsByMaterial.get(joMatId) || [];
                list.push(r);
                reservationsByMaterial.set(joMatId, list);
            }
        }

        // Index Movements strictly from manu_dummy_system.v_mm_inventory_movements for Job Orders
        const movementsByJoAndProduct = new Map<string, WipInventoryMovement[]>();
        for (const m of movementsList) {
            const rawSource = String(m.sourceModule || m.source_module || "").toUpperCase();
            const rawTrans = String(m.transactionType || m.transaction_type || "").toUpperCase();
            const isJoMovement = rawSource === "MM_JOB_ORDER" || rawTrans.startsWith("JOB_ORDER");

            if (!isJoMovement) continue;

            const joId = Number(m.referenceId || m.reference_id || m.source_document_id);
            const prodId = Number(m.productId || m.product_id);
            const refNo = String(m.referenceNo || m.reference_no || m.source_document_no || "").trim();

            if (prodId > 0) {
                const entry: WipInventoryMovement = {
                    movementKey: String(m.movementKey || m.movement_key || ""),
                    transactionType: String(m.transactionType || m.transaction_type || "-"),
                    movementDirection: String(m.movementDirection || m.movement_direction || "-"),
                    quantityIn: num(m.quantityIn || m.quantity_in),
                    quantityOut: num(m.quantityOut || m.quantity_out),
                    batchNo: m.batchNo ? String(m.batchNo) : null,
                    transactionDate: m.transactionDate ? String(m.transactionDate) : null,
                    postedAt: m.postedAt ? String(m.postedAt) : null,
                    remarks: m.remarks ? String(m.remarks) : null,
                    productName: m.productName ? String(m.productName) : "-",
                };

                if (joId > 0) {
                    const key = `${joId}_${prodId}`;
                    const list = movementsByJoAndProduct.get(key) || [];
                    list.push(entry);
                    movementsByJoAndProduct.set(key, list);
                }
                if (refNo) {
                    const key = `${refNo}_${prodId}`;
                    const list = movementsByJoAndProduct.get(key) || [];
                    list.push(entry);
                    movementsByJoAndProduct.set(key, list);
                }
            }
        }

        // Construct WIP Material Items
        const items: WipMaterialItem[] = [];

        for (const mat of rawMaterials) {
            const joMatId = Number(mat.jo_material_id);
            const joId = resolveId(mat.job_order_id);
            const jo = joMap.get(joId);
            if (!jo) continue; // Skip orphaned materials

            const matProductId = resolveId(mat.product_id);
            const product = productMap.get(matProductId);
            const targetProduct = productMap.get(jo.productId);
            const branch = branchMap.get(jo.branchId);

            const lotRows = reservationsByMaterial.get(joMatId) || [];
            const consumptionRows = consumagesByMaterial.get(joMatId) || [];
            const joMovements =
                movementsByJoAndProduct.get(`${joId}_${matProductId}`) ||
                (jo.no ? movementsByJoAndProduct.get(`${jo.no}_${matProductId}`) : undefined) ||
                [];

            // Quantities aggregation
            let totalReserved = 0;
            let totalStaged = 0;
            let totalIssued = 0;
            let totalConsumed = num(mat.actual_consumed_quantity);
            let totalReturned = 0;
            const totalLoss = num(mat.scrap_quantity);

            const nowTimestamp = Date.now();
            const lotReservations: WipLotReservation[] = lotRows.map((r) => {
                const resQty = num(r.reserved_quantity);
                const stgQty = num(r.staged_quantity);
                const issQty = num(r.issued_to_wip_quantity);
                const actQty = num(r.actual_used_quantity);
                const retQty = num(r.returned_quantity);
                const remQty = num(r.remaining_wip_quantity);

                totalReserved += resQty;
                totalStaged += stgQty;
                totalIssued += issQty;
                totalReturned += retQty;

                const calculatedRem = calculateRemainingWip(issQty, actQty, retQty, 0);
                const remainingWipQty = round4(remQty > 0 ? remQty : calculatedRem);
                const isPackaging = Boolean(product?.isPackaging);
                const isExpired = isLotExpired(r.expiry_date, remainingWipQty, isPackaging, nowTimestamp);

                const lotStatus = determineLotStatus({
                    remainingWipQuantity: remainingWipQty,
                    actualUsedQuantity: actQty,
                    issuedToWipQuantity: issQty,
                    returnedQuantity: retQty,
                    reservedQuantity: resQty,
                    reservationStatus: r.reservation_status,
                });

                const binDetails = resolveStagingBinDetails(r.staging_bin);

                const lotProductId = resolveId(r.product_id) || matProductId;
                const lotProduct = productMap.get(lotProductId) || product;
                const lotNo = r.mm_lot_id ? lotMap.get(Number(r.mm_lot_id)) || null : null;

                return {
                    reservationId: Number(r.jo_materials_reservation_id),
                    joMaterialId: joMatId,
                    jobOrderId: joId,
                    productId: lotProductId,
                    productName: lotProduct?.name || "-",
                    productCode: lotProduct?.code || "-",
                    productDescription: lotProduct?.description && lotProduct.description !== "-" ? lotProduct.description : null,
                    branchId: jo.branchId,
                    branchName: branch?.name || "-",
                    batchNo: r.batch_no || "-",
                    lotNo,
                    mmLotId: r.mm_lot_id ?? null,
                    inventoryLotId: r.inventory_lot_id ?? null,
                    uomId: resolveId(mat.uom_id) || null,
                    uomShortcut: product?.uom || "-",
                    stagingBin: binDetails.friendlyName,
                    stagingBinCode: binDetails.rawCode,
                    expiryDate: r.expiry_date || null,
                    reservationStatus: lotStatus,
                    reservedQuantity: round4(resQty),
                    stagedQuantity: round4(stgQty),
                    issuedToWipQuantity: round4(issQty),
                    actualUsedQuantity: round4(actQty),
                    returnedQuantity: round4(retQty),
                    remainingWipQuantity: remainingWipQty,
                    wipStartedAt: r.wip_started_at || null,
                    isPackaging,
                    isExpired,
                };
            });

            // If shift consumptions logged in consumage table exceed material actual_consumed_quantity, take the higher authoritative sum
            const sumShiftConsumptions = consumptionRows.reduce((acc, c) => acc + c.quantityConsumed, 0);
            if (sumShiftConsumptions > totalConsumed) {
                totalConsumed = sumShiftConsumptions;
            }

            // Calculate floor remaining WIP
            const remainingWip = calculateRemainingWip(totalIssued, totalConsumed, totalReturned, totalLoss);
            const status: WipMaterialStatus = determineWipStatus(
                totalReserved,
                totalIssued,
                totalConsumed,
                totalReturned,
                totalLoss,
                remainingWip
            );

            const hasDiscrepancy = remainingWip < -EPSILON || totalConsumed > totalIssued + EPSILON;
            const discrepancyNote = hasDiscrepancy
                ? `Consumed quantity (${totalConsumed}) exceeds issued floor quantity (${totalIssued}) by ${round4(totalConsumed - totalIssued)}.`
                : null;

            items.push({
                id: `${joId}_${joMatId}`,
                jobOrderId: joId,
                jobOrderNo: jo.no,
                jobOrderStatus: jo.status,
                targetProductId: jo.productId,
                targetProductName: targetProduct?.name || "-",
                targetProductCode: targetProduct?.code || "-",
                targetProductDescription: targetProduct?.description && targetProduct.description !== "-" ? targetProduct.description : null,
                branchId: jo.branchId,
                branchName: branch?.name || "-",
                materialId: matProductId,
                materialName: product?.name || "-",
                materialCode: product?.code || "-",
                uomId: resolveId(mat.uom_id) || null,
                uomShortcut: product?.uom || "-",
                isPackaging: Boolean(product?.isPackaging),
                allocatedQuantity: round4(num(mat.allocated_quantity)),
                reservedQuantity: round4(totalReserved),
                stagedQuantity: round4(totalStaged),
                issuedQuantity: round4(totalIssued),
                consumedQuantity: round4(totalConsumed),
                returnedQuantity: round4(totalReturned),
                lossQuantity: round4(totalLoss),
                remainingWipQuantity: remainingWip,
                status,
                hasDiscrepancy,
                discrepancyNote,
                lots: lotReservations,
                consumptions: consumptionRows,
                movements: joMovements,
                startDate: jo.startDate,
                endDate: jo.endDate,
            });
        }

        // Summary KPI Metrics
        const activeJobOrdersSet = new Set<number>();
        let sumReserved = 0;
        let sumIssued = 0;
        let sumConsumed = 0;
        let sumReturned = 0;
        let sumLoss = 0;
        let sumRemaining = 0;
        let exceptionsCount = 0;

        for (const item of items) {
            if (item.remainingWipQuantity > 0 || item.issuedQuantity > 0 || item.reservedQuantity > 0) {
                activeJobOrdersSet.add(item.jobOrderId);
            }
            sumReserved += item.reservedQuantity;
            sumIssued += item.issuedQuantity;
            sumConsumed += item.consumedQuantity;
            sumReturned += item.returnedQuantity;
            sumLoss += item.lossQuantity;
            sumRemaining += item.remainingWipQuantity;
            if (item.hasDiscrepancy || item.status === "EXCEPTION_OVER_CONSUMED") {
                exceptionsCount++;
            }
        }

        const metrics: WipSummaryMetrics = {
            totalActiveJobOrders: activeJobOrdersSet.size,
            totalMaterialsTracked: items.length,
            totalReservedQuantity: round4(sumReserved),
            totalIssuedQuantity: round4(sumIssued),
            totalConsumedQuantity: round4(sumConsumed),
            totalReturnedQuantity: round4(sumReturned),
            totalLossQuantity: round4(sumLoss),
            totalRemainingWipQuantity: round4(sumRemaining),
            totalExceptionsCount: exceptionsCount,
        };

        // Distinct options for filters
        const joOptionsMap = new Map<number, { id: number; no: string; productName: string; status: string }>();
        const branchOptionsMap = new Map<number, { id: number; name: string; code: string }>();
        const materialOptionsMap = new Map<number, { id: number; name: string; code: string }>();

        for (const item of items) {
            if (!joOptionsMap.has(item.jobOrderId)) {
                joOptionsMap.set(item.jobOrderId, {
                    id: item.jobOrderId,
                    no: item.jobOrderNo,
                    productName: item.targetProductName,
                    status: item.jobOrderStatus,
                });
            }
            if (!branchOptionsMap.has(item.branchId)) {
                branchOptionsMap.set(item.branchId, {
                    id: item.branchId,
                    name: item.branchName,
                    code: item.branchName,
                });
            }
            if (!materialOptionsMap.has(item.materialId)) {
                materialOptionsMap.set(item.materialId, {
                    id: item.materialId,
                    name: item.materialName,
                    code: item.materialCode,
                });
            }
        }

        return NextResponse.json({
            items,
            metrics,
            jobOrderOptions: Array.from(joOptionsMap.values()),
            branchOptions: Array.from(branchOptionsMap.values()),
            materialOptions: Array.from(materialOptionsMap.values()),
        });
    } catch (error) {
        console.error("[API Error] Work In Progress Route:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to load Work In Progress tracking data." },
            { status: 500 }
        );
    }
}
