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
  type RawDispatchBudgetRow,
  type RawDispatchDetailRow,
  type RawDispatchPlanRow,
} from "../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/sales-and-fulfillment/dispatch-plan/creation/[id]
 * Full detail for View / Edit modal.
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
    console.error("[Dispatch Plan API] GET /creation/[id] error:", error);
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
 * PATCH /api/manufacturing/sales-and-fulfillment/dispatch-plan/creation/[id]
 * Updates a dispatch plan while status is 'Pending' (or 'Rejected' for correction & resubmission).
 * Reverts removed SOs to 'For Loading' and sets newly added SOs to 'For Shipping'.
 */
export async function PATCH(
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

    const existing = await directusGetOne<RawDispatchPlanRow>(
      `/items/dispatch_plan/${dispatchId}?fields=*`
    );
    if (!existing || parseBitFlag(existing.is_delete)) {
      return NextResponse.json(
        { success: false, message: `Dispatch Plan #${dispatchId} not found.` },
        { status: 404 }
      );
    }

    if (existing.status !== "Pending" && existing.status !== "Rejected") {
      return NextResponse.json(
        {
          success: false,
          message: `Dispatch Plan ${existing.dispatch_no} is '${existing.status}' and cannot be edited.`,
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    const branchId = body.branch_id !== undefined ? Number(body.branch_id) : existing.branch_id;
    const vehicleId =
      body.vehicle_id !== undefined
        ? (body.vehicle_id !== null ? Number(body.vehicle_id) : null)
        : existing.vehicle_id
        ? Number(existing.vehicle_id)
        : null;

    let is3PL = vehicleId === 0 || vehicleId === null;
    if (vehicleId && vehicleId > 0) {
      const [vRow] = await directusGet<{
        vehicle_id: number;
        name?: string;
        vehicle_plate?: string;
        vehicle_type?: number;
      }>(
        `/items/vehicles?filter[vehicle_id][_eq]=${vehicleId}&limit=1&fields=vehicle_id,name,vehicle_plate,vehicle_type`
      ).catch(() => []);
      if (vRow) {
        const n = String(vRow.name || "").toLowerCase();
        const p = String(vRow.vehicle_plate || "").toLowerCase();
        if (
          n.includes("third party") ||
          n.includes("3rd party") ||
          p.includes("3pl") ||
          Number(vRow.vehicle_type) === 8 ||
          Number(vRow.vehicle_id) === 245
        ) {
          is3PL = true;
        }
      }
    }
    const driverId =
      body.driver_id !== undefined ? (body.driver_id ? Number(body.driver_id) : null) : existing.driver_id;
    const helperId =
      body.helper_id !== undefined ? (body.helper_id ? Number(body.helper_id) : null) : existing.helper_id;
    const departureDate =
      typeof body.departure_date === "string"
        ? body.departure_date.trim()
        : existing.departure_date ?? existing.dispatch_date ?? "";
    const arrivalDate =
      typeof body.arrival_date === "string"
        ? body.arrival_date.trim()
        : existing.arrival_date ?? "";
    const remarks =
      body.remarks !== undefined ? String(body.remarks).trim() : existing.remarks ?? "";
    const totalAmount =
      body.total_amount !== undefined ? Number(body.total_amount) : Number(existing.total_amount ?? 0);
    const resubmit = Boolean(body.resubmit);

    if (!branchId) {
      return NextResponse.json(
        { success: false, message: "Source Branch is required." },
        { status: 400 }
      );
    }
    if (!is3PL) {
      if (!driverId || !helperId) {
        return NextResponse.json(
          { success: false, message: "Driver and Helper are required for internal vehicles." },
          { status: 400 }
        );
      }
      if (driverId === helperId) {
        return NextResponse.json(
          { success: false, message: "Driver cannot also be assigned as Helper." },
          { status: 400 }
        );
      }
    }
    if (!departureDate || !arrivalDate) {
      return NextResponse.json(
        { success: false, message: "Departure (ETD) and Arrival (ETDA) dates are required." },
        { status: 400 }
      );
    }
    if (new Date(arrivalDate).getTime() < new Date(departureDate).getTime()) {
      return NextResponse.json(
        { success: false, message: "Arrival (ETDA) must be at or after Departure (ETD)." },
        { status: 400 }
      );
    }

    const userId = await getUserIdFromToken();
    const nowPht = formatPhtDateTime();

    // 1. Update header
    const headerPatch: Record<string, unknown> = {
      branch_id: branchId,
      vehicle_id: vehicleId && vehicleId > 0 ? vehicleId : null,
      driver_id: is3PL ? (driverId || null) : driverId,
      helper_id: is3PL ? (helperId || null) : helperId,
      dispatch_date: departureDate,
      departure_date: departureDate,
      arrival_date: arrivalDate,
      remarks: remarks || null,
      total_amount: totalAmount,
    };

    if (existing.status === "Rejected" && resubmit) {
      headerPatch.status = "Pending";
      headerPatch.rejection_reason = null;
      headerPatch.reject_remarks = null;
    }

    const patchRes = await fetch(`${DIRECTUS_URL}/items/dispatch_plan/${dispatchId}`, {
      method: "PATCH",
      headers: directusHeaders,
      body: JSON.stringify(headerPatch),
    });

    if (!patchRes.ok) {
      const errTxt = await patchRes.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          message: sanitizeDirectusError(errTxt, patchRes.status),
        },
        { status: patchRes.status }
      );
    }

    // 2. Sync Sales Orders if supplied
    if (Array.isArray(body.sales_order_ids)) {
      const newOrderIds: number[] = Array.from(
        new Set(body.sales_order_ids.map(Number).filter((n: number) => !Number.isNaN(n) && n > 0))
      );

      if (newOrderIds.length === 0) {
        return NextResponse.json(
          { success: false, message: "At least one Sales Order is required." },
          { status: 400 }
        );
      }

      const existingDetails = await directusGet<RawDispatchDetailRow>(
        `/items/dispatch_plan_details?filter[dispatch_id][_eq]=${dispatchId}&limit=-1&fields=detail_id,dispatch_id,sales_order_id`
      );
      const oldOrderIds = existingDetails.map((d) => Number(d.sales_order_id));

      const removedDetails = existingDetails.filter(
        (d) => !newOrderIds.includes(Number(d.sales_order_id))
      );
      const addedOrderIds = newOrderIds.filter((soId) => !oldOrderIds.includes(soId));

      // Remove detached junction links for this pending edit & revert SO status -> 'For Loading'
      if (removedDetails.length > 0) {
        await Promise.all(
          removedDetails.map(async (d) => {
            await fetch(`${DIRECTUS_URL}/items/dispatch_plan_details/${d.detail_id}`, {
              method: "DELETE",
              headers: directusHeaders,
            });
            const soRevert: Record<string, unknown> = {
              order_status: "For Loading",
              modified_date: nowPht,
            };
            if (userId) soRevert.modified_by = userId;
            await fetch(`${DIRECTUS_URL}/items/sales_order/${d.sales_order_id}`, {
              method: "PATCH",
              headers: directusHeaders,
              body: JSON.stringify(soRevert),
            });
          })
        );
      }

      // Insert newly added SOs
      if (addedOrderIds.length > 0) {
        const addPayload = addedOrderIds.map((soId) => ({
          dispatch_id: dispatchId,
          sales_order_id: soId,
        }));
        const addRes = await fetch(`${DIRECTUS_URL}/items/dispatch_plan_details`, {
          method: "POST",
          headers: directusHeaders,
          body: JSON.stringify(addPayload),
        });
        if (!addRes.ok) {
          const errTxt = await addRes.text().catch(() => "");
          return NextResponse.json(
            { success: false, message: `Failed to add Sales Orders: ${errTxt}` },
            { status: addRes.status }
          );
        }
      }

      // Ensure added SOs (or all SOs on resubmission from Rejected) are set to 'For Shipping'
      const toMarkShipping =
        existing.status === "Rejected" && resubmit ? newOrderIds : addedOrderIds;
      if (toMarkShipping.length > 0) {
        await Promise.all(
          toMarkShipping.map(async (soId) => {
            const soPatch: Record<string, unknown> = {
              order_status: "For Shipping",
              modified_date: nowPht,
            };
            if (userId) soPatch.modified_by = userId;
            await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, {
              method: "PATCH",
              headers: directusHeaders,
              body: JSON.stringify(soPatch),
            });
          })
        );
      }
    }

    // 3. Sync Budget Rows if supplied
    if (Array.isArray(body.budget_rows)) {
      const existingBudgets = await directusGet<RawDispatchBudgetRow>(
        `/items/dispatch_plan_budget?filter[dispatch_plan_id][_eq]=${dispatchId}&limit=-1&fields=id,dispatch_plan_id,coa_id,amount,remarks`
      );
      const incomingRows: Array<{ id?: number; coa_id: number; amount: number; remarks?: string }> =
        body.budget_rows;
      const keepIds = new Set(
        incomingRows.map((r) => Number(r.id)).filter((n) => !Number.isNaN(n) && n > 0)
      );

      // Update existing rows in place, insert new rows, remove dropped rows
      await Promise.all([
        ...existingBudgets
          .filter((eb) => !keepIds.has(Number(eb.id)))
          .map((eb) =>
            fetch(`${DIRECTUS_URL}/items/dispatch_plan_budget/${eb.id}`, {
              method: "DELETE",
              headers: directusHeaders,
            })
          ),
        ...incomingRows
          .filter((r) => r.id && keepIds.has(Number(r.id)))
          .map((r) =>
            fetch(`${DIRECTUS_URL}/items/dispatch_plan_budget/${r.id}`, {
              method: "PATCH",
              headers: directusHeaders,
              body: JSON.stringify({
                coa_id: Number(r.coa_id),
                amount: Number(r.amount),
                remarks: r.remarks?.trim() || null,
              }),
            })
          ),
      ]);

      const newBudgets = incomingRows
        .filter((r) => !r.id)
        .map((r) => ({
          dispatch_plan_id: dispatchId,
          coa_id: Number(r.coa_id),
          amount: Number(r.amount),
          remarks: r.remarks?.trim() || null,
        }));

      if (newBudgets.length > 0) {
        await fetch(`${DIRECTUS_URL}/items/dispatch_plan_budget`, {
          method: "POST",
          headers: directusHeaders,
          body: JSON.stringify(newBudgets),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Dispatch Plan API] PATCH /creation/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to update dispatch plan",
      },
      { status: 500 }
    );
  }
}
