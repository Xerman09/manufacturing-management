import assert from "node:assert/strict";
import {
    calculateMaterialConsumptionDefaults,
    calculateWipTopUpShortfall,
    materialConsumptionShortfalls,
    distributeConsumptionAcrossReservations,
    parseMaterialConsumptionInput,
    preserveExistingActualQuantities,
    sumProductionOutputQuantities
} from "./material-consumption.ts";

assert.equal(sumProductionOutputQuantities("8", "1", 0), 9);
assert.equal(parseMaterialConsumptionInput("15"), 15);
assert.equal(parseMaterialConsumptionInput("15."), 15);
assert.equal(parseMaterialConsumptionInput("15.0"), 15);
assert.equal(parseMaterialConsumptionInput("15.07"), 15.07);
assert.equal(parseMaterialConsumptionInput("15.075"), 15.075);
assert.equal(parseMaterialConsumptionInput("15.015"), 15.015);
assert.equal(parseMaterialConsumptionInput("."), null);
assert.equal(parseMaterialConsumptionInput(""), null);
assert.equal(parseMaterialConsumptionInput("-1"), null);
assert.equal(parseMaterialConsumptionInput("15.1234567"), null);
assert.equal(parseMaterialConsumptionInput("not a quantity"), null);

assert.deepEqual(preserveExistingActualQuantities([
    { jo_material_id: 1, reservation_id: 10, actual_qty: "73.333333", available_stock: 100 },
    { jo_material_id: 1, reservation_id: 11, actual_qty: "36.666667", available_stock: 50 }
], [
    { jo_material_id: 1, reservation_id: 10, actual_qty: "12.5", available_stock: 80 }
]), [
    { jo_material_id: 1, reservation_id: 10, actual_qty: "12.5", available_stock: 100 },
    { jo_material_id: 1, reservation_id: 11, actual_qty: "36.666667", available_stock: 50 }
]);

assert.deepEqual(preserveExistingActualQuantities([
    { jo_material_id: 1, reservation_id: 10, actual_qty: "2.828000", available_stock: 2.828 },
    { jo_material_id: 1, reservation_id: 11, actual_qty: "0.848400", available_stock: 0.8484 }
], [
    { jo_material_id: 1, reservation_id: 10, actual_qty: "2.500000", available_stock: 2.828 }
], new Set(["1:10"])), [
    { jo_material_id: 1, reservation_id: 10, actual_qty: "2.500000", available_stock: 2.828 },
    { jo_material_id: 1, reservation_id: 11, actual_qty: "0.848400", available_stock: 0.8484 }
]);

const balancedReservations = calculateMaterialConsumptionDefaults([
    { jo_material_id: 1, allocated_quantity: 100, available_stock: 100 },
    { jo_material_id: 1, allocated_quantity: 100, available_stock: 50 }
], 10, sumProductionOutputQuantities("8", "1", 0));
assert.deepEqual(balancedReservations, [
    { theoreticalQuantity: 60, actualQuantity: "60.000000" },
    { theoreticalQuantity: 30, actualQuantity: "30.000000" }
]);

const shortageReservations = calculateMaterialConsumptionDefaults([
    { jo_material_id: 2, allocated_quantity: 100, available_stock: 40 },
    { jo_material_id: 2, allocated_quantity: 100, available_stock: 60 }
], 10, 11);
assert.deepEqual(shortageReservations, [
    { theoreticalQuantity: 44, actualQuantity: "44.000000" },
    { theoreticalQuantity: 66, actualQuantity: "66.000000" }
]);
assert.equal(
    shortageReservations.reduce((sum, line) => sum + Number(line.actualQuantity), 0),
    110
);

const topUpConsumption = distributeConsumptionAcrossReservations(30.15, [
    { reservationKey: "20:711", availableStock: 25.125 },
    { reservationKey: "20:714", availableStock: 5.025 }
]);
assert.deepEqual(topUpConsumption, {
    allocations: [
        { reservationKey: "20:711", actualQuantity: "25.125000" },
        { reservationKey: "20:714", actualQuantity: "5.025000" }
    ],
    remainingQuantity: 0
});

const partialTopUpConsumption = distributeConsumptionAcrossReservations(30.15, [
    { reservationKey: "20:711", availableStock: 25.125 },
    { reservationKey: "20:714", availableStock: 3 }
]);
assert.deepEqual(partialTopUpConsumption, {
    allocations: [
        { reservationKey: "20:711", actualQuantity: "25.125000" },
        { reservationKey: "20:714", actualQuantity: "3.000000" }
    ],
    remainingQuantity: 2.025
});
assert.equal(calculateWipTopUpShortfall(30.15, 25.125), 5.025);
assert.equal(calculateWipTopUpShortfall(30.15, 28.125), 2.025);

const exactShortfallBeforeTopUp = calculateMaterialConsumptionDefaults([
    { jo_material_id: 20, allocated_quantity: 3.342181818, available_stock: 2.828 }
], 10, 11);
assert.equal(exactShortfallBeforeTopUp[0].theoreticalQuantity, 3.6764);
assert.equal(exactShortfallBeforeTopUp[0].actualQuantity, "3.676400");
assert.equal(Number((exactShortfallBeforeTopUp[0].theoreticalQuantity - 2.828).toFixed(6)), 0.8484);

const exactConsumptionAfterTopUp = calculateMaterialConsumptionDefaults([
    { jo_material_id: 20, allocated_quantity: 3.342181818, available_stock: 2.828 },
    { jo_material_id: 20, allocated_quantity: 3.342181818, available_stock: 0.8484 }
], 10, 11);
assert.deepEqual(exactConsumptionAfterTopUp, [
    { theoreticalQuantity: 2.828, actualQuantity: "2.828000" },
    { theoreticalQuantity: 0.8484, actualQuantity: "0.848400" }
]);

const requiredQuantityFallback = calculateMaterialConsumptionDefaults([
    { jo_material_id: 3, required_quantity: 50, issued_to_wip_quantity: 4, available_stock: 0 },
    { jo_material_id: 3, required_quantity: 50, issued_to_wip_quantity: 6, available_stock: 0 }
], 10, 10);
assert.deepEqual(requiredQuantityFallback, [
    { theoreticalQuantity: 20, actualQuantity: "20.000000" },
    { theoreticalQuantity: 30, actualQuantity: "30.000000" }
]);

const zeroOutput = calculateMaterialConsumptionDefaults([
    { jo_material_id: 4, allocated_quantity: 75, available_stock: 75 }
], 10, 0);
assert.deepEqual(zeroOutput, [
    { theoreticalQuantity: 0, actualQuantity: "0.000000" }
]);



assert.deepEqual(materialConsumptionShortfalls(120,120,100), {actualShortfall:20,theoreticalShortfall:20,topUpShortfall:20});
assert.deepEqual(materialConsumptionShortfalls(90,120,100), {actualShortfall:0,theoreticalShortfall:20,topUpShortfall:20});
assert.deepEqual(materialConsumptionShortfalls(110,120,100), {actualShortfall:10,theoreticalShortfall:20,topUpShortfall:10});
assert.deepEqual(materialConsumptionShortfalls(130,120,100), {actualShortfall:30,theoreticalShortfall:20,topUpShortfall:30});
assert.deepEqual(materialConsumptionShortfalls(100,100,100), {actualShortfall:0,theoreticalShortfall:0,topUpShortfall:0});
assert.equal(materialConsumptionShortfalls(0.000002,0.000002,0.000001).topUpShortfall,0.000001);

// The over-target default is demand, not an inventory allocation.
const overTarget = calculateMaterialConsumptionDefaults([{jo_material_id: 1, allocated_quantity:100, available_stock:100}],100,120);
assert.equal(overTarget[0].actualQuantity,"120.000000");
const partial = distributeConsumptionAcrossReservations(Number(overTarget[0].actualQuantity),[
    {reservationKey:"1:10",availableStock:100}, {reservationKey:"1:11",availableStock:10}
]);
assert.equal(partial.remainingQuantity,10);
assert.equal(partial.allocations.reduce((sum,row)=>sum+Number(row.actualQuantity),0)+partial.remainingQuantity,120);
assert.equal(distributeConsumptionAcrossReservations(120,[
    {reservationKey:"1:10",availableStock:100}, {reservationKey:"1:11",availableStock:20}
]).remainingQuantity,0);
// Output changes update untouched defaults, while actual measurements stay intact.
const refreshed = calculateMaterialConsumptionDefaults([{jo_material_id:1,allocated_quantity:100,available_stock:100}],100,130);
assert.equal(refreshed[0].actualQuantity,"130.000000");
assert.equal(preserveExistingActualQuantities([
    {jo_material_id:1,reservation_id:10,actual_qty:refreshed[0].actualQuantity}
],[{jo_material_id:1,reservation_id:10,actual_qty:"90"}],new Set(["1:10"]))[0].actual_qty,"90");
assert.equal(calculateMaterialConsumptionDefaults([{jo_material_id:1,allocated_quantity:100,available_stock:100}],0,120)[0].actualQuantity,"0.000000");
console.log("material-consumption assertions passed");
