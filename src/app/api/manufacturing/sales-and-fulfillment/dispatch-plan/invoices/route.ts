import { NextRequest, NextResponse } from "next/server";
import {
  directusGet,
  fetchInvoicesForOrders,
  getInvoicesForOrder,
  parseBitFlag,
  type RawBranchRow,
  type RawCustomerRow,
  type RawDispatchDetailRow,
  type RawDispatchPlanRow,
  type RawSalesOrderRow,
} from "../_helpers";
import type { EligibleSalesOrder } from "@/modules/manufacturing-management/sales-and-fulfillment/dispatch-plan/shared.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/sales-and-fulfillment/dispatch-plan/invoices
 * Fetches eligible Sales Orders (order_status = 'For Loading') and their linked invoices
 * that are not yet assigned to an active (non-Rejected, non-deleted) dispatch plan.
 *
 * Queries ONLY the candidate 'For Loading' orders first, then checks dispatch_plan_details
 * scoped to those specific order IDs (no full-table scans on dispatch_plan_details).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const branchIdParam = searchParams.get("branchId");
    const branchId = branchIdParam ? Number(branchIdParam) : null;
    const includeDispatchIdParam = searchParams.get("includeDispatchId");
    const includeDispatchId = includeDispatchIdParam ? Number(includeDispatchIdParam) : null;

    // A branch must be selected before showing candidate sales orders (unless loading an existing dispatch)
    if ((!branchId || Number.isNaN(branchId)) && (!includeDispatchId || Number.isNaN(includeDispatchId))) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 1. Fetch Sales Orders in 'For Loading' status (+ any orders already on includeDispatchId)
    const soFilter: Record<string, unknown> = {
      order_status: { _eq: "For Loading" },
    };
    if (branchId && !Number.isNaN(branchId)) {
      soFilter.branch_id = { _eq: branchId };
    }

    const forLoadingQs = new URLSearchParams({
      filter: JSON.stringify(soFilter),
      limit: "-1",
      sort: "-created_date,-order_id",
      fields:
        "order_id,order_no,customer_code,branch_id,order_status,total_amount,net_amount,created_date,order_date",
    });

    const [forLoadingOrders, currentPlanDetails] = await Promise.all([
      directusGet<RawSalesOrderRow>(`/items/sales_order?${forLoadingQs.toString()}`),
      includeDispatchId && !Number.isNaN(includeDispatchId)
        ? directusGet<RawDispatchDetailRow>(
            `/items/dispatch_plan_details?filter[dispatch_id][_eq]=${includeDispatchId}&limit=-1&fields=detail_id,dispatch_id,sales_order_id`
          )
        : Promise.resolve([]),
    ]);

    const currentPlanOrderIds = Array.from(
      new Set(currentPlanDetails.map((d) => Number(d.sales_order_id)).filter(Boolean))
    );

    const includedOrders =
      currentPlanOrderIds.length > 0
        ? await directusGet<RawSalesOrderRow>(
            `/items/sales_order?filter[order_id][_in]=${currentPlanOrderIds.join(
              ","
            )}&limit=-1&fields=order_id,order_no,customer_code,branch_id,order_status,total_amount,net_amount,created_date,order_date`
          )
        : [];

    // 2. Check dispatch_plan_details ONLY for the 'For Loading' order IDs
    const assignedOrderIds = new Set<number>();
    const forLoadingIds = forLoadingOrders.map((o) => Number(o.order_id)).filter(Boolean);

    if (forLoadingIds.length > 0) {
      const existingLinks: RawDispatchDetailRow[] = [];
      const chunkSize = 50;
      for (let i = 0; i < forLoadingIds.length; i += chunkSize) {
        const chunk = forLoadingIds.slice(i, i + chunkSize);
        const rows = await directusGet<RawDispatchDetailRow>(
          `/items/dispatch_plan_details?filter[sales_order_id][_in]=${chunk.join(
            ","
          )}&limit=-1&fields=detail_id,dispatch_id,sales_order_id`
        );
        existingLinks.push(...rows);
      }

      const candidatePlanIds = Array.from(
        new Set(
          existingLinks
            .map((l) => Number(l.dispatch_id))
            .filter((id) => id > 0 && id !== includeDispatchId)
        )
      );

      if (candidatePlanIds.length > 0) {
        const linkedPlans = await directusGet<RawDispatchPlanRow>(
          `/items/dispatch_plan?filter[dispatch_id][_in]=${candidatePlanIds.join(
            ","
          )}&limit=-1&fields=dispatch_id,status,is_delete`
        );
        const activePlanIds = new Set(
          linkedPlans
            .filter((p) => !parseBitFlag(p.is_delete) && p.status !== "Rejected")
            .map((p) => Number(p.dispatch_id))
        );

        for (const link of existingLinks) {
          if (activePlanIds.has(Number(link.dispatch_id))) {
            assignedOrderIds.add(Number(link.sales_order_id));
          }
        }
      }
    }

    // Merge and deduplicate eligible orders
    const orderMap = new Map<number, RawSalesOrderRow>();
    for (const o of includedOrders) {
      orderMap.set(Number(o.order_id), o);
    }
    for (const o of forLoadingOrders) {
      const oId = Number(o.order_id);
      if (!assignedOrderIds.has(oId)) {
        orderMap.set(oId, o);
      }
    }

    const candidateOrders = Array.from(orderMap.values());
    if (candidateOrders.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 3. Concurrently enrich with customers, branches, and sales_invoice records
    const customerCodes = Array.from(
      new Set(candidateOrders.map((o) => o.customer_code).filter(Boolean))
    );
    const branchIds = Array.from(
      new Set(
        candidateOrders
          .map((o) => Number(o.branch_id))
          .filter((n) => !Number.isNaN(n) && n > 0)
      )
    );

    const [customers, branches, invoiceMap] = await Promise.all([
      customerCodes.length > 0
        ? directusGet<RawCustomerRow>(
            `/items/customer?filter[customer_code][_in]=${customerCodes
              .map((c) => encodeURIComponent(c))
              .join(",")}&limit=-1&fields=customer_code,customer_name,store_name,city`
          )
        : Promise.resolve([]),
      branchIds.length > 0
        ? directusGet<RawBranchRow>(
            `/items/branches?filter[id][_in]=${branchIds.join(
              ","
            )}&limit=-1&fields=id,branch_name,branch_code`
          )
        : Promise.resolve([]),
      fetchInvoicesForOrders(candidateOrders),
    ]);

    const customerMap = new Map(customers.map((c) => [c.customer_code, c]));
    const branchMap = new Map(branches.map((b) => [Number(b.id), b.branch_name]));

    let results: EligibleSalesOrder[] = candidateOrders.map((o) => {
      const oId = Number(o.order_id);
      const cust = customerMap.get(o.customer_code);
      const invs = getInvoicesForOrder(invoiceMap, oId, o.order_no);
      const computedAmount =
        invs.length > 0
          ? invs.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
          : Number(o.total_amount ?? o.net_amount ?? 0);

      return {
        order_id: oId,
        order_no: o.order_no,
        order_status: o.order_status,
        customer_code: o.customer_code,
        customer_name: cust?.customer_name || o.customer_code || "-",
        store_name: cust?.store_name || cust?.customer_name || o.customer_code || "-",
        city: cust?.city || "-",
        branch_id: Number(o.branch_id || 0),
        branch_name: o.branch_id ? branchMap.get(Number(o.branch_id)) || "-" : "-",
        total_amount: computedAmount,
        created_date: o.created_date ?? o.order_date ?? null,
        invoices: invs,
      };
    });

    if (search) {
      results = results.filter(
        (item) =>
          item.order_no.toLowerCase().includes(search) ||
          item.customer_name.toLowerCase().includes(search) ||
          item.store_name.toLowerCase().includes(search) ||
          item.customer_code.toLowerCase().includes(search) ||
          item.city.toLowerCase().includes(search) ||
          item.invoices.some((inv) => inv.invoice_no.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("[Dispatch Plan API] GET /invoices error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to fetch eligible sales orders",
      },
      { status: 500 }
    );
  }
}
