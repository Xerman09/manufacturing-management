import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { NextRequest } from "next/server";
import { PATCH } from "./[id]/details/route";
import { POST as submit } from "./[id]/submit/route";

const api = "http://localhost/api/manufacturing/physical-inventory-manufacturing/89";
const context = { params: Promise.resolve({ id: "89" }) };

function fixture(t: TestContext, { noDetails = false } = {}) {
    const sheet = { physical_inventory_id: 89, status: "DRAFT", stock_type: "REGULAR", isCommitted: 0, isCancelled: 0 };
    const detail = {
        physical_inventory_detail_id: 1,
        physical_inventory_id: 89,
        batch_no: "BATCH-01",
        inventory_condition: "GOOD",
        system_count: 10,
        physical_count: 8,
        remarks: null as string | null,
        product_id: 11,
        unit_cost: 1,
    };
    const detailUpdates: Array<Record<string, unknown>> = [];
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const { pathname } = new URL(String(input), "http://localhost");
        if (pathname.endsWith("/items/mm_physical_inventory/89")) {
            if (init?.method === "PATCH") Object.assign(sheet, JSON.parse(String(init.body)));
            return Response.json({ data: sheet });
        }
        if (pathname.endsWith("/items/mm_physical_inventory_details/1")) {
            if (init?.method === "PATCH") {
                const update = JSON.parse(String(init.body));
                detailUpdates.push(update);
                Object.assign(detail, update);
            }
            return Response.json({ data: detail });
        }
        if (pathname.endsWith("/items/mm_physical_inventory_details")) {
            return Response.json({ data: noDetails ? [] : [detail] });
        }
        throw new Error(`Unexpected fetch to ${pathname}`);
    });

    const update = (changes: Record<string, unknown>) => PATCH(new NextRequest(api + "/details", {
        method: "PATCH",
        body: JSON.stringify({ physical_inventory_detail_id: 1, ...changes }),
    }), context);
    const submitSheet = () => submit(new NextRequest(api + "/submit", { method: "POST" }), context);
    return { detail, sheet, detailUpdates, update, submitSheet };
}

test("saves count changes with blank remarks and submits a Regular audit with variance", async t => {
    const { detail, sheet, update, submitSheet } = fixture(t);
    for (const count of [7, 13, 10, 12]) {
        assert.equal((await update({ physical_count: count })).status, 200);
        assert.equal(detail.physical_count, count);
        assert.equal(detail.remarks, null);
    }
    assert.equal((await submitSheet()).status, 200);
    assert.equal(sheet.status, "PENDING_REVIEW");
});

test("saves count and remarks together and allows clearing remarks", async t => {
    const { detail, detailUpdates, update } = fixture(t);
    assert.equal((await update({ physical_count: 14, remarks: "  TEST  " })).status, 200);
    assert.equal(detail.physical_count, 14);
    assert.equal(detail.remarks, "TEST");

    assert.equal((await update({ physical_count: 15 })).status, 200);
    assert.equal(detail.remarks, "TEST");
    assert.equal("remarks" in detailUpdates.at(-1)!, false);

    assert.equal((await update({ remarks: "   " })).status, 200);
    assert.equal(detail.remarks, null);
    assert.equal(detail.physical_count, 15);
});

test("allows direct submission of an existing variance with blank remarks", async t => {
    const { sheet, submitSheet } = fixture(t);
    assert.equal((await submitSheet()).status, 200);
    assert.equal(sheet.status, "PENDING_REVIEW");
});

test("enforces the nonnegative count and nonempty submission requirements", async t => {
    const { sheet, detailUpdates, update, submitSheet } = fixture(t, { noDetails: true });
    const negative = await update({ physical_count: -1 });
    assert.equal(negative.status, 400);
    assert.match((await negative.json()).error, /cannot be negative/);
    assert.equal(detailUpdates.length, 0);
    const empty = await submitSheet();
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).error, /no detail rows/);
    assert.equal(sheet.status, "DRAFT");
});
