import { NextResponse } from "next/server";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";
import { assertWorkstationBreakdownEligible, MachineDowntimeReportError } from "../../reports/machine-downtime-report/_service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    const denied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (denied) return denied;
    const query = new URL(request.url).searchParams;
    const jobOrderId = Number(query.get("jobOrderId")), routeId = Number(query.get("routeId"));
    if (![jobOrderId,routeId].every(id => Number.isSafeInteger(id) && id > 0)) return NextResponse.json({error:"A valid Job Order and route are required."},{status:400});
    try { return NextResponse.json({eligible:true,...await assertWorkstationBreakdownEligible({jobOrderId,routeId})}); }
    catch(error) {
        if(error instanceof MachineDowntimeReportError && error.status < 500) return NextResponse.json({eligible:false,code:error.code,message:error.message});
        return NextResponse.json({error:"Unable to check machine eligibility. Please retry."},{status:503});
    }
}
