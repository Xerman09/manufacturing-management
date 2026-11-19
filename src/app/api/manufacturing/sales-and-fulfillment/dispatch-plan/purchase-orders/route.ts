import { NextRequest, NextResponse } from "next/server";
import { directusGet } from "../_helpers";
import type { PurchaseOrderOption } from "@/modules/manufacturing-management/sales-and-fulfillment/dispatch-plan/shared.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RawPoRow {
  purchase_order_id: number;
  purchase_order_no: string;
  date?: string | null;
  supplier_name?: string | number | null;
  total_amount?: number | null;
  inventory_status?: string | number | null;
  branch_id?: number | null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("query") || "").trim();
    const branchId = searchParams.get("branchId");

    const qs = new URLSearchParams({
      fields: "purchase_order_id,purchase_order_no,date,supplier_name,total_amount,inventory_status,branch_id",
      limit: "50",
      sort: "-date,-purchase_order_id",
    });

    if (query) {
      qs.set("filter[purchase_order_no][_icontains]", query);
    }
    if (branchId && branchId !== "All" && !Number.isNaN(Number(branchId))) {
      qs.set("filter[branch_id][_eq]", branchId);
    }

    const [posRaw, transStatusRaw] = await Promise.all([
      directusGet<RawPoRow>(`/items/purchase_order?${qs.toString()}`).catch(() => [] as RawPoRow[]),
      directusGet<{ id: number; status: string }>("/items/transaction_status?limit=-1&fields=id,status").catch(
        () => [] as { id: number; status: string }[]
      ),
    ]);

    const statusMap = new Map(transStatusRaw.map((s) => [Number(s.id), s.status]));

    const data: PurchaseOrderOption[] = posRaw.map((po) => {
      let resolvedStatus = "Not Fulfilled";
      if (typeof po.inventory_status === "string" && po.inventory_status.trim()) {
        resolvedStatus = po.inventory_status;
      } else if (po.inventory_status !== undefined && po.inventory_status !== null) {
        resolvedStatus = statusMap.get(Number(po.inventory_status)) || `Status ${po.inventory_status}`;
      }

      return {
        purchase_order_id: Number(po.purchase_order_id),
        purchase_order_no: po.purchase_order_no || `PO #${po.purchase_order_id}`,
        date: po.date || null,
        supplier_name: po.supplier_name || null,
        total_amount: po.total_amount ? Number(po.total_amount) : 0,
        inventory_status: resolvedStatus,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Dispatch Plan API] GET /purchase-orders error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to load purchase orders",
        data: [],
      },
      { status: 500 }
    );
  }
}
