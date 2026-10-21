import { DIRECTUS_URL, headers } from "../../services/core-api.service";
import {
    fetchMmInventoryMovements,
    MmInventoryMovementError,
    type NormalizedMmInventoryMovement
} from "../../services/mm-inventory-movements.service";
import {
    loadMmInventoryLots,
    loadMmLots,
    mmInventoryLotId,
    mmLotId,
    resolveProductUnitId
} from "../../services/mm-lots.service";
import { JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";

export { MmInventoryMovementError };

export const ACTIVE_JOB_ORDER_STATUSES = [
    JOB_ORDER_STATUS.DRAFT,
    JOB_ORDER_STATUS.FOR_PICKING,
    JOB_ORDER_STATUS.PICKED,
    JOB_ORDER_STATUS.IN_PRODUCTION,
    JOB_ORDER_STATUS.ON_HOLD,
    JOB_ORDER_STATUS.QA_HOLD
];

export interface AvailableInventoryLot {
    batchNo: string;
    storageLotName: string | null;
    mmLotId: number | null;
    inventoryLotId: number | null;
    purchaseOrderReceivingId: number | null;
    available: number;
    physicalQuantity?: number;
    expiryDate?: string | null;
    manufacturingDate?: string | null;
    qaStatus?: string | null;
    isConvertiblePackaging?: boolean;
    packagingProductName?: string;
    packagingProductCode?: string;
    originalQuantity?: number;
    originalUomName?: string;
    conversionRatio?: number;
    packagingNote?: string;
}

const RESERVABLE_QA_STATUSES = new Set([
    "GOOD",
    "PASSED",
    "PASS",
    "APPROVED",
    "PARTIALLY_ACCEPTED"
]);

export function isReservableQaStatus(status?: string | null): boolean {
    const normalized = String(status || "PASSED").trim().toUpperCase();
    return RESERVABLE_QA_STATUSES.has(normalized);
}

export function isExpired(value: unknown): boolean {
    const raw = String(value ?? "").trim();
    if (!raw) return false;
    const expiry = new Date(raw);
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
}

export function batchKey(value: unknown): string {
    return String(value ?? "").trim().toLowerCase();
}

function nonNegativeFinite(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * Calculates the unissued portion of a reservation.
 * The staged/issued portion has already reduced movement-backed on-hand stock.
 * Only the remainder of a reservation is deducted from available balance.
 */
export function getUnissuedReservationQuantity(
    reservedQuantity: unknown,
    stagedQuantity: unknown,
    issuedToWipQuantity: unknown
): number {
    const reserved = nonNegativeFinite(reservedQuantity);
    const alreadyIssued = Math.max(
        nonNegativeFinite(stagedQuantity),
        nonNegativeFinite(issuedToWipQuantity)
    );
    return Math.max(0, reserved - alreadyIssued);
}

function relationId(value: unknown, keys: string[]): number | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const nested = relationId(record[key], keys);
            if (nested !== null) return nested;
        }
        return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function productIdFrom(value: unknown): number | null {
    return relationId(value, ["product_id", "id"]);
}

function batchText(value: unknown): string {
    return String(value ?? "").trim();
}

export interface AvailableInventoryLotOptions {
    movementRows?: NormalizedMmInventoryMovement[];
    includeReservations?: boolean;
}

/**
 * Fetches and resolves available inventory lots for a product and branch.
 * Adheres strictly to canonical movement data, unissued reservation deductions,
 * expiration checks (FEFO eligibility), and reservable QA statuses.
 */
export async function getAvailableInventoryLots(
    productId: number,
    branchId: number,
    options: AvailableInventoryLotOptions = {}
): Promise<AvailableInventoryLot[]> {
    if (!productId || !branchId) {
        throw new Error("Missing required productId or branchId in getAvailableInventoryLots");
    }

    const numericProductId = Number(productId);
    const numericBranchId = Number(branchId);
    const productUnitId = await resolveProductUnitId(numericProductId);

    const movementRowsPromise = options.movementRows
        ? Promise.resolve(options.movementRows)
        : fetchMmInventoryMovements({
            branch: numericBranchId,
            product: numericProductId
        });

    const reservationsResPromise = options.includeReservations === false
        ? Promise.resolve<Response | null>(null)
        : fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?filter=${encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: numericProductId } },
                { branch_id: { _eq: numericBranchId } },
                { jo_material_id: { job_order_id: { status: { _in: ACTIVE_JOB_ORDER_STATUSES } } } }
            ]
        }))}&fields=product_id,batch_no,mm_lot_id,inventory_lot_id,reserved_quantity,staged_quantity,issued_to_wip_quantity&limit=-1`, { headers, cache: "no-store" });

    const [springMovements, receiptsRes, yieldsRes, reservationsRes, eligibleStorageLots, inventoryLots] = await Promise.all([
        movementRowsPromise,
        fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[product_id][_eq]=${numericProductId}&filter[branch_id][_eq]=${numericBranchId}&fields=purchase_order_product_id,product_id,batch_no,lot_no,qa_status,is_reverted,received_quantity,mm_lot_id,expiry_date,manufacturing_date,created_at&limit=-1`, { headers, cache: "no-store" }),
        fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][product_id][_eq]=${numericProductId}&fields=lot_number,qa_status,job_order_id.product_id&limit=-1`, { headers, cache: "no-store" }),
        reservationsResPromise,
        loadMmLots({ branchId: numericBranchId, unitId: productUnitId }),
        loadMmInventoryLots({ branchId: numericBranchId, productId: numericProductId, onlyActive: true })
    ]);

    const eligibleStorageLotIds = new Set(
        eligibleStorageLots
            .map((lot) => mmLotId(lot.lot_id))
            .filter((lotId): lotId is number => lotId !== null)
    );
    const storageLotNamesById = new Map<number, string>();
    eligibleStorageLots.forEach((lot) => {
        const storageLotId = mmLotId(lot.lot_id);
        const storageLotName = String(lot.lot_name || "").trim();
        if (storageLotId !== null && storageLotName) storageLotNamesById.set(storageLotId, storageLotName);
    });

    const receipts = receiptsRes.ok ? (await receiptsRes.json()).data || [] : [];
    const yields = yieldsRes.ok ? (await yieldsRes.json()).data || [] : [];
    const reservations = reservationsRes?.ok ? (await reservationsRes.json()).data || [] : [];

    // Spring Boot movement ledger is the authoritative live inventory source
    const movements = springMovements;

    type InventoryMetadata = {
        inventoryLotId: number;
        mmLotId: number | null;
        batchNo: string;
        qaStatus: string | null;
        expiryDate: string | null;
        manufacturingDate: string | null;
    };
    const inventoryById = new Map<number, InventoryMetadata>();
    const inventoryByMmLotBatch = new Map<string, InventoryMetadata[]>();
    inventoryLots.forEach((inventoryLot: Record<string, unknown>) => {
        const inventoryLotId = mmInventoryLotId(inventoryLot.inventory_lot_id ?? inventoryLot.id);
        const inventoryProductId = productIdFrom(inventoryLot.product_id);
        const inventoryBranchId = relationId(inventoryLot.branch_id, ["branch_id", "id"]);
        if (!inventoryLotId || inventoryProductId !== numericProductId || inventoryBranchId !== numericBranchId) return;

        const metadata: InventoryMetadata = {
            inventoryLotId,
            mmLotId: mmLotId(inventoryLot.lot_id),
            batchNo: batchText(inventoryLot.batch_no),
            qaStatus: String(inventoryLot.qa_status ?? "").trim() || null,
            expiryDate: String(inventoryLot.expiry_date ?? "").trim() || null,
            manufacturingDate: String(inventoryLot.manufacturing_date ?? "").trim() || null
        };
        inventoryById.set(inventoryLotId, metadata);
        if (metadata.mmLotId) {
            const key = `${metadata.mmLotId}:${batchKey(metadata.batchNo)}`;
            const sameKeyLots = inventoryByMmLotBatch.get(key) || [];
            sameKeyLots.push(metadata);
            inventoryByMmLotBatch.set(key, sameKeyLots);
        }
    });

    const batchStatusMap = new Map<string, string>();
    const receiptByBatch = new Map<string, number>();
    const receiptMmLotByBatch = new Map<string, number>();
    const receiptByMmLotBatch = new Map<string, number>();
    const receiptExpiryByBatch = new Map<string, string>();
    const receiptManufacturingByBatch = new Map<string, string>();

    receipts.forEach((receipt: Record<string, unknown>) => {
        const receiptProductId = Number(relationId(receipt.product_id, ["product_id", "id"]) || receipt.product_id);
        if (receiptProductId !== numericProductId) return;
        const batchNo = batchText(receipt.batch_no || receipt.lot_no);
        const normalizedBatch = batchKey(batchNo);
        const key = `${receiptProductId}:${normalizedBatch}`;
        batchStatusMap.set(key, String(receipt.qa_status || "Passed"));

        const receiptId = relationId(receipt.purchase_order_product_id, ["purchase_order_product_id", "id"]);
        if (receiptId && !receiptByBatch.has(normalizedBatch)) receiptByBatch.set(normalizedBatch, receiptId);
        const receiptMmLotId = mmLotId(receipt.mm_lot_id ?? receipt.lot_id);
        if (receiptMmLotId !== null && !receiptMmLotByBatch.has(normalizedBatch)) receiptMmLotByBatch.set(normalizedBatch, receiptMmLotId);
        if (receiptId && receiptMmLotId !== null) {
            const receiptLotKey = `${receiptMmLotId}:${normalizedBatch}`;
            if (!receiptByMmLotBatch.has(receiptLotKey)) receiptByMmLotBatch.set(receiptLotKey, receiptId);
        }
        const expiryDate = String(receipt.expiry_date || "").trim();
        if (expiryDate && !receiptExpiryByBatch.has(normalizedBatch)) receiptExpiryByBatch.set(normalizedBatch, expiryDate);
        const manufacturingDate = String(receipt.manufacturing_date || receipt.created_at || "").trim();
        if (manufacturingDate && !receiptManufacturingByBatch.has(normalizedBatch)) receiptManufacturingByBatch.set(normalizedBatch, manufacturingDate);
    });

    yields.forEach((yieldRow: Record<string, unknown>) => {
        const yieldProductId = Number(relationId(yieldRow.job_order_id, ["product_id", "id"]) || numericProductId);
        if (yieldProductId !== numericProductId) return;
        const batchNo = batchText(yieldRow.lot_number);
        batchStatusMap.set(`${yieldProductId}:${batchKey(batchNo)}`, String(yieldRow.qa_status || "Pending"));
    });

    const movementBalances = new Map<string, {
        batchNo: string;
        mmLotId: number | null;
        inventoryLotId: number | null;
        quantity: number;
        expiryDate: string | null;
        manufacturingDate: string | null;
        qaStatus: string | null;
    }>();

    movements.forEach((movement: Record<string, unknown>) => {
        const movementProductId = Number(relationId(movement.product_id, ["product_id", "id"]) || movement.product_id || movement.productId);
        if (movementProductId !== numericProductId) return;

        const movementInventoryLotId = mmInventoryLotId(movement.inventory_lot_id ?? movement.inventoryLotId);
        const inventoryMetadata = movementInventoryLotId ? inventoryById.get(movementInventoryLotId) : undefined;
        const movementMmLotId = mmLotId(movement.mm_lot_id ?? movement.mmLotId ?? movement.lot_id ?? movement.lotId);
        const movementBatchNo = batchText(movement.batch_no || movement.batchNo);
        const matchingInventoryLots = movementMmLotId
            ? inventoryByMmLotBatch.get(`${movementMmLotId}:${batchKey(movementBatchNo)}`) || []
            : [];
        const uniqueInventoryMetadata = matchingInventoryLots.length === 1 ? matchingInventoryLots[0] : undefined;
        const canonicalInventory = inventoryMetadata || uniqueInventoryMetadata;
        const batchNo = canonicalInventory?.batchNo || movementBatchNo;
        const inventoryLotId = canonicalInventory?.inventoryLotId || movementInventoryLotId;
        const resolvedMmLotId = canonicalInventory?.mmLotId
            || movementMmLotId
            || receiptMmLotByBatch.get(batchKey(batchNo))
            || null;
        if (!resolvedMmLotId || !eligibleStorageLotIds.has(resolvedMmLotId)) return;
        if (movementInventoryLotId && !canonicalInventory) return;
        const key = `${resolvedMmLotId}:${inventoryLotId ?? "NO-INVENTORY-LOT"}:${batchKey(batchNo)}`;
        const existing = movementBalances.get(key);
        const quantity = Number(movement.quantity || 0);
        const expiryDate = canonicalInventory?.expiryDate
            || String(movement.expiry_date || movement.expiryDate || "").trim()
            || receiptExpiryByBatch.get(batchKey(batchNo))
            || null;
        const manufacturingDate = canonicalInventory?.manufacturingDate
            || String(movement.manufacturing_date || movement.manufacturingDate || movement.created_at || "").trim()
            || receiptManufacturingByBatch.get(batchKey(batchNo))
            || null;
        const qaStatus = canonicalInventory?.qaStatus || batchStatusMap.get(`${numericProductId}:${batchKey(batchNo)}`) || null;

        if (existing) {
            existing.quantity += quantity;
            existing.expiryDate = existing.expiryDate || expiryDate;
            existing.manufacturingDate = existing.manufacturingDate || manufacturingDate;
            existing.qaStatus = existing.qaStatus || qaStatus;
        } else {
            movementBalances.set(key, {
                batchNo,
                mmLotId: resolvedMmLotId,
                inventoryLotId,
                quantity,
                expiryDate,
                manufacturingDate,
                qaStatus
            });
        }
    });

    const exactReservations = new Map<string, number>();
    const inventoryReservations = new Map<string, number>();
    const mmLotBatchReservations = new Map<string, number>();
    const batchOnlyReservations = new Map<string, number>();

    reservations.forEach((reservation: Record<string, unknown>) => {
        const batchNo = batchText(reservation.batch_no);
        const normalizedBatch = batchKey(batchNo);
        const quantity = getUnissuedReservationQuantity(
            reservation.reserved_quantity,
            reservation.staged_quantity,
            reservation.issued_to_wip_quantity
        );
        if (quantity <= 0) return;

        const reservationMmLotId = mmLotId(reservation.mm_lot_id);
        const reservationInventoryLotId = mmInventoryLotId(reservation.inventory_lot_id);
        if (reservationInventoryLotId !== null) {
            const inventoryKey = `${reservationInventoryLotId}:${normalizedBatch}`;
            inventoryReservations.set(inventoryKey, (inventoryReservations.get(inventoryKey) || 0) + quantity);
            if (reservationMmLotId !== null) {
                const key = `${reservationMmLotId}:${reservationInventoryLotId}:${normalizedBatch}`;
                exactReservations.set(key, (exactReservations.get(key) || 0) + quantity);
            }
        } else if (reservationMmLotId !== null) {
            const key = `${reservationMmLotId}:${normalizedBatch}`;
            mmLotBatchReservations.set(key, (mmLotBatchReservations.get(key) || 0) + quantity);
        } else {
            batchOnlyReservations.set(normalizedBatch, (batchOnlyReservations.get(normalizedBatch) || 0) + quantity);
        }
    });

    const lotsByBatch = new Map<string, Array<{
        key: string;
        batchNo: string;
        mmLotId: number | null;
        inventoryLotId: number | null;
        quantity: number;
        expiryDate: string | null;
        manufacturingDate: string | null;
        qaStatus: string | null;
    }>>();

    movementBalances.forEach((balance, key) => {
        if (balance.quantity <= 0) return;
        if (!isReservableQaStatus(balance.qaStatus) || isExpired(balance.expiryDate)) return;

        const normalizedBatch = batchKey(balance.batchNo);
        if (!lotsByBatch.has(normalizedBatch)) lotsByBatch.set(normalizedBatch, []);
        lotsByBatch.get(normalizedBatch)!.push({ key, ...balance });
    });

    const availableLots: AvailableInventoryLot[] = [];
    lotsByBatch.forEach((batchLots, normalizedBatch) => {
        let batchOnlyReserved = batchOnlyReservations.get(normalizedBatch) || 0;

        batchLots.forEach((lot) => {
            const exactReserved = lot.inventoryLotId
                ? exactReservations.get(lot.key)
                    || inventoryReservations.get(`${lot.inventoryLotId}:${normalizedBatch}`)
                    || 0
                : mmLotBatchReservations.get(`${lot.mmLotId}:${normalizedBatch}`) || 0;
            const exactAvailable = Math.max(0, lot.quantity - exactReserved);
            const fallbackReserved = Math.min(batchOnlyReserved, exactAvailable);
            batchOnlyReserved -= fallbackReserved;
            const available = exactAvailable - fallbackReserved;
            if (available <= 0) return;

            availableLots.push({
                batchNo: lot.batchNo,
                storageLotName: lot.mmLotId ? storageLotNamesById.get(lot.mmLotId) || null : null,
                mmLotId: lot.mmLotId,
                inventoryLotId: lot.inventoryLotId,
                purchaseOrderReceivingId: lot.mmLotId
                    ? receiptByMmLotBatch.get(`${lot.mmLotId}:${normalizedBatch}`) || receiptByBatch.get(normalizedBatch) || null
                    : receiptByBatch.get(normalizedBatch) || null,
                available,
                physicalQuantity: lot.quantity,
                expiryDate: lot.expiryDate,
                manufacturingDate: lot.manufacturingDate,
                qaStatus: lot.qaStatus
            });
        });
    });

    // Sort lots by expiry date (FEFO) then manufacturing date
    availableLots.sort((left, right) => {
        const leftExpiry = left.expiryDate ? Date.parse(left.expiryDate) : Number.MAX_SAFE_INTEGER;
        const rightExpiry = right.expiryDate ? Date.parse(right.expiryDate) : Number.MAX_SAFE_INTEGER;
        const safeLeftExpiry = Number.isFinite(leftExpiry) ? leftExpiry : Number.MAX_SAFE_INTEGER;
        const safeRightExpiry = Number.isFinite(rightExpiry) ? rightExpiry : Number.MAX_SAFE_INTEGER;
        if (safeLeftExpiry !== safeRightExpiry) return safeLeftExpiry - safeRightExpiry;

        const leftManufacturing = left.manufacturingDate ? Date.parse(left.manufacturingDate) : Number.MAX_SAFE_INTEGER;
        const rightManufacturing = right.manufacturingDate ? Date.parse(right.manufacturingDate) : Number.MAX_SAFE_INTEGER;
        const safeLeftManufacturing = Number.isFinite(leftManufacturing) ? leftManufacturing : Number.MAX_SAFE_INTEGER;
        const safeRightManufacturing = Number.isFinite(rightManufacturing) ? rightManufacturing : Number.MAX_SAFE_INTEGER;
        if (safeLeftManufacturing !== safeRightManufacturing) return safeLeftManufacturing - safeRightManufacturing;

        return (left.inventoryLotId || left.mmLotId || Number.MAX_SAFE_INTEGER) - (right.inventoryLotId || right.mmLotId || Number.MAX_SAFE_INTEGER);
    });

    return availableLots;
}
