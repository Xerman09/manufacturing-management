import { NextRequest, NextResponse } from "next/server";
import {
  directusGet,
  enrichDispatchPlanList,
  parseBitFlag,
  type RawDispatchPlanRow,
} from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/sales-and-fulfillment/dispatch-plan/approval
 * Lists dispatch plans for the Approval queue (Pending, Approved, Rejected).
 * Paginates BEFORE enriching details/sales_orders to prevent overloading Directus.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const branchIdParam = searchParams.get("branchId");
    const branchId = branchIdParam ? Number(branchIdParam) : null;
    const status = (searchParams.get("status") || "Pending").trim();
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
    console.error("[Dispatch Plan API] GET /approval error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to load dispatch plans for approval",
      },
      { status: 500 }
    );
  }
}
