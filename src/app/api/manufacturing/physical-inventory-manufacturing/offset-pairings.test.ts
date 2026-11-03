import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./[id]/route";
import { POST as commit } from "./[id]/commit/route";
import { saveOffsettingPairings } from "@/modules/manufacturing-management/physical-inventory-offsetting/services/offsetting-api";
import { readOffsetPairings } from "@/modules/manufacturing-management/physical-inventory-offsetting/utils/offset-pairings";

const originalFetch = globalThis.fetch;
const details = [
    { id: 1, inventory_lot_id: 301, unit_id: 1, batch_no: "B1", product_id: { product_id: 11, unit_of_measurement_count: 1 }, lot_id: 101, system_count: 10, physical_count: 5, unit_cost: 10 },
    { id: 2, inventory_lot_id: 302, unit_id: 1, batch_no: "B2", product_id: { product_id: 11, unit_of_measurement_count: 1 }, lot_id: 102, system_count: 5, physical_count: 10, unit_cost: 10 },
];
let sheet = { physical_inventory_id: 901, branch_id: 1, stock_type: "OPENING", status: "PENDING_REVIEW", isCommitted: 0, isCancelled: 0, remarks: "Audit note" as string | null };
const pair = { id: "test-pair", shortage_detail_id: 1, shortage_product_id: 11, shortage_product_name: "Test", shortage_lot_id: 101, surplus_detail_id: 2, surplus_product_id: 11, surplus_product_name: "Test", surplus_lot_id: 102, offset_qty: 3, offset_pieces: 3, shortage_uom_count: 1, surplus_uom_count: 1, shortage_unit_cost: 10, surplus_unit_cost: 10, unit_cost_variance: 0, net_financial_impact: 0, reason_code: "UOM Miscount", notes: "Checked" };
const context = { params: Promise.resolve({ id: "901" }) };
const request = (pairings: unknown) => new NextRequest("http://localhost/api/manufacturing/physical-inventory-manufacturing/901", { method: "PATCH", body: JSON.stringify({ offset_pairings: pairings }) });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
let mode = "ok";
let writes = 0;
globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("/items/mm_lots/")) return json({ data: { unit_id: 1 } });
    if (url.includes("/items/mm_inventory_lots/")) {
        const first = url.includes("/301?");
        return json({ data: { status: "ACTIVE", branch_id: 1, lot_id: first ? 101 : 102, product_id: 11, batch_no: first ? "B1" : "B2" } });
    }
    if (url.includes("/mm_physical_inventory_details?")) return json({ data: details });
    if (url.includes("/mm_physical_inventory/901")) {
        if (init?.method === "PATCH") {
            writes++;
            if (mode === "write-error") return json({ error: "Write permission denied" }, 403);
            sheet = { ...sheet, ...JSON.parse(String(init.body)) };
            return json({ data: sheet });
        }
        if (url.includes("fields=*") && mode === "readback-error") return json({ error: "Unavailable" }, 500);
        if (url.includes("fields=*") && mode === "mismatch") return json({ data: { ...sheet, remarks: "Audit note" } });
        return json({ data: sheet });
    }
    throw new Error(`Unexpected test request: ${url}`);
}) as typeof fetch;

void (async () => {
    try {
        assert.equal((await PATCH(request([pair]), context)).status, 200);
        assert.equal(readOffsetPairings(sheet.remarks)[0].offset_pieces, 3);
        const reopened = await GET(new NextRequest("http://localhost/901"), context);
        assert.equal((await reopened.json()).data.offset_pairings[0].notes, "Checked");
        assert.equal((await PATCH(request([{ ...pair, offset_qty: 4, offset_pieces: 4, notes: "Revised" }]), context)).status, 200);
        assert.equal(readOffsetPairings(sheet.remarks)[0].notes, "Revised");
        assert.equal((await PATCH(request([]), context)).status, 200);
        assert.equal(sheet.remarks, "Audit note");
        const writesBeforeInvalid = writes;
        assert.equal((await PATCH(request([{ ...pair, offset_pieces: 6 }]), context)).status, 422);
        assert.equal(writes, writesBeforeInvalid);
        for (const status of ["COMMITTED", "POSTED", "CANCELLED"]) {
            sheet.status = status;
            assert.equal((await PATCH(request([pair]), context)).status, 409);
        }
        sheet.status = "PENDING_REVIEW";
        for (mode of ["write-error", "readback-error", "mismatch"]) assert.ok((await PATCH(request([pair]), context)).status >= 500);
        mode = "ok";
        assert.equal((await PATCH(request([pair]), context)).status, 200);
        assert.equal((await commit(new NextRequest("http://localhost/901/commit", { method: "POST", body: JSON.stringify({ remarks: "Auditor sign-off" }) }), context)).status, 200);
        assert.equal(sheet.status, "COMMITTED");
        assert.equal(readOffsetPairings(sheet.remarks)[0].id, pair.id);
        assert.ok(sheet.remarks?.startsWith("Auditor sign-off\n__OFFSET_DATA__:"));
        sheet.status = "PENDING_REVIEW";
        sheet.isCommitted = 0;
        sheet.remarks = "Audit note\n__OFFSET_DATA__:{broken";
        assert.equal((await GET(new NextRequest("http://localhost/901"), context)).status, 422);
        assert.equal((await PATCH(request([]), context)).status, 422);
        const writesBeforeCommit = writes;
        assert.equal((await commit(new NextRequest("http://localhost/901/commit", { method: "POST", body: "{}" }), context)).status, 422);
        assert.equal(writes, writesBeforeCommit);

        for (const response of [json({ error: "Save rejected" }, 500), json({ success: false, error: "Not saved" }), json({ success: true, data: {} })]) {
            globalThis.fetch = (async () => response) as typeof fetch;
            await assert.rejects(() => saveOffsettingPairings(901, [pair]));
        }
        globalThis.fetch = (async () => { throw new Error("Network unavailable"); }) as typeof fetch;
        await assert.rejects(() => saveOffsettingPairings(901, [pair]), /Network/);
        console.log("Offset pairing API save/readback, rejection, corruption, and finalized-state checks passed.");
    } finally {
        globalThis.fetch = originalFetch;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
