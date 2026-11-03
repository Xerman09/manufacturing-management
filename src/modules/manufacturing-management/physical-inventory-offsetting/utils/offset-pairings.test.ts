import assert from "node:assert/strict";
import type { OffsettingLineDetail, OffsettingPairing } from "../types";
import { canEditOffsetPairings, normalizeOffsetPairings, prepareOffsetPairingsForSave, readOffsetPairings, sameOffsetPairings, writeOffsetPairings } from "./offset-pairings";

const details = [
    { id: 1, product_id: { product_id: 11, unit_of_measurement_count: 12 }, lot_id: 101, system_count: 10, physical_count: 8, unit_cost: 120 },
    { id: 2, product_id: { product_id: 22, unit_of_measurement_count: 24 }, lot_id: 102, system_count: 1, physical_count: 2, unit_cost: 480 },
] as OffsettingLineDetail[];
const pair: OffsettingPairing = {
    id: "pair-1", group_link_id: "group-1",
    shortage_detail_id: 1, shortage_product_id: 11, shortage_product_name: "Shortage", shortage_lot_id: 101,
    surplus_detail_id: 2, surplus_product_id: 22, surplus_product_name: "Surplus", surplus_lot_id: 102,
    offset_qty: 6, offset_pieces: 6, shortage_uom_count: 12, surplus_uom_count: 24,
    shortage_unit_cost: 120, surplus_unit_cost: 480, unit_cost_variance: 10, net_financial_impact: 60,
    reason_code: "UOM Miscount", notes: "Audited __OFFSET_DATA__: on the receipt",
};
const normalized = normalizeOffsetPairings([pair], details)[0];
assert.equal(normalized.shortage_containers_deducted, 0.5);
assert.equal(normalized.surplus_containers_deducted, 0.25);
assert.equal(normalized.net_financial_impact, 60);
const savedRemarks = writeOffsetPairings("Original auditor remarks", [normalized]);
assert.deepEqual(readOffsetPairings(savedRemarks), [normalized]);
assert.equal(writeOffsetPairings(savedRemarks, []), "Original auditor remarks");
assert.equal(writeOffsetPairings(null, []), null);
assert.throws(() => writeOffsetPairings("Audit", [{ ...pair, notes: "x".repeat(66000) }]), /storage limit/);
assert.throws(() => readOffsetPairings("__OFFSET_DATA__:{bad json"), /could not be read/);
assert.throws(() => readOffsetPairings("__OFFSET_DATA__:{}"), /could not be read/);
assert.equal(sameOffsetPairings([pair], [{ ...pair, offset_qty: 7 }]), false);
assert.equal(sameOffsetPairings([pair], [Object.fromEntries(Object.entries(pair).reverse()) as unknown as OffsettingPairing]), true);

for (const status of ["DRAFT", "PENDING_REVIEW"]) assert.equal(canEditOffsetPairings({ status }), true);
for (const status of ["COMMITTED", "POSTED", "CANCELLED"]) assert.equal(canEditOffsetPairings({ status }), false);
for (const flag of [true, 1, "1", "true"]) {
    assert.equal(canEditOffsetPairings({ status: "PENDING_REVIEW", isCommitted: flag }), false);
    assert.equal(canEditOffsetPairings({ status: "DRAFT", isCancelled: flag }), false);
}

for (const quantity of [0, -1, Infinity, NaN, 25]) {
    assert.throws(() => normalizeOffsetPairings([{ ...pair, offset_pieces: quantity }], details));
}
assert.throws(() => normalizeOffsetPairings([pair, { ...pair, id: "pair-2", offset_pieces: 20 }], details), /exceed/);
assert.throws(() => normalizeOffsetPairings([pair, pair], details), /distinct/);
assert.throws(() => normalizeOffsetPairings([{ ...pair, shortage_detail_id: 999 }], details), /does not match/);
assert.throws(() => normalizeOffsetPairings([{ ...pair, reason_code: "", notes: "" }], details), /require a reason/);
assert.throws(() => normalizeOffsetPairings([{ ...pair, shortage_uom_count: 6 }], details), /conversion.*changed/);
const edited = normalizeOffsetPairings([{ ...pair, offset_qty: 12, offset_pieces: 12, notes: "Corrected count" }], details)[0];
assert.equal(edited.id, pair.id);
assert.equal(edited.net_financial_impact, 120);
assert.equal(edited.shortage_containers_deducted, 1);
assert.equal(edited.surplus_containers_deducted, 0.5);

const legacyDetails = [details[0], { ...details[1], product_id: details[0].product_id, unit_cost: 240 }];
const legacy = { ...pair, surplus_product_id: 11, offset_qty: 1, offset_pieces: undefined, shortage_uom_count: undefined, surplus_uom_count: undefined };
assert.equal(normalizeOffsetPairings([legacy], legacyDetails)[0].offset_pieces, 12);
const legacySaved = prepareOffsetPairingsForSave([legacy], legacyDetails)[0];
assert.equal(legacySaved.offset_qty, 1);
assert.equal(legacySaved.offset_pieces, undefined);
assert.equal(legacySaved.net_financial_impact, 120);
assert.throws(() => normalizeOffsetPairings([legacy], legacyDetails.map(row => ({ ...row, product_id: 11 }))), /unavailable or ambiguous/);
console.log("Offset pairing storage, quantities, editing limits, and lifecycle checks passed.");
