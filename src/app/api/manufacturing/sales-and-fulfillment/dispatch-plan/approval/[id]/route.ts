import { NextRequest, NextResponse } from "next/server";
import {
  DIRECTUS_URL,
  headers as directusHeaders,
  formatPhtDateTime,
} from "@/app/api/manufacturing/directus-api";
import {
  directusGet,
  directusGetOne,
  fetchFullDispatchPlanDetail,
  getUserIdFromToken,
  parseBitFlag,
  sanitizeDirectusError,
  type RawDispatchDetailRow,
  type RawDispatchPlanRow,
} from "../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/sales-and-fulfillment/dispatch-plan/approval/[id]
 * Full detail for Approval review modal.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const dispatchId = Number(id);
    if (!dispatchId || Number.isNaN(dispatchId)) {
      return NextResponse.json(
        { success: false, message: "Valid dispatch plan ID is required." },
        { status: 400 }
      );
    }

    const detail = await fetchFullDispatchPlanDetail(dispatchId);
    if (!detail) {
      return NextResponse.json(
        { success: false, message: `Dispatch Plan #${dispatchId} not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: detail });
  } catch (error) {
    console.error("[Dispatch Plan API] GET /approval/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to load dispatch plan details",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/manufacturing/sales-and-fulfillment/dispatch-plan/approval/[id]
 * Approves or rejects a 'Pending' dispatch plan:
 * - approve: dispatch_plan.status = 'Approved', linked sales_order.order_status = 'Dispatched'
 * - reject:  dispatch_plan.status = 'Rejected' (with reason), linked sales_order.order_status = 'For Loading'
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const dispatchId = Number(id);
    if (!dispatchId || Number.isNaN(dispatchId)) {
      return NextResponse.json(
        { success: false, message: "Valid dispatch plan ID is required." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { success: false, message: "Action must be 'approve' or 'reject'." },
        { status: 400 }
      );
    }
    if (action === "reject" && !reason) {
      return NextResponse.json(
        { success: false, message: "A reason is required when returning a dispatch plan for correction." },
        { status: 400 }
      );
    }

    const existing = await directusGetOne<RawDispatchPlanRow>(
      `/items/dispatch_plan/${dispatchId}?fields=*`
    );
    if (!existing || parseBitFlag(existing.is_delete)) {
      return NextResponse.json(
        { success: false, message: `Dispatch Plan #${dispatchId} not found.` },
        { status: 404 }
      );
    }

    if (existing.status !== "Pending" && existing.status !== "For Approval") {
      return NextResponse.json(
        {
          success: false,
          message: `Dispatch Plan ${existing.dispatch_no} is already '${existing.status}'. Only plans awaiting approval can be actioned.`,
        },
        { status: 400 }
      );
    }

    const userId = await getUserIdFromToken();
    const nowPht = formatPhtDateTime();

    // Fetch linked SOs
    const details = await directusGet<RawDispatchDetailRow>(
      `/items/dispatch_plan_details?filter[dispatch_id][_eq]=${dispatchId}&limit=-1&fields=detail_id,dispatch_id,sales_order_id`
    );
    const salesOrderIds = Array.from(
      new Set(details.map((d) => Number(d.sales_order_id)).filter(Boolean))
    );

    // 1. Update dispatch_plan record
    const planPatch: Record<string, unknown> =
      action === "approve"
        ? {
            status: "Dispatched",
            approved_at: nowPht,
            ...(userId ? { approved_by: userId } : {}),
          }
        : {
            status: "Rejected",
            rejected_at: nowPht,
            rejection_reason: reason,
            reject_remarks: reason,
            ...(userId ? { rejected_by: userId } : {}),
          };

    const planRes = await fetch(`${DIRECTUS_URL}/items/dispatch_plan/${dispatchId}`, {
      method: "PATCH",
      headers: directusHeaders,
      body: JSON.stringify(planPatch),
    });

    if (!planRes.ok) {
      const errTxt = await planRes.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          message: sanitizeDirectusError(errTxt, planRes.status),
        },
        { status: planRes.status }
      );
    }

    // 2. Update linked Sales Order statuses
    const targetOrderStatus = action === "approve" ? "Dispatched" : "For Loading";
    if (salesOrderIds.length > 0) {
      await Promise.all(
        salesOrderIds.map(async (soId) => {
          const soPatch: Record<string, unknown> = {
            order_status: targetOrderStatus,
            modified_date: nowPht,
          };
          if (userId) soPatch.modified_by = userId;
          const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify(soPatch),
          });
          if (!soRes.ok) {
            const errTxt = await soRes.text().catch(() => "");
            throw new Error(
              `Failed to update Sales Order #${soId} to ${targetOrderStatus}: ${errTxt}`
            );
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      dispatch_id: dispatchId,
      status: action === "approve" ? "Dispatched" : "Rejected",
      sales_order_status: targetOrderStatus,
    });
  } catch (error) {
    console.error("[Dispatch Plan API] POST /approval/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to process approval decision",
      },
      { status: 500 }
    );
  }
}
