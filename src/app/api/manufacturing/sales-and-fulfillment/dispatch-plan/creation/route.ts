import { NextRequest, NextResponse } from "next/server";
import {
  DIRECTUS_URL,
  headers as directusHeaders,
  formatPhtDateTime,
} from "@/app/api/manufacturing/directus-api";
import {
  directusGet,
  enrichDispatchPlanList,
  generateDispatchNo,
  getUserIdFromToken,
  parseBitFlag,
  sanitizeDirectusError,
  type RawDispatchDetailRow,
  type RawDispatchPlanRow,
  type RawSalesOrderRow,
} from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/sales-and-fulfillment/dispatch-plan/creation
 * Paginated list of dispatch plans (all statuses for the creation view).
 * Paginates BEFORE enriching details/sales_orders to avoid overloading Directus.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const branchIdParam = searchParams.get("branchId");
    const branchId = branchIdParam ? Number(branchIdParam) : null;
    const status = (searchParams.get("status") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.max(
      1,
      Math.min(100, parseInt(searchParams.get("pageSize") || "10", 10) || 10)
    );

    const qs = new URLSearchParams({
      limit: "-1",
      sort: "-created_at,-dispatch_id",
      fields: "*",
      "filter[status][_in]": "Pending,Approved,Dispatched,Rejected",
    });
    if (branchId && !Number.isNaN(branchId)) {
      qs.set("filter[branch_id][_eq]", String(branchId));
    }

    const rawPlans = await directusGet<RawDispatchPlanRow>(
      `/items/dispatch_plan?${qs.toString()}`
    );

    // Only show Pending/For Approval, Approved/Dispatched, and Rejected/Returned (exclude legacy Picking/Picked)
    const activeRows = rawPlans.filter(
      (r) =>
        !parseBitFlag(r.is_delete) &&
        (r.status === "Pending" ||
          r.status === "For Approval" ||
          r.status === "Approved" ||
          r.status === "Dispatched" ||
          r.status === "Rejected" ||
          r.status === "Returned for Correction")
    );

    const counts = {
      all: activeRows.length,
      Pending: activeRows.filter(
        (r) => r.status === "Pending" || r.status === "For Approval"
      ).length,
      Approved: activeRows.filter(
        (r) => r.status === "Approved" || r.status === "Dispatched"
      ).length,
      Rejected: activeRows.filter(
        (r) => r.status === "Rejected" || r.status === "Returned for Correction"
      ).length,
    };

    let candidates =
      status && status !== "All"
        ? activeRows.filter((r) => {
            if (status === "Pending" || status === "For Approval") {
              return r.status === "Pending" || r.status === "For Approval";
            }
            if (status === "Approved" || status === "Dispatched") {
              return r.status === "Approved" || r.status === "Dispatched";
            }
            if (status === "Rejected" || status === "Returned for Correction") {
              return r.status === "Rejected" || r.status === "Returned for Correction";
            }
            return r.status === status;
          })
        : activeRows;

    // Lightweight search before pagination (matches dispatch_no, remarks, branch_name, driver/helper name)
    if (search && candidates.length > 0) {
      const branchIds = Array.from(
        new Set(candidates.map((r) => Number(r.branch_id)).filter((n) => !Number.isNaN(n) && n > 0))
      );
      const userIds = Array.from(
        new Set(
          candidates
            .flatMap((r) => [r.driver_id, r.helper_id])
            .map((id) => Number(id))
            .filter((n) => !Number.isNaN(n) && n > 0)
        )
      );

      const [branches, users] = await Promise.all([
        branchIds.length > 0
          ? directusGet<{ id: number; branch_name: string }>(
              `/items/branches?filter[id][_in]=${branchIds.join(",")}&limit=-1&fields=id,branch_name`
            )
          : Promise.resolve([]),
        userIds.length > 0
          ? directusGet<{ user_id: number; user_fname?: string | null; user_lname?: string | null }>(
              `/items/user?filter[user_id][_in]=${userIds.join(",")}&limit=-1&fields=user_id,user_fname,user_lname`
            )
          : Promise.resolve([]),
      ]);

      const branchMap = new Map(branches.map((b) => [Number(b.id), (b.branch_name || "").toLowerCase()]));
      const userMap = new Map(
        users.map((u) => [
          Number(u.user_id),
          [u.user_fname, u.user_lname].filter(Boolean).join(" ").toLowerCase(),
        ])
      );

      candidates = candidates.filter((r) => {
        const bName = r.branch_id ? branchMap.get(Number(r.branch_id)) || "" : "";
        const dName = r.driver_id ? userMap.get(Number(r.driver_id)) || "" : "";
        const hName = r.helper_id ? userMap.get(Number(r.helper_id)) || "" : "";
        return (
          (r.dispatch_no || "").toLowerCase().includes(search) ||
          (r.remarks || "").toLowerCase().includes(search) ||
          bName.includes(search) ||
          dName.includes(search) ||
          hName.includes(search)
        );
      });
    }

    // Paginate FIRST, then enrich ONLY the current page slice
    const total = candidates.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIdx = (page - 1) * pageSize;
    const pageRows = candidates.slice(startIdx, startIdx + pageSize);

    const paginated = await enrichDispatchPlanList(pageRows);

    return NextResponse.json({
      success: true,
      data: paginated,
      total,
      page,
      pageSize,
      totalPages,
      counts,
    });
  } catch (error) {
    console.error("[Dispatch Plan API] GET /creation error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to load dispatch plans",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/manufacturing/sales-and-fulfillment/dispatch-plan/creation
 * Creates a new dispatch plan (status = 'Pending'), links SOs in dispatch_plan_details,
 * inserts COA budget rows in dispatch_plan_budget, and updates linked sales_order
 * status from 'For Loading' -> 'For Shipping'.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const branchId = Number(body.branch_id);
    const vehicleId =
      body.vehicle_id !== undefined && body.vehicle_id !== null
        ? Number(body.vehicle_id)
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

    const driverId = body.driver_id ? Number(body.driver_id) : null;
    const helperId = body.helper_id ? Number(body.helper_id) : null;
    const departureDate = typeof body.departure_date === "string" ? body.departure_date.trim() : "";
    const arrivalDate = typeof body.arrival_date === "string" ? body.arrival_date.trim() : "";
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : "";
    const totalAmount = Number(body.total_amount ?? 0);
    const salesOrderIds: number[] = Array.isArray(body.sales_order_ids)
      ? Array.from(new Set(body.sales_order_ids.map(Number).filter((n: number) => !Number.isNaN(n) && n > 0)))
      : [];
    const budgetRows: Array<{ coa_id: number; amount: number; remarks?: string }> = Array.isArray(
      body.budget_rows
    )
      ? body.budget_rows
      : [];

    // Strict validation — halt on null/missing required fields
    if (!branchId || Number.isNaN(branchId)) {
      return NextResponse.json(
        { success: false, message: "Source Branch is required." },
        { status: 400 }
      );
    }
    if (!is3PL) {
      if (!driverId || Number.isNaN(driverId)) {
        return NextResponse.json(
          { success: false, message: "Driver is required for internal vehicles." },
          { status: 400 }
        );
      }
      if (!helperId || Number.isNaN(helperId)) {
        return NextResponse.json(
          { success: false, message: "Helper is required for internal vehicles." },
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
    if (salesOrderIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "Select at least one Sales Order / Invoice." },
        { status: 400 }
      );
    }

    for (const row of budgetRows) {
      if (!row.coa_id || Number(row.coa_id) <= 0 || Number.isNaN(Number(row.amount)) || Number(row.amount) < 0) {
        return NextResponse.json(
          { success: false, message: "Each budget row must have a valid COA and non-negative amount." },
          { status: 400 }
        );
      }
    }

    // Verify all selected SOs are still 'For Loading' and unassigned
    const [selectedOrders, existingLinks] = await Promise.all([
      directusGet<RawSalesOrderRow>(
        `/items/sales_order?filter[order_id][_in]=${salesOrderIds.join(
          ","
        )}&limit=-1&fields=order_id,order_no,order_status`
      ),
      directusGet<RawDispatchDetailRow>(
        `/items/dispatch_plan_details?filter[sales_order_id][_in]=${salesOrderIds.join(
          ","
        )}&limit=-1&fields=detail_id,dispatch_id,sales_order_id`
      ),
    ]);

    if (selectedOrders.length !== salesOrderIds.length) {
      return NextResponse.json(
        { success: false, message: "One or more selected Sales Orders could not be found." },
        { status: 400 }
      );
    }

    const invalidStatusOrders = selectedOrders.filter((o) => o.order_status !== "For Loading");
    if (invalidStatusOrders.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot include orders not in 'For Loading' status: ${invalidStatusOrders
            .map((o) => `${o.order_no} (${o.order_status})`)
            .join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (existingLinks.length > 0) {
      const linkedPlanIds = Array.from(new Set(existingLinks.map((l) => Number(l.dispatch_id))));
      const linkedPlans = await directusGet<RawDispatchPlanRow>(
        `/items/dispatch_plan?filter[dispatch_id][_in]=${linkedPlanIds.join(
          ","
        )}&limit=-1&fields=dispatch_id,dispatch_no,status,is_delete`
      );
      const activeConflicts = linkedPlans.filter(
        (p) => !parseBitFlag(p.is_delete) && p.status !== "Rejected"
      );
      if (activeConflicts.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: `One or more selected Sales Orders are already assigned to active Dispatch Plan(s): ${activeConflicts
              .map((p) => p.dispatch_no)
              .join(", ")}`,
          },
          { status: 409 }
        );
      }
    }

    const [userId, dispatchNo] = await Promise.all([
      getUserIdFromToken(),
      generateDispatchNo(),
    ]);
    const nowPht = formatPhtDateTime();

    // 1. Create dispatch_plan header
    const headerPayload: Record<string, unknown> = {
      dispatch_no: dispatchNo,
      dispatch_date: departureDate,
      departure_date: departureDate,
      arrival_date: arrivalDate,
      branch_id: branchId,
      vehicle_id: vehicleId && vehicleId > 0 ? vehicleId : null,
      driver_id: is3PL ? (driverId || null) : driverId,
      helper_id: is3PL ? (helperId || null) : helperId,
      status: "Pending",
      total_amount: totalAmount,
      remarks: remarks || null,
      created_at: nowPht,
      is_delete: 0,
    };
    if (userId) headerPayload.created_by = userId;

    const createRes = await fetch(`${DIRECTUS_URL}/items/dispatch_plan`, {
      method: "POST",
      headers: directusHeaders,
      body: JSON.stringify(headerPayload),
    });

    if (!createRes.ok) {
      const errTxt = await createRes.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          message: sanitizeDirectusError(errTxt, createRes.status),
        },
        { status: createRes.status }
      );
    }

    const createdPlan = (await createRes.json()).data;
    const newDispatchId = Number(createdPlan.dispatch_id);

    // 2. Insert dispatch_plan_details (one row per SO)
    const detailPayloads = salesOrderIds.map((soId) => ({
      dispatch_id: newDispatchId,
      sales_order_id: soId,
    }));

    const detailRes = await fetch(`${DIRECTUS_URL}/items/dispatch_plan_details`, {
      method: "POST",
      headers: directusHeaders,
      body: JSON.stringify(detailPayloads),
    });

    if (!detailRes.ok) {
      const errTxt = await detailRes.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          message: `Dispatch plan ${dispatchNo} created, but failed to link Sales Orders: ${errTxt}`,
        },
        { status: detailRes.status }
      );
    }

    // 3. Insert dispatch_plan_budget rows (if provided)
    if (budgetRows.length > 0) {
      const budgetPayloads = budgetRows.map((b) => ({
        dispatch_plan_id: newDispatchId,
        coa_id: Number(b.coa_id),
        amount: Number(b.amount),
        remarks: b.remarks?.trim() || null,
      }));
      const budgetRes = await fetch(`${DIRECTUS_URL}/items/dispatch_plan_budget`, {
        method: "POST",
        headers: directusHeaders,
        body: JSON.stringify(budgetPayloads),
      });
      if (!budgetRes.ok) {
        const errTxt = await budgetRes.text().catch(() => "");
        return NextResponse.json(
          {
            success: false,
            message: `Dispatch plan ${dispatchNo} created, but failed to save budget rows: ${errTxt}`,
          },
          { status: budgetRes.status }
        );
      }
    }

    // 4. Transition linked Sales Orders: 'For Loading' -> 'For Shipping'
    await Promise.all(
      salesOrderIds.map(async (soId) => {
        const soPatch: Record<string, unknown> = {
          order_status: "For Shipping",
          modified_date: nowPht,
        };
        if (userId) soPatch.modified_by = userId;
        const r = await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, {
          method: "PATCH",
          headers: directusHeaders,
          body: JSON.stringify(soPatch),
        });
        if (!r.ok) {
          const errTxt = await r.text().catch(() => "");
          throw new Error(`Failed to update Sales Order #${soId} to For Shipping: ${errTxt}`);
        }
      })
    );

    return NextResponse.json(
      {
        success: true,
        dispatch_id: newDispatchId,
        dispatch_no: dispatchNo,
        status: "Pending",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Dispatch Plan API] POST /creation error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to create dispatch plan",
      },
      { status: 500 }
    );
  }
}
