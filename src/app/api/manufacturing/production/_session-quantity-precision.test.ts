import assert from "node:assert/strict";
import test from "node:test";
import type { PrecisionRepairSnapshot, PrecisionRow } from "./_session-quantity-precision";

const { buildPrecisionRepairs, precisionSchema, quantityPrecisionSql, quantityUnits } : typeof import("./_session-quantity-precision") = await import(new URL("./_session-quantity-precision.ts", import.meta.url).href);

function fixture(): PrecisionRepairSnapshot {
    const session = "precision-recovery";
    const lines = [1263.260241, 2826.907695].map((actualQty, index) => ({ joMaterialId: 1011, reservationId: 756 + index, productId: 10, mmLotId: 20, inventoryLotId: 30 + index, uomId: 1, batchNo: `batch-${index}`, actualQty }));
    const consumptions = lines.map((line, index) => ({
        consumage_id: 491 + index, ledger_id: 219, jo_material_id: 1011, reservation_id: line.reservationId,
        product_id: 10, mm_lot_id: 20, inventory_lot_id: line.inventoryLotId, uom_id: 1, batch_no: line.batchNo,
        session_key: session, source_event_key: `production-session:434:JOB_ORDER:${session}:reservation:${line.reservationId}`,
        quantity_consumed: line.actualQty.toFixed(4), reservation_applied: 1, material_aggregate_applied: index === 0 ? 1 : 0,
        reservation_actual_before: "0.000000", reservation_actual_after: String(line.actualQty),
        remaining_wip_before: index === 0 ? "4468.700000" : "10000.000000",
        remaining_wip_after: index === 0 ? "3205.439759" : "7173.092305",
        material_actual_before: index === 0 ? "0.000000" : "1263.260241",
        material_actual_after: index === 0 ? "1263.260241" : "4090.167936",
        material_reserved_before: index === 0 ? "14468.700000" : "13205.439759",
        material_reserved_after: index === 0 ? "13205.439759" : "10378.532064"
    }));
    const reservations = lines.map((line, index) => ({
        jo_materials_reservation_id: line.reservationId, jo_material_id: 1011, product_id: 10, mm_lot_id: 20,
        inventory_lot_id: line.inventoryLotId, uom_id: 1, batch_no: line.batchNo, reservation_status: "WIP",
        actual_used_quantity: line.actualQty.toFixed(4), returned_quantity: "0.000000",
        issued_to_wip_quantity: consumptions[index].remaining_wip_before, remaining_wip_quantity: consumptions[index].remaining_wip_after
    }));
    const materials = [{ jo_material_id: 1011, job_order_id: 434, actual_consumed_quantity: "1263.2602", reserved_quantity: "13205.4398" }];
    const genealogy = [{ genealogy_id: 442, job_order_id: 434, session_key: session, source_event_key: consumptions[0].source_event_key, jo_material_id: 1011, reservation_id: 756, component_product_id: 10, component_mm_lot_id: 20, component_inventory_lot_id: 30, uom_id: 1, component_batch_no: "batch-0", consumed_quantity: "1263.2602" }];
    const revisions: PrecisionRow[] = [];
    function audit(collection: string, item: number, data: PrecisionRow, delta: PrecisionRow) {
        revisions.push({ id: revisions.length + 1, collection, item: String(item), data, delta });
    }
    consumptions.forEach((row, index) => audit("manufacturing_job_order_yield_ledger_bom_consumage", row.consumage_id, { ...row, quantity_consumed: lines[index].actualQty }, { quantity_consumed: lines[index].actualQty }));
    reservations.forEach((row, index) => audit("manufacturing_job_order_materials_reservations", row.jo_materials_reservation_id, row, { actual_used_quantity: lines[index].actualQty }));
    audit("manufacturing_job_order_materials", 1011, materials[0], { actual_consumed_quantity: 1263.260241, reserved_quantity: 13205.439759 });
    audit("jo_material_genealogy", 442, genealogy[0], { consumed_quantity: 1263.260241 });
    return {
        ledger: { ledger_id: 219, job_order_id: 434, jo_route_id: null, commit_status: "PENDING", job_order_updated: 0, request_hash: "saved-hash", session_key: session, session_payload: { sessionScope: "JOB_ORDER", joId: 434, sessionKey: session, materialsConsumed: lines } },
        consumptions, reservations, materials, genealogy, revisions
    };
}

test("decimal recovery uses exact units and preserves existing integer capacity", () => {
    assert.equal(quantityUnits("1263.260241", 4), BigInt(12632602));
    assert.equal(quantityUnits("9.999950", 4), BigInt(100000));
    assert.equal(quantityUnits("99999999999999.123456"), BigInt("99999999999999123456"));
    assert.deepEqual(precisionSchema({ numeric_precision: 18, numeric_scale: 4 }, 20), { numeric_precision: 20, numeric_scale: 6 });
    assert.deepEqual(precisionSchema({ numeric_precision: 22, numeric_scale: 8 }, 18), { numeric_precision: 22, numeric_scale: 8 });
});

test("SQL fallback retains column comments, defaults, nullability, and integer capacity", () => {
    const sql = quantityPrecisionSql("manufacturing_job_order_materials", "actual_consumed_quantity", { numeric_precision: 15, numeric_scale: 4, is_nullable: true, default_value: 0, comment: "Actual physical stock issued" }, 18);
    assert.match(sql, /DECIMAL\(18,6\) NULL DEFAULT 0\.000000 COMMENT 'Actual physical stock issued';$/);
    const reservation = quantityPrecisionSql("manufacturing_job_order_materials_reservations", "actual_used_quantity", { numeric_precision: 18, numeric_scale: 4, is_nullable: true, default_value: null, comment: "" }, 20);
    assert.match(reservation, /DECIMAL\(20,6\) NULL DEFAULT NULL COMMENT '';/);
    assert.throws(() => quantityPrecisionSql("unrelated", "quantity", {}, 18), /Unexpected/);
});

test("repair restores only rounded quantities and the last applied material snapshot", () => {
    const snapshot = fixture();
    const before = structuredClone(snapshot);
    const plan = buildPrecisionRepairs(snapshot, 219, 434);
    assert.equal(plan.length, 6);
    assert.deepEqual(plan.at(-1)?.patch, { actual_consumed_quantity: "1263.260241", reserved_quantity: "13205.439759" });
    assert.deepEqual(snapshot, before);
    assert.ok(plan.every(({ patch }) => !Object.hasOwn(patch, "reservation_applied") && !Object.hasOwn(patch, "material_aggregate_applied")));
});

test("rerunning a completed precision repair produces no additional writes", () => {
    const snapshot = fixture();
    const groups: Record<string, PrecisionRow[]> = {
        manufacturing_job_order_yield_ledger_bom_consumage: snapshot.consumptions,
        manufacturing_job_order_materials_reservations: snapshot.reservations,
        manufacturing_job_order_materials: snapshot.materials,
        jo_material_genealogy: snapshot.genealogy
    };
    for (const repair of buildPrecisionRepairs(snapshot, 219, 434)) {
        const row = groups[repair.collection].find(candidate => Object.values(candidate).includes(repair.id));
        assert.ok(row);
        Object.assign(row, repair.patch);
    }
    assert.equal(buildPrecisionRepairs(snapshot, 219, 434).length, 0);
});

test("repair rejects real balance changes, including six-place changes inside the old rounding interval", () => {
    for (const changed of ["1264.2602", "1263.260201"]) {
        const snapshot = fixture();
        snapshot.materials[0].actual_consumed_quantity = changed;
        assert.throws(() => buildPrecisionRepairs(snapshot, 219, 434), /Unexplained balance change/);
    }
});

test("repair requires the original quantity audit evidence and rejects a later different update", () => {
    const snapshot = fixture();
    snapshot.revisions = [];
    assert.throws(() => buildPrecisionRepairs(snapshot, 219, 434), /audit evidence/);
    const changed = fixture();
    changed.revisions.push({ id: 100, collection: "manufacturing_job_order_materials", item: "1011", data: changed.materials[0], delta: { actual_consumed_quantity: 1263.260249 } });
    assert.throws(() => buildPrecisionRepairs(changed, 219, 434), /audit evidence/);
});

test("repair rejects foreign identities, unconfirmed writes, and committed sessions", () => {
    for (const mutate of [
        (snapshot: PrecisionRepairSnapshot) => { snapshot.reservations[0].inventory_lot_id = 999; },
        (snapshot: PrecisionRepairSnapshot) => { snapshot.consumptions[0].reservation_applied = 0; },
        (snapshot: PrecisionRepairSnapshot) => { snapshot.ledger.commit_status = "COMMITTED"; },
        (snapshot: PrecisionRepairSnapshot) => { snapshot.ledger.request_hash = null; }
    ]) {
        const snapshot = fixture();
        mutate(snapshot);
        assert.throws(() => buildPrecisionRepairs(snapshot, 219, 434));
    }
});
