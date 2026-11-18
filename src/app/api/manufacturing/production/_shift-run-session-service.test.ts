import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { PrecisionRow } from "./_session-quantity-precision";

const precision = await import(new URL("./_session-quantity-precision.ts", import.meta.url).href);
const statuses = await import(new URL("../../../../modules/manufacturing-management/job-order-status.ts", import.meta.url).href);
const output = await import(new URL("../../../../modules/manufacturing-management/production-workflow/utils/production-output.ts", import.meta.url).href);
type Store = Record<string, PrecisionRow[]>;
const keys: Record<string, string> = {
    manufacturing_job_orders: "job_order_id", manufacturing_job_order_materials: "jo_material_id",
    manufacturing_job_order_materials_reservations: "jo_materials_reservation_id", manufacturing_job_order_yield_ledger: "ledger_id",
    manufacturing_job_order_yield_ledger_bom_consumage: "consumage_id", jo_material_genealogy: "genealogy_id", product_manufacturing_version: "version_id"
};

function harness(options: { fresh?: boolean; reason?: unknown; rejected?: number; inactiveReason?: boolean; reasonUnavailable?: boolean; scale?: number; roundedCollection?: string; interrupt?: (table: string, method: string, body: PrecisionRow) => boolean } = {}) {
    const session = "precision-fixture";
    const lines = [1263.260241, 2826.907695].map((actualQty, index) => ({ joMaterialId: 1011, reservationId: 756 + index, productId: 10, mmLotId: 20, inventoryLotId: 30 + index, uomId: 1, batchNo: `batch-${index}`, actualQty }));
    const payload = { sessionScope: "JOB_ORDER", sessionKey: session, joId: 434, shiftName: "Day 1", productionDate: "2026-11-12", yieldQty: 4000, rejectedQty: 10, scrapQty: 0, materialsConsumed: lines };
    const store: Store = {
        manufacturing_job_orders: [{ job_order_id: 434, status: "In Production", branch_id: 1, product_id: 99, version_id: 1, target_quantity: 14185.1112, completed_quantity: 0, rejected_quantity: 0 }],
        product_manufacturing_version: [{ version_id: 1, product_id: 99, status: "approved", material_consumption_variance_tolerance_pct: 10 }],
        manufacturing_job_order_materials: [{ jo_material_id: 1011, job_order_id: 434, product_id: 10, uom_id: 1, allocated_quantity: 14468.7, actual_consumed_quantity: 0, reserved_quantity: 14468.7 }],
        manufacturing_job_order_materials_reservations: lines.map((line, index) => ({
            jo_materials_reservation_id: line.reservationId, jo_material_id: 1011, branch_id: 1, product_id: 10,
            mm_lot_id: 20, inventory_lot_id: line.inventoryLotId, uom_id: 1, batch_no: line.batchNo, reservation_status: "WIP",
            issued_to_wip_quantity: index === 0 ? 4468.7 : 10000, actual_used_quantity: 0, returned_quantity: 0, remaining_wip_quantity: index === 0 ? 4468.7 : 10000
        })),
        manufacturing_job_order_yield_ledger: [{ ledger_id: 219, job_order_id: 434, jo_route_id: null, session_key: session, shift_name: "Day 1", production_date: "2026-11-12", yield_quantity: 4000, rejected_quantity: 10, scrap_quantity: 0, commit_status: "PENDING", job_order_updated: false, daily_qa_image_id: "saved-evidence", session_payload: payload, recovery_error: { code: "OLD_ERROR" } }],
        manufacturing_job_order_yield_ledger_bom_consumage: [], jo_material_genealogy: []
    };
    store.manufacturing_job_order_routes = [{jo_route_id:1,job_order_id:434}];
    store.manufacturing_job_order_route_operators = [{jo_route_id:1,started_at:"2026-11-12T08:00:00",stopped_at:"2026-11-12T09:00:00"}];
    store.qa_rejection_reasons = [{id: 7, is_active: options.inactiveReason ? 0 : 1}];
    if (options.fresh) store.manufacturing_job_order_yield_ledger = [];
    const writes: { table: string; method: string; body: PrecisionRow }[] = [];
    let interrupted = false;
    async function fetchFixture(url: string, init: RequestInit = {}) {
        const parsed = new URL(url);
        const [, , table, item] = parsed.pathname.split("/");
        if (table === "qa_rejection_reasons" && options.reasonUnavailable) throw new Error("Reason lookup unavailable");
        assert.ok(store[table], `Unexpected network request: ${url}`);
        const method = init.method || "GET";
        const body = init.body ? JSON.parse(String(init.body)) as PrecisionRow : {};
        if (!interrupted && options.interrupt?.(table, method, body)) { interrupted = true; throw new Error("Injected connection loss"); }
        let data: PrecisionRow | PrecisionRow[] | undefined;
        if (method === "GET") {
            if (item) data = store[table].find(row => String(row[keys[table]]) === item);
            else data = store[table].filter(row => [...parsed.searchParams].every(([field, value]) => {
                const match = /^filter\[(\w+)\]\[(_eq|_in)\]$/.exec(field);
                if (!match) return true;
                return match[2] === "_eq" ? String(row[match[1]]) === value : value.split(",").includes(String(row[match[1]]));
            }));
        } else {
            writes.push({ table, method, body: structuredClone(body) });
            for (const field of ["quantity_consumed", "consumed_quantity", "actual_consumed_quantity", "reserved_quantity", "actual_used_quantity"]) {
                if (body[field] !== undefined && table === options.roundedCollection) body[field] = Number(Number(body[field]).toFixed(options.scale ?? 4));
            }
            if (method === "POST") {
                data = { ...body, [keys[table]]: store[table].length + 1 };
                store[table].push(data);
            } else {
                data = store[table].find(row => String(row[keys[table]]) === item);
                assert.ok(data);
                Object.assign(data, body);
            }
        }
        assert.ok(data, `Missing fixture row: ${url}`);
        return Response.json({ data: structuredClone(data) });
    }
    const apiModule = { exports: {} as { listRecoverableShiftRunSessions: (jo: number) => Promise<Array<{canResume: boolean;canDiscard: boolean;recoveryState:string}>>; cancelUntouchedShift: (jo: number,key: string,reason: string,actor: number) => Promise<Response>; recordShiftRunSession: (request: Request) => Promise<Response>; resumePendingShiftRunSession: (jo: number, key: string) => Promise<Response> } };
    const source = readFileSync(new URL("./_shift-run-session-service.ts", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(compiled, {
        module: apiModule, exports: apiModule.exports, process, Request, Response, FormData, File, Buffer, URL, URLSearchParams, fetch: fetchFixture,
        console: { error() {}, warn() {} },
        require(name: string) {
            if (name === "./_session-quantity-precision") return precision;
            if (name === "node:crypto") return { createHash };
            if (name === "next/headers") return { cookies: async () => ({ get: () => undefined }) };
            if (name === "next/server") return { NextResponse: Response };
            if (name.endsWith("/directus-api")) return { DIRECTUS_URL: "http://fixture", headers: {}, formatPhtDateTime: () => "2026-11-12 11:00:00" };
            if (name.endsWith("/job-order-status")) return statuses;
            if (name.endsWith("/operator-time")) return { hasCompletedTimer: () => true };
            if (name.endsWith("/production-output")) return output;
            if (name.endsWith("/production-yield-image")) return { productionYieldImageUrl: () => "evidence" };
            if (name.endsWith("/_workflow-service")) return { executeJobOrderWorkflow: () => assert.fail("Unexpected lifecycle action"), JobOrderWorkflowError: Error };
            if (name === "./_yield-evidence") return { validateYieldEvidenceUploads: () => ({ uploads: [] }), persistYieldEvidenceUploads: async () => [], YieldEvidencePersistenceError: Error };
            throw new Error(`Unexpected dependency: ${name}`);
        }
    });
    const resume = () => apiModule.exports.resumePendingShiftRunSession(434, session);
    const record = () => apiModule.exports.recordShiftRunSession(new Request("http://fixture/shift", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...payload,rejectedQty:options.rejected ?? payload.rejectedQty,rejectionReasonId:options.reason})}));
    return { store, writes, resume, record, list: () => apiModule.exports.listRecoverableShiftRunSessions(434), cancel: () => apiModule.exports.cancelUntouchedShift(434,session,"Duplicate empty entry",24) };
}

test("six-decimal storage records two reservations against one material and clears recovery errors", async () => {
    const { store, resume } = harness();
    const response = await resume();
    assert.equal(response.status, 200, await response.text());
    assert.equal(store.manufacturing_job_order_yield_ledger[0].commit_status, "COMMITTED");
    assert.equal(store.manufacturing_job_order_yield_ledger[0].recovery_error, null);
    assert.equal(store.manufacturing_job_orders[0].completed_quantity, 4000);
    assert.equal(store.manufacturing_job_orders[0].rejected_quantity, 10);
    assert.equal(store.manufacturing_job_order_materials[0].actual_consumed_quantity, 4090.167936);
    assert.equal(store.manufacturing_job_order_materials[0].reserved_quantity, 10378.532064);
    assert.equal(store.manufacturing_job_order_yield_ledger_bom_consumage.length, 2);
    assert.equal(store.jo_material_genealogy.length, 2);
    assert.equal(store.manufacturing_job_order_yield_ledger[0].qa_status, "Pending");
    assert.equal((await resume()).status, 200);
    assert.equal(store.manufacturing_job_orders[0].completed_quantity, 4000);
});

test("four-place persistence is detected before application flags claim success", async () => {
    for (const roundedCollection of ["manufacturing_job_order_materials_reservations", "manufacturing_job_order_materials", "manufacturing_job_order_yield_ledger_bom_consumage", "jo_material_genealogy"]) {
        const { store, resume } = harness({ roundedCollection });
        const response = await resume();
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, "MATERIAL_PERSISTENCE_PRECISION_MISMATCH", roundedCollection);
        assert.equal(store.manufacturing_job_order_yield_ledger[0].commit_status, "PENDING");
        const row = store.manufacturing_job_order_yield_ledger_bom_consumage[0];
        if (roundedCollection.endsWith("_reservations")) assert.equal(row.reservation_applied, false);
        if (roundedCollection.endsWith("_materials")) assert.equal(row.material_aggregate_applied, false);
        assert.equal(store.manufacturing_job_orders[0].completed_quantity, 0);
    }
});

test("retry after each interrupted persistence step preserves exact balances and avoids duplicates", async () => {
    const interruptions = [
        (table: string, method: string, body: PrecisionRow) => method === "PATCH" && body.reservation_applied === true,
        (table: string, method: string, body: PrecisionRow) => method === "PATCH" && body.material_aggregate_applied === true,
        (table: string, method: string) => table === "jo_material_genealogy" && method === "POST",
        (table: string, method: string, body: PrecisionRow) => table === "manufacturing_job_order_yield_ledger" && method === "PATCH" && body.commit_status === "COMMITTED"
    ];
    for (const interrupt of interruptions) {
        const { store, resume, writes } = harness({ interrupt });
        const failed = await resume();
        assert.notEqual(failed.status, 200);
        assert.equal(store.manufacturing_job_order_yield_ledger[0].commit_status, "PENDING");
        const retried = await resume();
        assert.equal(retried.status, 200, await retried.text());
        assert.equal(store.manufacturing_job_order_materials[0].actual_consumed_quantity, 4090.167936);
        assert.equal(store.manufacturing_job_order_materials[0].reserved_quantity, 10378.532064);
        assert.equal(store.manufacturing_job_order_yield_ledger_bom_consumage.length, 2);
        assert.equal(store.jo_material_genealogy.length, 2);
        assert.equal(writes.filter(row => row.table === "manufacturing_job_order_materials_reservations").length, 2);
        assert.equal(writes.filter(row => row.table === "manufacturing_job_order_materials").length, 2);
    }
});

test("actual material changes and altered consumption quantities still block recovery", async () => {
    for (const changeQuantity of [false, true]) {
        const { store, resume } = harness({ interrupt: (table, method, body) => method === "PATCH" && body.material_aggregate_applied === true });
        await resume();
        if (changeQuantity) store.manufacturing_job_order_yield_ledger_bom_consumage[0].quantity_consumed = 100;
        else store.manufacturing_job_order_materials[0].actual_consumed_quantity = 2000;
        const response = await resume();
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, changeQuantity ? "SESSION_CONFLICT" : "MATERIAL_AGGREGATE_CHANGED");
        assert.equal(store.manufacturing_job_order_yield_ledger[0].commit_status, "PENDING");
    }
});

test("incorrect reservation lots remain invalid before material writes", async () => {
    const { store, resume } = harness();
    store.manufacturing_job_order_materials_reservations[0].inventory_lot_id = 999;
    const response = await resume();
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, "MATERIAL_INVENTORY_LOT_MISMATCH");
    assert.equal(store.manufacturing_job_order_yield_ledger_bom_consumage.length, 0);
});


test("actual demand above confirmed WIP is rejected before inventory writes", async () => {
    const { store, resume, writes } = harness();
    store.manufacturing_job_order_materials_reservations[0].issued_to_wip_quantity = 100;
    store.manufacturing_job_order_materials_reservations[0].staged_quantity = 100;
    const response = await resume();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "MATERIAL_WIP_SHORTAGE");
    assert.equal(writes.filter(row => ["manufacturing_job_order_materials_reservations", "manufacturing_job_order_materials", "jo_material_genealogy"].includes(row.table)).length, 0);
});


test("new rejected output requires a real active defect reason before production writes", async () => {
    for (const reason of [undefined, null, "", 0, -1, "invalid", true, [], {}, 1.5, 999]) {
        const {record,writes} = harness({fresh:true,reason});
        const response = await record();
        assert.equal(response.status,422, String(reason));
        assert.match((await response.json()).code,/REJECTION_REASON_(REQUIRED|INVALID)/);
        assert.equal(writes.length,0);
    }
    for (const options of [{inactiveReason:true}, {reasonUnavailable:true}]) {
        const {record,writes}=harness({fresh:true,reason:7,...options});
        const response=await record();
        assert.equal(response.status,options.reasonUnavailable?503:422);
        assert.equal(writes.length,0);
    }
});


test("valid defect classification and zero rejected output pass reason validation", async () => {
    for (const options of [{reason:7}, {rejected:0}, {reason:7,rejected:0.000001}]) {
        const {record,store}=harness({fresh:true,...options});
        const response=await record();
        assert.equal(response.status,200,await response.text());
        if (options.reason) assert.match(String(store.manufacturing_job_order_yield_ledger[0].remarks),/Rejection reason ID: 7/);
    }
});


test("maintenance cancellation retains untouched payload and refuses partial effects", async () => {
    const old = process.env.MM_PRODUCTION_RECOVERY_MAINTENANCE;
    try {
        const f=harness(); f.store.manufacturing_job_order_yield_ledger[0].request_hash="saved";
        assert.equal((await f.cancel()).status,409);
        process.env.MM_PRODUCTION_RECOVERY_MAINTENANCE="true";
        assert.equal((await f.resume()).status,503);
        f.store.manufacturing_job_order_yield_ledger_bom_consumage.push({ledger_id:219,consumage_id:1});
        assert.equal((await f.cancel()).status,409);
        assert.equal(f.writes.length,0);
        f.store.manufacturing_job_order_yield_ledger_bom_consumage=[];
        assert.equal((await f.cancel()).status,200);
        const saved=f.store.manufacturing_job_order_yield_ledger[0];
        assert.equal(saved.commit_status,"CANCELLED"); assert.ok(saved.session_payload); assert.equal((saved.recovery_error as Record<string, unknown>).actorId,24);
        assert.equal((await f.cancel()).status,200); assert.equal(f.writes.length,1);
    } finally { if(old===undefined) delete process.env.MM_PRODUCTION_RECOVERY_MAINTENANCE; else process.env.MM_PRODUCTION_RECOVERY_MAINTENANCE=old; }
});


test("recovery status distinguishes conflicts and excludes cancelled shifts", async () => {
    const f=harness();
    for(const [code,state] of [["MATERIAL_PERSISTENCE_PRECISION_MISMATCH","PRECISION_REPAIR_REQUIRED"],["MATERIAL_AGGREGATE_CHANGED","BALANCE_CONFLICT"],["NETWORK_ERROR","TEMPORARY_FAILURE"]]) {
        f.store.manufacturing_job_order_yield_ledger[0].recovery_error={code,message:"Saved failure"};
        const rows=await f.list();
        assert.equal(rows[0].recoveryState,state);
        assert.equal(rows[0].canResume,state==="TEMPORARY_FAILURE");
        assert.equal(rows[0].canDiscard,false);
    }
    f.store.manufacturing_job_order_yield_ledger[0].commit_status="CANCELLED";
    assert.equal((await f.list()).length,0);
});
