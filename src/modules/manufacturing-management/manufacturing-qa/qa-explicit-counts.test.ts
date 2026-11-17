import assert from "node:assert/strict";
import test from "node:test";
const {explicitQAOutputAllocation,initialQAInspectionCounts}=await import(new URL("./qa-output-allocation.ts",import.meta.url).href);
test("fresh and revoked inspection counts do not inherit operator or previous QA output",()=>{
 assert.deepEqual(initialQAInspectionCounts(false,2,1),{accepted:"",rejected:""});
 assert.deepEqual(initialQAInspectionCounts(true,2,1),{accepted:"2",rejected:"1"});
});
test("both counts are explicit, including zero",()=>{
 for(const bad of [undefined,null,""," ","wrong",-1,"0.0000001",true,{}]) {
  assert.equal(explicitQAOutputAllocation({acceptedQuantity:bad,rejectedQuantity:0}),null);
  assert.equal(explicitQAOutputAllocation({acceptedQuantity:0,rejectedQuantity:bad}),null);
 }
 assert.deepEqual(explicitQAOutputAllocation({acceptedQuantity:"2",rejectedQuantity:"0"}),{acceptedQuantity:2,rejectedQuantity:0});
 assert.deepEqual(explicitQAOutputAllocation({acceptedQuantity:0,rejectedQuantity:"3"}),{acceptedQuantity:0,rejectedQuantity:3});
 assert.deepEqual(explicitQAOutputAllocation({acceptedQuantity:"0.000001",rejectedQuantity:"0.000001"}),{acceptedQuantity:0.000001,rejectedQuantity:0.000001});
 assert.deepEqual(explicitQAOutputAllocation({acceptedQuantity:0,rejectedQuantity:0}),{acceptedQuantity:0,rejectedQuantity:0});
});
