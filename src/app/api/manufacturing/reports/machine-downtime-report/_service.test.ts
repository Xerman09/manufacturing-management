import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const statuses=await import(new URL("../../../../../modules/manufacturing-management/job-order-status.ts",import.meta.url).href);
function fixture(options: {asset?:Record<string,unknown>|null;routeJob?:number;routeStatus?:string;jobStatus?:string;workCenter?:number;fail?:boolean}={}) {
 const methods:string[]=[];
 const apiModule={exports:{} as {assertWorkstationBreakdownEligible:(input:{jobOrderId:number;routeId:number})=>Promise<{assetId:number}>;recordWorkstationBreakdownMaintenance:(input:{jobOrderId:number;routeId:number;breakdownCategory:string;rootCause:string},actor:number)=>Promise<unknown>}};
 const source=fs.readFileSync(new URL("./_service.ts",import.meta.url),"utf8");
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
  module:apiModule,exports:apiModule.exports,console,URL,URLSearchParams,Response,
  fetch:async(url:string,init:RequestInit={})=>{methods.push(init.method||"GET");if(options.fail)throw Error("Offline");const table=new URL(url).pathname.split("/")[2];return Response.json({data:table==="manufacturing_job_orders"?[{job_order_id:434,status:options.jobStatus||"In Production"}]:table==="manufacturing_job_order_routes"?[{jo_route_id:1,job_order_id:options.routeJob??434,status:options.routeStatus||"Pending",work_center_id:options.workCenter??115}]:table==="manufacturing_work_centers"?[{work_center_id:115,work_center_name:"Steam Tunnel",asset_id:options.asset??null}]:[]});},
  require:(name:string)=>{if(name.endsWith("/directus-api"))return{DIRECTUS_URL:"http://fixture",headers:{}};if(name.endsWith("/job-order-status"))return statuses;if(name.endsWith("/_directus-file-metadata"))return{};throw Error(name);}
 });return{api:apiModule.exports,methods};
}
test("missing or non-Production machine is rejected before any write",async()=>{
 for(const asset of [null,{id:193,asset_type:"Administrative",item_id:{item_name:"Mama Je Mixer"}}]) {
  const f=fixture({asset});await assert.rejects(()=>f.api.recordWorkstationBreakdownMaintenance({jobOrderId:434,routeId:1,breakdownCategory:"QA",rootCause:"QA"},24),(e:unknown)=>{const error=e as {code:string;message:string};assert.equal(error.code,"PRODUCTION_ASSET_REQUIRED");assert.match(error.message,/WC-115/);return true;});assert.ok(f.methods.every(m=>m==="GET"));
 }
});
test("eligible Production machine is inspected without writes",async()=>{const f=fixture({asset:{id:193,asset_type:"Production"}});assert.equal((await f.api.assertWorkstationBreakdownEligible({jobOrderId:434,routeId:1})).assetId,193);assert.ok(f.methods.every(m=>m==="GET"));});
test("preflight rejects invalid route, station and job status",async()=>{
 for(const options of [{routeJob:999},{workCenter:0},{jobStatus:"Closed"},{routeStatus:"Cancelled"}]) {const f=fixture(options);await assert.rejects(()=>f.api.assertWorkstationBreakdownEligible({jobOrderId:434,routeId:1}));assert.ok(f.methods.every(m=>m==="GET"));}
});
test("lookup failure does not authorize a breakdown",async()=>{const f=fixture({fail:true});await assert.rejects(()=>f.api.assertWorkstationBreakdownEligible({jobOrderId:434,routeId:1}));assert.deepEqual(f.methods,["GET","GET"]);});
