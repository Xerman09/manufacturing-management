import assert from "node:assert/strict";
import test from "node:test";
const {qaOutputAllocationMatchesLoggedTotal, sumQAOutputQuantities} = await import(new URL("./qa-output-allocation.ts", import.meta.url).href);
const {deriveDailyQAOutcome, latestDailyQAAuditsByRoute} = await import(new URL("./daily-qa-outcome.ts", import.meta.url).href);
const {isDispositionForYield, qaDispositionSource} = await import(new URL("./qa-disposition-source.ts", import.meta.url).href);

test("QA may reclassify either way while conserving the shift total", () => {
 for (const [good, bad] of [[1,2],[2,1],[0,3],[3,0]])
  assert.equal(qaOutputAllocationMatchesLoggedTotal({acceptedQuantity:good,rejectedQuantity:bad},2,1),true);
 assert.equal(qaOutputAllocationMatchesLoggedTotal({acceptedQuantity:1,rejectedQuantity:2},1,sumQAOutputQuantities(1,1)),true);
});
test("total mismatch includes a one-millionth difference", () => {
 for (const bad of [1,3,2.000001,1.999999])
  assert.equal(qaOutputAllocationMatchesLoggedTotal({acceptedQuantity:1,rejectedQuantity:bad},2,1),false);
 assert.equal(qaOutputAllocationMatchesLoggedTotal({acceptedQuantity:0.1,rejectedQuantity:0.2},0.3,0),true);
});
const released = {daily_qa_id:2,jo_route_id:10,inspected_at:"2026-11-18T01:01:00Z",sensory_status:"Passed",lab_status:"Passed",action_taken:"Released",weight_check_passed:true};
const quarantined = {...released,daily_qa_id:1,inspected_at:"2026-11-18T01:00:00Z",action_taken:"Quarantined"};
test("latest passing reinspection supersedes quarantine; other route failures still hold", () => {
 assert.equal(deriveDailyQAOutcome([released,quarantined],[10]).status,"Passed");
 assert.deepEqual(latestDailyQAAuditsByRoute([released,quarantined]),[released]);
 assert.equal(deriveDailyQAOutcome([released,{...quarantined,jo_route_id:11}],[10,11]).status,"QA Hold");
 for (const failure of [{lab_status:"Failed"},{sensory_status:"Failed"},{weight_check_passed:false},{action_taken:"Scrapped"}])
  assert.equal(deriveDailyQAOutcome([{...released,...failure}],[10]).status,"QA Hold");
 assert.equal(deriveDailyQAOutcome([released],[10,11]).status,"Pending");
});
test("disposition ownership excludes unrelated yields and unproven historical holds", () => {
 assert.equal(isDispositionForYield({inspection_remarks:qaDispositionSource(218)+"\nFailure"},218),true);
 assert.equal(isDispositionForYield({inspection_remarks:qaDispositionSource(219)+"\nFailure"},218),false);
 assert.equal(isDispositionForYield({inspection_remarks:"Failure"},218),false);
});

const {yieldAuditRowsAfterRevocation,releasedYieldGoodQuantity}=await import(new URL("../../../app/api/manufacturing/production/qa-release.ts",import.meta.url).href);
test("revoked audits are excluded and verified good totals use the QA split",()=>{
 assert.deepEqual(yieldAuditRowsAfterRevocation({qa_revoked_through_audit_id:1},[quarantined,released]),[released]);
 assert.equal(deriveDailyQAOutcome(yieldAuditRowsAfterRevocation({qa_revoked_through_audit_id:2},[quarantined,released]),[10]).status,"Pending");
 assert.equal(releasedYieldGoodQuantity({qa_status:"Passed",yield_quantity:2,qa_accepted_quantity:1}),1);
 assert.equal(releasedYieldGoodQuantity({qa_status:"QA Hold",yield_quantity:2,qa_accepted_quantity:1}),0);
});
