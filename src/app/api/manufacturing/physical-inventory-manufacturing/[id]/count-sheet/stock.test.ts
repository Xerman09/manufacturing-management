import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { MmInventoryMovement } from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import type { MmPhysicalInventorySheet } from "@/modules/manufacturing-management/physical-inventory-manufacturing/types";
import { buildManufacturingCountSheet } from "@/modules/manufacturing-management/physical-inventory-manufacturing/utils/manufacturing-count-sheet";
import { buildCountSheetStockRows, type CountSheetBatch, readCountSheetTimestamp } from "./_stock";

const registeredAt = "2026-09-08T05:31:32.000Z";
const cutoffDate = "2026-10-27T14:25:00";
const cutoff = readCountSheetTimestamp(cutoffDate);
assert.notEqual(cutoff, null);

const drum = { unit_id: 12, unit_shortcut: "DRUM", unit_name: "Drum" };
const liter = { unit_id: 13, unit_shortcut: "L", unit_name: "Liters" };
const lot = { lot_id: 102, lot_name: "OIL STORAGE", branch_id: 198, status: "ACTIVE", created_at: registeredAt, unit_id: drum };
const secondLot = { ...lot, lot_id: 180, lot_name: "PROCESS STORAGE", unit_id: liter };
const batch: CountSheetBatch = {
    inventory_lot_id: 21,
    branch_id: 198,
    lot_id: lot,
    product_id: { product_id: 44, product_name: "Palm Oil", product_code: "RM-OIL", product_type: 389 },
    batch_no: "BATCH 1",
    status: "ACTIVE",
    created_at: registeredAt,
};
const sameLabel: CountSheetBatch = { ...batch, lot_id: secondLot, inventory_lot_id: 22 };
const sheet: MmPhysicalInventorySheet = {
    physical_inventory_id: 84,
    pi_no: "MM-PI-2026-041762",
    branch_id: { id: 198, branch_name: "Main Branch" },
    product_type_id: { id: 389, name: "Raw Materials" },
    starting_date: "2026-10-26T23:43:00",
    cutoff_date: cutoffDate,
    stock_type: "REGULAR",
    status: "DRAFT",
    isCommitted: false,
    isCancelled: false,
    total_system_quantity: 0,
    total_physical_quantity: 2,
    total_variance: 2,
    total_difference_cost: 0,
    details: [{
        physical_inventory_detail_id: 1,
        physical_inventory_id: 84,
        inventory_lot_id: 755,
        lot_id: { lot_id: 166, lot_name: "1-UOM-1", branch_id: 198, unit_id: 1, max_batch_capacity: 10 },
        product_id: { product_id: 25889, product_name: "APPLEEE", product_code: "APPS" },
        unit_id: { unit_id: 1, unit_name: "Pieces", unit_shortcut: "PCS" },
        batch_no: "TEST654",
        inventory_condition: " good ",
        system_count: 0,
        physical_count: 2,
        unit_cost: 0,
    }],
};
const scope = { branchId: 198, productTypeId: 389, savedDetails: sheet.details ?? [], cutoff: cutoff! };

function movement(overrides: Partial<MmInventoryMovement> = {}): MmInventoryMovement {
    return {
        branchId: 198,
        mmLotId: 102,
        inventoryLotId: 21,
        productId: 44,
        productTypeId: 389,
        unitId: 12,
        batchNo: "BATCH 1",
        transactionDate: "2026-10-01T13:20:00",
        postedAt: "2026-10-01T13:21:00",
        inventoryCondition: "GOOD",
        quantityIn: 100.000001,
        quantityOut: 0,
        ...overrides,
    };
}

const rejectedReceipt = movement({
    inventoryLotId: 688,
    mmLotId: 188,
    productId: 25755,
    unitId: 20,
    batchNo: "E2E-BATCH-REJECT-20260915",
    inventoryCondition: "BAD",
    quantityIn: 2,
});
const rejectedLot = { lot_id: 188, branch_id: 197 };
const rejectedBatch = { inventory_lot_id: 688, lot_id: 188, product_id: 25755, branch_id: 197 };

function mockReferencedRegistrations(
    t: TestContext,
    {
        lots = [rejectedLot],
        batches = [rejectedBatch],
        lotStatus = 200,
    } = {},
) {
    return t.mock.method(globalThis, "fetch", async (input: string, options?: RequestInit) => {
        const url = new URL(input, "http://localhost");
        assert.equal(options?.method ?? "GET", "GET");
        if (url.pathname.endsWith("/items/mm_lots")) {
            assert.equal(url.searchParams.get("filter[lot_id][_in]"), "188");
            return Response.json({ data: lots }, { status: lotStatus });
        }
        assert.ok(url.pathname.endsWith("/items/mm_inventory_lots"));
        assert.equal(url.searchParams.get("filter[inventory_lot_id][_in]"), "688");
        return Response.json({ data: batches });
    });
}

test("excludes a verified other-branch balance while including registered BAD stock in the audited branch", async t => {
    const read = mockReferencedRegistrations(t);
    const stock = await buildCountSheetStockRows(scope, [batch], [
        rejectedReceipt,
        { ...rejectedReceipt, quantityIn: 0, quantityOut: 1 },
        movement({ inventoryCondition: "BAD", quantityIn: 4 }),
    ]);

    assert.equal(stock.excludedOtherBranchBalanceCount, 1);
    assert.deepEqual(stock.additionalRows.map(row => [row.inventoryLotId, row.condition, row.systemCount]), [[21, "BAD", 4]]);
    assert.equal(read.mock.callCount(), 2);
});

test("keeps unresolved in-scope and conflicting registrations as errors", async t => {
    const cases = [
        { name: "registered lot in the audited branch", lots: [{ ...rejectedLot, branch_id: scope.branchId }] },
        { name: "missing registered lot", lots: [] },
        { name: "registered batch points to another lot", batches: [{ ...rejectedBatch, lot_id: 789 }] },
        { name: "registered batch uses another product", batches: [{ ...rejectedBatch, product_id: 44 }] },
    ];
    for (const { name, ...registrations } of cases) {
        await t.test(name, async context => {
            mockReferencedRegistrations(context, registrations);
            await assert.rejects(buildCountSheetStockRows(scope, [batch], [rejectedReceipt]), {
                status: 409,
                message: /E2E-BATCH-REJECT-20260915 could not be matched/,
            });
        });
    }
});

test("fails the count-sheet request when the registry lookup is unavailable", async t => {
    mockReferencedRegistrations(t, { lotStatus: 503 });
    await assert.rejects(buildCountSheetStockRows(scope, [batch], [rejectedReceipt]), {
        status: 502,
        message: /Registered lots and batches could not be loaded/,
    });
});

test("sums stock carried forward and uses the exact effective and posting cutoff", async () => {
    const { additionalRows: rows, excludedOtherBranchBalanceCount } = await buildCountSheetStockRows(scope, [batch], [
        movement({ stockType: "OPENING" }),
        movement({ quantityIn: 0, quantityOut: 30.000002 }),
        movement({ quantityIn: 0.335628, transactionDate: "2026-10-27T06:25:00Z", postedAt: cutoffDate }),
        movement({ quantityIn: 500, transactionDate: "2026-10-27T14:25:00.000000001" }),
        movement({ quantityIn: 600, postedAt: "2026-10-27T06:25:00.001Z" }),
    ]);
    assert.deepEqual(rows.map(row => [row.systemCount, row.uom]), [[70.335627, "DRUM"]]);
    assert.equal(excludedOtherBranchBalanceCount, 0);
    assert.equal(readCountSheetTimestamp("2026-10-27"), readCountSheetTimestamp("2026-10-26T16:00:00Z"));
    assert.equal(readCountSheetTimestamp("invalid"), null);
});

test("uses registered branch, product type, batch date, status, and positive balance", async () => {
    const inactiveBatch: CountSheetBatch = { ...batch, inventory_lot_id: 31, status: "CLOSED" };
    const inactiveLot: CountSheetBatch = { ...batch, inventory_lot_id: 32, lot_id: { ...lot, lot_id: 201, status: "INACTIVE" } };
    const laterBatch: CountSheetBatch = { ...batch, inventory_lot_id: 33, created_at: "2026-11-11T05:52:24Z" };
    const otherType: CountSheetBatch = { ...batch, inventory_lot_id: 34, product_id: { ...batch.product_id!, product_type: 999 } };
    const netZero: CountSheetBatch = { ...batch, inventory_lot_id: 35 };
    const netNegative: CountSheetBatch = { ...batch, inventory_lot_id: 36 };
    const masters = [batch, inactiveBatch, inactiveLot, laterBatch, otherType, netZero, netNegative];
    const movements = [
        movement(),
        movement({ branchId: 183 }),
        movement({ inventoryLotId: 31 }),
        movement({ inventoryLotId: 32, mmLotId: 201 }),
        movement({ inventoryLotId: 33 }),
        movement({ inventoryLotId: 34 }),
        movement({ inventoryLotId: 35, quantityOut: 100.000001 }),
        movement({ inventoryLotId: 36, quantityOut: 200 }),
        movement({ inventoryLotId: null, mmLotId: null }),
    ];
    assert.deepEqual((await buildCountSheetStockRows(scope, masters, movements)).additionalRows.map(row => row.inventoryLotId), [21]);
    assert.deepEqual(
        (await buildCountSheetStockRows({ ...scope, productTypeId: 0 }, masters, movements)).additionalRows.map(row => row.inventoryLotId),
        [21, 34],
    );
});

test("preserves saved rows, resolves a unique legacy batch, and separates lot, UOM, and condition", async () => {
    const savedBatch = { ...batch, inventory_lot_id: 755, lot_id: { ...lot, lot_id: 166 }, batch_no: "TEST654" };
    const { additionalRows } = await buildCountSheetStockRows(scope, [batch, sameLabel, savedBatch], [
        movement({ inventoryLotId: 755, mmLotId: 166, batchNo: "TEST654" }),
        movement({ inventoryLotId: null, quantityIn: 5 }),
        movement({ inventoryCondition: "damaged", quantityIn: 3 }),
        movement({ inventoryLotId: 22, mmLotId: 180, unitId: 13, quantityIn: 9 }),
    ]);
    assert.deepEqual(additionalRows.map(row => [row.inventoryLotId, row.uom, row.condition, row.systemCount]), [
        [21, "DRUM", "DAMAGED", 3], [21, "DRUM", "GOOD", 5], [22, "L", "GOOD", 9],
    ]);

    const options = { additionalRows, stockCutoff: "2026-10-27 14:25:00", showPhysicalCount: true };
    const printed = buildManufacturingCountSheet(sheet, options);
    assert.deepEqual(printed.rows.map(row => [row[1], row[4], row[5]]), [
        ["TEST654", "0", "2"], ["BATCH 1\nDAMAGED", "3", ""], ["BATCH 1", "5", ""], ["BATCH 1", "9", ""],
    ]);
    assert.equal(printed.metadata.at(-1)?.value, "2026-10-27 14:25:00 PHT");
    assert.deepEqual(buildManufacturingCountSheet(sheet, { ...options, targetLot: 180 }).rows.map(row => row[3]), ["L"]);
    assert.equal(buildManufacturingCountSheet(sheet, { ...options, targetLot: "oil storage" }).rows.length, 2);
    assert.ok(buildManufacturingCountSheet(sheet, { ...options, showPhysicalCount: false }).rows.every(row => row[5] === ""));
    assert.equal(sheet.details?.length, 1);
});

test("reports unresolved positive stock and accepts a genuine empty scope", async () => {
    await assert.rejects(buildCountSheetStockRows(scope, [], [movement({ inventoryLotId: null })]), /could not be matched/);
    await assert.rejects(buildCountSheetStockRows(scope, [batch], [movement({ unitId: 99 })]), /UOM/);
    await assert.rejects(buildCountSheetStockRows(scope, [batch], [movement({ postedAt: "invalid" })]), /invalid date/);
    assert.deepEqual(await buildCountSheetStockRows(scope, [], [
        movement(), movement({ quantityIn: 0, quantityOut: 100.000001 }),
    ]), { additionalRows: [], excludedOtherBranchBalanceCount: 0 });
    assert.deepEqual(await buildCountSheetStockRows(scope, [], []), { additionalRows: [], excludedOtherBranchBalanceCount: 0 });
});
