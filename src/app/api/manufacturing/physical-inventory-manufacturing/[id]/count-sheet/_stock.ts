import { DIRECTUS_URL, formatPhtDateTime, headers } from "@/app/api/manufacturing/directus-api";
import { fetchMmInventoryMovements, type MmInventoryMovement } from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import type { CountSheetStockRow, MmLot, MmPhysicalInventoryDetail, MmPhysicalInventorySheet, PhysicalInventoryCountSheetData, Product, Unit } from "@/modules/manufacturing-management/physical-inventory-manufacturing/types";
import { normalizeProductTypeId } from "@/modules/manufacturing-management/physical-inventory-manufacturing/utils/product-scope";
import { extractId, roundQty } from "../../helper";

type StockLot = Pick<MmLot, "lot_id" | "lot_name" | "branch_id"> & {
    unit_id: Unit | null;
    status: string | null;
    created_at: string | null;
};

export interface CountSheetBatch {
    inventory_lot_id: number;
    branch_id: number;
    lot_id: StockLot | null;
    product_id: Pick<Product, "product_id" | "product_name" | "product_code" | "product_type"> | null;
    batch_no: string;
    status: string | null;
    created_at: string | null;
}

interface StockScope {
    branchId: number;
    productTypeId: number;
    cutoff: bigint;
    savedDetails: readonly MmPhysicalInventoryDetail[];
}

interface UnmatchedStockBalance {
    inventoryLotId: number;
    lotId: number;
    productId: number;
    batchLabel: string;
}

export class CountSheetStockError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

export function readCountSheetTimestamp(value?: string | null): bigint | null {
    const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(value?.trim() ?? "");
    if (!match) return null;
    // The audit form and Spring movement view use Manila wall time for offset-free timestamps.
    const [, day, time = "00:00", second = "00", fraction = "", zone = "+08:00"] = match;
    const secondMillis = Date.parse(`${day}T${time}:${second}${zone}`);
    if (!Number.isFinite(secondMillis)) return null;
    return BigInt(secondMillis) * NANOSECONDS_PER_MILLISECOND + BigInt(fraction.padEnd(9, "0"));
}

function conditionName(value?: string | null): string {
    return value?.trim().toUpperCase() || "GOOD";
}

function locationKey(lotId?: number | null, productId?: number | null, batchNo?: string | null): string | null {
    const label = batchNo?.trim().toUpperCase();
    return lotId && productId && label ? JSON.stringify([lotId, productId, label]) : null;
}

function isActive(status: string | null): boolean {
    return status?.trim().toUpperCase() === "ACTIVE";
}

function unmatchedStockError(batchLabel: string): CountSheetStockError {
    return new CountSheetStockError(
        `Stock for batch ${batchLabel || "with an unknown number"} could not be matched to a registered lot, product, and UOM at the cutoff. Verify the batch in Lot Management before printing.`,
        409,
    );
}

export async function buildCountSheetStockRows(
    scope: StockScope,
    batches: readonly CountSheetBatch[],
    movements: readonly MmInventoryMovement[],
) {
    const { branchId, productTypeId, cutoff, savedDetails } = scope;
    const batchesById = new Map<number, CountSheetBatch>();
    const batchesByLocation = new Map<string, CountSheetBatch | null>();
    const lotsById = new Map<number, StockLot>();
    for (const batch of batches) {
        if (batch.branch_id !== branchId) continue;
        batchesById.set(batch.inventory_lot_id, batch);
        if (batch.lot_id) lotsById.set(batch.lot_id.lot_id, batch.lot_id);
        const key = locationKey(batch.lot_id?.lot_id, batch.product_id?.product_id, batch.batch_no);
        // An old movement with no inventory lot ID can use a unique registered batch at that location.
        if (key) batchesByLocation.set(key, batchesByLocation.has(key) ? null : batch);
    }

    const savedKeys = new Set(savedDetails.map(detail =>
        `${extractId(detail.inventory_lot_id, "inventory_lot_id")}:${conditionName(detail.inventory_condition)}`
    ));
    const balances = new Map<string, {
        batch: CountSheetBatch | null;
        batchLabel: string;
        movement: MmInventoryMovement;
        unitId: number | null;
        condition: string;
        quantity: number;
    }>();

    for (const movement of movements) {
        const quantity = (movement.quantityIn ?? 0) - (movement.quantityOut ?? 0);
        if (movement.branchId !== branchId || quantity === 0 || (!movement.inventoryLotId && !movement.mmLotId)) continue;
        const batchById = batchesById.get(movement.inventoryLotId ?? 0);
        const location = locationKey(movement.mmLotId, movement.productId, movement.batchNo);
        const idMatchesLocation = batchById
            && (!movement.mmLotId || movement.mmLotId === batchById.lot_id?.lot_id)
            && (!movement.productId || movement.productId === batchById.product_id?.product_id);
        const batch = idMatchesLocation
            ? batchById
            : (location && batchesByLocation.get(location)) || null;

        const type = batch?.product_id ? normalizeProductTypeId(batch.product_id.product_type) : movement.productTypeId;
        if (productTypeId && type != null && type !== productTypeId) continue;
        const lot = batch?.lot_id ?? lotsById.get(movement.mmLotId ?? 0);
        if ((batch && !isActive(batch.status)) || (lot && !isActive(lot.status))) continue;

        const condition = conditionName(movement.inventoryCondition);
        if (batch && savedKeys.has(`${batch.inventory_lot_id}:${condition}`)) continue;
        const registered = readCountSheetTimestamp(batch?.created_at);
        const lotRegistered = readCountSheetTimestamp(lot?.created_at);
        if ((registered !== null && registered > cutoff) || (lotRegistered !== null && lotRegistered > cutoff)) continue;

        const effective = readCountSheetTimestamp(movement.transactionDate);
        const posted = movement.postedAt ? readCountSheetTimestamp(movement.postedAt) : effective;
        if ((effective !== null && effective > cutoff) || (posted !== null && posted > cutoff)) continue;
        if (effective === null || posted === null) {
            throw new CountSheetStockError("An inventory movement has an invalid date. Verify its posting time before printing this count sheet.", 409);
        }

        const batchLabel = movement.batchNo?.trim() || batch?.batch_no || String(movement.inventoryLotId ?? "");
        const unitId = movement.unitId ?? batch?.lot_id?.unit_id?.unit_id ?? null;
        const identity = batch
            ? batch.inventory_lot_id
            : [movement.inventoryLotId ?? null, movement.mmLotId ?? null, movement.productId ?? null, batchLabel.toUpperCase()];
        const key = JSON.stringify([identity, condition, unitId]);
        const balance = balances.get(key);
        if (balance) {
            balance.quantity += quantity;
        } else {
            balances.set(key, { batch, batchLabel, movement, unitId, condition, quantity });
        }
    }

    const rows: CountSheetStockRow[] = [];
    const unmatched: UnmatchedStockBalance[] = [];
    for (const balance of balances.values()) {
        const systemCount = roundQty(balance.quantity);
        if (systemCount <= 0) continue;

        const { batch, batchLabel, movement, unitId, condition } = balance;
        if (!batch) {
            const { inventoryLotId, mmLotId, productId } = movement;
            if (!inventoryLotId || !mmLotId || !productId) throw unmatchedStockError(batchLabel);
            unmatched.push({ inventoryLotId, lotId: mmLotId, productId, batchLabel });
            continue;
        }

        const lot = batch.lot_id;
        const product = batch.product_id;
        const uom = lot?.unit_id?.unit_shortcut || lot?.unit_id?.unit_name;
        if (!lot || !product || extractId(lot.branch_id) !== branchId || !batch.batch_no
            || !uom || unitId !== lot.unit_id?.unit_id || readCountSheetTimestamp(batch.created_at) === null) {
            throw unmatchedStockError(batchLabel);
        }

        rows.push({
            inventoryLotId: batch.inventory_lot_id,
            lotId: lot.lot_id,
            lotName: lot.lot_name,
            batchNo: batch.batch_no,
            productName: product.product_name,
            productCode: product.product_code,
            uom,
            condition,
            systemCount,
        });
    }

    rows.sort((first, second) =>
        first.lotName.localeCompare(second.lotName)
        || first.batchNo.localeCompare(second.batchNo)
        || first.productCode.localeCompare(second.productCode)
        || first.condition.localeCompare(second.condition)
    );

    await verifyOtherBranchBalances(branchId, unmatched);
    return { additionalRows: rows, excludedOtherBranchBalanceCount: unmatched.length };
}

type RegistryCollection = "mm_lots" | "mm_inventory_lots";

async function fetchStockRegistryRows<Row>(collection: RegistryCollection, query: URLSearchParams): Promise<Row[]> {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${query}`, { headers, cache: "no-store" }).catch(() => null);
    const rows = response?.ok ? (await response.json().catch(() => null))?.data : null;
    if (!Array.isArray(rows)) {
        throw new CountSheetStockError("Registered lots and batches could not be loaded for this count sheet. Try again.", 502);
    }
    return rows;
}

async function fetchRegistryRowsById<Row>(
    collection: RegistryCollection, idField: "lot_id" | "inventory_lot_id", ids: number[], fields: string,
): Promise<Row[]> {
    const uniqueIds = [...new Set(ids)];
    const reads: Promise<Row[]>[] = [];
    const batchSize = 100;
    for (let start = 0; start < uniqueIds.length; start += batchSize) {
        const query = new URLSearchParams({
            [`filter[${idField}][_in]`]: uniqueIds.slice(start, start + batchSize).join(","),
            fields,
            limit: "-1",
        });
        reads.push(fetchStockRegistryRows<Row>(collection, query));
    }
    return (await Promise.all(reads)).flat();
}

async function verifyOtherBranchBalances(branchId: number, unmatched: UnmatchedStockBalance[]) {
    if (unmatched.length === 0) return;

    const [lots, batches] = await Promise.all([
        fetchRegistryRowsById<{ lot_id: number; branch_id: number }>(
            "mm_lots", "lot_id", unmatched.map(balance => balance.lotId), "lot_id,branch_id",
        ),
        fetchRegistryRowsById<{ inventory_lot_id: number; lot_id: number; product_id: number; branch_id: number }>(
            "mm_inventory_lots", "inventory_lot_id", unmatched.map(balance => balance.inventoryLotId),
            "inventory_lot_id,lot_id,product_id,branch_id",
        ),
    ]);
    const lotBranches = new Map(lots.map(lot => [lot.lot_id, lot.branch_id]));
    const registeredBatches = new Map(batches.map(batch => [batch.inventory_lot_id, batch]));

    for (const balance of unmatched) {
        const batch = registeredBatches.get(balance.inventoryLotId);
        const lotBranch = lotBranches.get(balance.lotId) ?? 0;
        if (!Number.isSafeInteger(lotBranch) || lotBranch <= 0 || lotBranch === branchId || !batch || batch.branch_id !== lotBranch
            || batch.lot_id !== balance.lotId || batch.product_id !== balance.productId) {
            throw unmatchedStockError(balance.batchLabel);
        }
    }
}

async function fetchBranchBatches(branchId: number): Promise<CountSheetBatch[]> {
    const fields = [
        "inventory_lot_id", "branch_id", "batch_no", "status", "created_at",
        "lot_id.lot_id", "lot_id.lot_name", "lot_id.branch_id", "lot_id.status", "lot_id.created_at",
        "lot_id.unit_id.unit_id", "lot_id.unit_id.unit_shortcut", "lot_id.unit_id.unit_name",
        "product_id.product_id", "product_id.product_name", "product_id.product_code", "product_id.product_type",
    ];
    const query = new URLSearchParams({ "filter[branch_id][_eq]": String(branchId), fields: fields.join(","), limit: "-1" });
    return fetchStockRegistryRows<CountSheetBatch>("mm_inventory_lots", query);
}

export async function loadCountSheetStock(sheet: MmPhysicalInventorySheet): Promise<Omit<PhysicalInventoryCountSheetData, "sheet">> {
    const branchId = extractId(sheet.branch_id);
    const cutoff = readCountSheetTimestamp(sheet.cutoff_date);
    if (!Number.isSafeInteger(branchId) || branchId <= 0 || cutoff === null) {
        throw new CountSheetStockError("Save a valid branch and cutoff before printing this count sheet.", 422);
    }

    const stockCutoff = formatPhtDateTime(new Date(Number(cutoff / NANOSECONDS_PER_MILLISECOND)));
    const [batches, movements] = await Promise.all([
        fetchBranchBatches(branchId),
        fetchMmInventoryMovements({ branch: branchId, transactionDateTo: stockCutoff.slice(0, 10) }),
    ]);

    const stock = await buildCountSheetStockRows({
        branchId,
        productTypeId: normalizeProductTypeId(sheet.product_type_id),
        savedDetails: sheet.details ?? [],
        cutoff,
    }, batches, movements);
    return { ...stock, stockCutoff };
}
