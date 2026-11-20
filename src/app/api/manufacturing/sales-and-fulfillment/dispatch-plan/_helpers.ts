import { cookies } from "next/headers";
import {
  DIRECTUS_URL,
  headers as directusHeaders,
  getTodayDateString,
} from "@/app/api/manufacturing/directus-api";
import type {
  DispatchPlanDetail,
  DispatchPlanListItem,
  DispatchPlanSalesOrderRef,
  DispatchPlanStatus,
  DispatchPlanBudgetRow,
  EligibleInvoice,
} from "@/modules/manufacturing-management/sales-and-fulfillment/dispatch-plan/shared.types";

export const LOCKED_VEHICLE_LABEL = "3rd Party Logistics";

export interface RawDispatchPlanRow {
  dispatch_id: number;
  dispatch_no: string;
  dispatch_date?: string | null;
  driver_id?: number | null;
  helper_id?: number | null;
  vehicle_id?: number | null;
  branch_id?: number | null;
  created_at?: string | null;
  created_by?: number | null;
  status: DispatchPlanStatus;
  total_amount?: number | null;
  cluster_id?: number | null;
  remarks?: string | null;
  reject_remarks?: string | null;
  rejection_reason?: string | null;
  approved_by?: number | null;
  approved_at?: string | null;
  rejected_by?: number | null;
  rejected_at?: string | null;
  departure_date?: string | null;
  arrival_date?: string | null;
  is_delete?: number | boolean | { type?: string; data?: number[] } | null;
}

export interface RawSalesOrderRow {
  order_id: number;
  order_no: string;
  customer_code: string;
  branch_id: number | null;
  order_status: string;
  total_amount?: number | null;
  net_amount?: number | null;
  created_date?: string | null;
  order_date?: string | null;
}

export interface RawSalesInvoiceRow {
  invoice_id: number;
  order_id: string | number | Record<string, unknown> | null;
  invoice_no: string | null;
  total_amount?: number | null;
  net_amount?: number | null;
  transaction_status?: string | null;
  invoice_date?: string | null;
  isDispatched?: number | boolean | { type?: string; data?: number[] } | null;
}

export interface RawUserRow {
  user_id: number;
  user_fname?: string | null;
  user_lname?: string | null;
  user_department?: number | null;
  user_position?: string | null;
}

export interface RawBranchRow {
  id: number;
  branch_name: string;
  branch_code?: string | null;
}

export interface RawCustomerRow {
  customer_code: string;
  customer_name?: string | null;
  store_name?: string | null;
  city?: string | null;
}

export interface RawDispatchDetailRow {
  detail_id: number;
  dispatch_id: number;
  sales_order_id: number;
}

export interface RawDispatchBudgetRow {
  id: number;
  dispatch_plan_id: number;
  coa_id: number | null;
  remarks: string | null;
  amount: number | null;
}

export function parseBitFlag(val: unknown): boolean {
  if (val === true || val === 1 || val === "1") return true;
  if (val && typeof val === "object" && "data" in val) {
    const data = (val as { data?: number[] }).data;
    if (Array.isArray(data) && data.length > 0) return data[0] === 1;
  }
  return false;
}

export function formatUserName(u?: RawUserRow | null): string {
  if (!u) return "-";
  const name = [u.user_fname, u.user_lname].filter(Boolean).join(" ").trim();
  return name || "-";
}

export async function getUserIdFromToken(): Promise<number | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const p = parts[1];
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return Number(payload.user_id || payload.userId || payload.sub) || null;
  } catch {
    return null;
  }
}

export function sanitizeDirectusError(errTxt: string, status?: number): string {
  const lower = (errTxt || "").toLowerCase();
  if (
    status === 503 ||
    lower.includes("under pressure") ||
    lower.includes("service_unavailable") ||
    lower.includes("unavailable")
  ) {
    return "System / API Under Pressure. Please retry in a few moments.";
  }
  if (status === 401 || status === 403 || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return "Session expired or unauthorized. Please re-authenticate.";
  }
  if (status === 404) {
    return "Requested record or resource not found.";
  }
  if (status && status >= 500) {
    return "Service temporarily unavailable. Please retry shortly.";
  }
  try {
    const parsed = JSON.parse(errTxt);
    if (parsed.errors && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      const msg = parsed.errors[0]?.message;
      if (typeof msg === "string" && msg.trim()) {
        if (msg.toLowerCase().includes("under pressure")) {
          return "System / API Under Pressure. Please retry in a few moments.";
        }
        return msg;
      }
    }
  } catch {
    // not JSON
  }
  return "An unexpected error occurred while communicating with the data service.";
}

export async function directusGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    headers: directusHeaders,
    cache: "no-store",
  });
  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    console.error(`[Directus GET Error] ${path} (HTTP ${res.status}):`, errTxt);
    throw new Error(sanitizeDirectusError(errTxt, res.status));
  }
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

export async function directusGetOne<T>(path: string): Promise<T | null> {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    headers: directusHeaders,
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    console.error(`[Directus GET Error] ${path} (HTTP ${res.status}):`, errTxt);
    throw new Error(sanitizeDirectusError(errTxt, res.status));
  }
  const json = await res.json();
  return json.data ?? null;
}

export async function generateDispatchNo(): Promise<string> {
  const todayStr = await getTodayDateString();
  const todayCompact = todayStr.replace(/-/g, "");
  const prefix = `DP-${todayCompact}-`;
  try {
    const rows = await directusGet<{ dispatch_no: string }>(
      `/items/dispatch_plan?filter[dispatch_no][_starts_with]=${encodeURIComponent(
        prefix
      )}&sort=-dispatch_no&limit=1&fields=dispatch_no`
    );
    if (rows.length > 0 && rows[0].dispatch_no) {
      const tail = rows[0].dispatch_no.slice(prefix.length);
      const parsed = parseInt(tail, 10);
      if (!Number.isNaN(parsed)) {
        return `${prefix}${String(parsed + 1).padStart(4, "0")}`;
      }
    }
  } catch (err) {
    console.warn("[Dispatch Plan] Failed to sequence dispatch_no, falling back to timestamp suffix:", err);
  }
  return `${prefix}0001`;
}

/**
 * Indexes `sales_invoice` rows by both numeric `order_id` and lowercase string `order_no`
 * because `sales_invoice.order_id` is varchar(255) and may store either identifier.
 */
export function indexInvoicesByOrder(
  invoices: RawSalesInvoiceRow[]
): Map<string, EligibleInvoice[]> {
  const map = new Map<string, EligibleInvoice[]>();

  const add = (key: string, inv: EligibleInvoice) => {
    const norm = key.trim().toLowerCase();
    if (!norm) return;
    const list = map.get(norm) || [];
    if (!list.some((x) => x.invoice_id === inv.invoice_id)) {
      list.push(inv);
      map.set(norm, list);
    }
  };

  for (const raw of invoices) {
    const inv: EligibleInvoice = {
      invoice_id: Number(raw.invoice_id),
      invoice_no: raw.invoice_no ? String(raw.invoice_no).trim() : `INV-${raw.invoice_id}`,
      total_amount: Number(raw.total_amount ?? raw.net_amount ?? 0),
      transaction_status: raw.transaction_status ?? null,
      invoice_date: raw.invoice_date ?? null,
    };

    if (typeof raw.order_id === "object" && raw.order_id !== null) {
      const rel = raw.order_id as Record<string, unknown>;
      if (rel.order_id) add(String(rel.order_id), inv);
      if (rel.id) add(String(rel.id), inv);
      if (rel.order_no) add(String(rel.order_no), inv);
    } else if (raw.order_id !== undefined && raw.order_id !== null) {
      add(String(raw.order_id), inv);
    }
  }

  return map;
}

export function getInvoicesForOrder(
  invoiceMap: Map<string, EligibleInvoice[]>,
  orderId: number,
  orderNo: string
): EligibleInvoice[] {
  const seen = new Set<number>();
  const combined: EligibleInvoice[] = [];
  const candidates = [
    ...(invoiceMap.get(String(orderId).toLowerCase()) || []),
    ...(orderNo ? invoiceMap.get(orderNo.trim().toLowerCase()) || [] : []),
  ];
  for (const inv of candidates) {
    if (!seen.has(inv.invoice_id)) {
      seen.add(inv.invoice_id);
      combined.push(inv);
    }
  }
  return combined;
}

export async function fetchInvoicesForOrders(
  orders: Pick<RawSalesOrderRow, "order_id" | "order_no">[]
): Promise<Map<string, EligibleInvoice[]>> {
  if (orders.length === 0) return new Map();

  const keys = Array.from(
    new Set(
      orders
        .flatMap((o) => [String(o.order_id), o.order_no ? o.order_no.trim() : ""])
        .filter(Boolean)
    )
  );

  const allInvoices: RawSalesInvoiceRow[] = [];
  const chunkSize = 80;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const encoded = chunk.map((k) => encodeURIComponent(k)).join(",");
    const rows = await directusGet<RawSalesInvoiceRow>(
      `/items/sales_invoice?filter[order_id][_in]=${encoded}&limit=-1&fields=invoice_id,order_id,invoice_no,total_amount,net_amount,transaction_status,invoice_date,isDispatched`
    );
    allInvoices.push(...rows);
  }

  return indexInvoicesByOrder(allInvoices);
}

/**
 * Enriches a list of raw `dispatch_plan` rows with branch, driver, helper, creator,
 * approver/rejector names, and stop counts.
 */
export async function enrichDispatchPlanList(
  rows: RawDispatchPlanRow[]
): Promise<DispatchPlanListItem[]> {
  if (rows.length === 0) return [];

  const dispatchIds = rows.map((r) => Number(r.dispatch_id)).filter(Boolean);
  const branchIds = Array.from(
    new Set(rows.map((r) => Number(r.branch_id)).filter((n) => !Number.isNaN(n) && n > 0))
  );
  const userIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.driver_id, r.helper_id, r.created_by, r.approved_by, r.rejected_by])
        .map((id) => Number(id))
        .filter((n) => !Number.isNaN(n) && n > 0)
    )
  );
  const vehicleIds = Array.from(
    new Set(rows.map((r) => Number(r.vehicle_id)).filter((n) => !Number.isNaN(n) && n > 0))
  );

  const [branches, users, details, vehiclesRaw] = await Promise.all([
    branchIds.length > 0
      ? directusGet<RawBranchRow>(
          `/items/branches?filter[id][_in]=${branchIds.join(",")}&limit=-1&fields=id,branch_name,branch_code`
        )
      : Promise.resolve([]),
    userIds.length > 0
      ? directusGet<RawUserRow>(
          `/items/user?filter[user_id][_in]=${userIds.join(",")}&limit=-1&fields=user_id,user_fname,user_lname`
        )
      : Promise.resolve([]),
    dispatchIds.length > 0
      ? directusGet<RawDispatchDetailRow>(
          `/items/dispatch_plan_details?filter[dispatch_id][_in]=${dispatchIds.join(
            ","
          )}&limit=-1&fields=detail_id,dispatch_id,sales_order_id`
        )
      : Promise.resolve([]),
    vehicleIds.length > 0
      ? directusGet<{ vehicle_id: number; vehicle_plate: string; name?: string | null }>(
          `/items/vehicles?filter[vehicle_id][_in]=${vehicleIds.join(",")}&limit=-1&fields=vehicle_id,vehicle_plate,name`
        ).catch(() => [] as { vehicle_id: number; vehicle_plate: string; name?: string | null }[])
      : Promise.resolve([]),
  ]);

  const branchMap = new Map(branches.map((b) => [Number(b.id), b.branch_name]));
  const userMap = new Map(users.map((u) => [Number(u.user_id), formatUserName(u)]));
  const vehicleMap = new Map(
    vehiclesRaw.map((v) => {
      const vId = Number(v.vehicle_id);
      const is3PL =
        v.name?.toLowerCase().includes("third party") ||
        v.name?.toLowerCase().includes("3rd party") ||
        v.vehicle_plate?.toLowerCase().includes("3pl") ||
        vId === 245;
      const plate = v.vehicle_plate?.trim();
      const name = v.name?.trim();
      const label = plate
        ? (name ? `${plate} — ${name}` : plate)
        : (name || (is3PL ? "3PL — Third Party Logistics" : `Vehicle #${vId}`));
      return [vId, label];
    })
  );
  const stopCountMap = new Map<number, number>();
  const orderIdsByDispatch = new Map<number, number[]>();
  const allLinkedOrderIds = new Set<number>();

  for (const d of details) {
    const id = Number(d.dispatch_id);
    const soId = Number(d.sales_order_id);
    stopCountMap.set(id, (stopCountMap.get(id) || 0) + 1);
    if (soId) {
      allLinkedOrderIds.add(soId);
      const list = orderIdsByDispatch.get(id) || [];
      list.push(soId);
      orderIdsByDispatch.set(id, list);
    }
  }

  // Resolve linked sales_order.order_status values ONLY for the current batch (paginated slice)
  const orderStatusMap = new Map<number, string>();
  if (allLinkedOrderIds.size > 0) {
    const idsArr = Array.from(allLinkedOrderIds);
    const chunkSize = 50;
    for (let i = 0; i < idsArr.length; i += chunkSize) {
      const chunk = idsArr.slice(i, i + chunkSize);
      const soRows = await directusGet<{ order_id: number; order_status: string }>(
        `/items/sales_order?filter[order_id][_in]=${chunk.join(",")}&limit=-1&fields=order_id,order_status`
      );
      for (const so of soRows) {
        if (so.order_status) {
          orderStatusMap.set(Number(so.order_id), so.order_status);
        }
      }
    }
  }

  return rows.map((r) => {
    const dId = Number(r.dispatch_id);
    const branchId = r.branch_id ? Number(r.branch_id) : null;
    const driverId = r.driver_id ? Number(r.driver_id) : null;
    const helperId = r.helper_id ? Number(r.helper_id) : null;
    const createdBy = r.created_by ? Number(r.created_by) : null;
    const approvedBy = r.approved_by ? Number(r.approved_by) : null;
    const rejectedBy = r.rejected_by ? Number(r.rejected_by) : null;
    const linkedIds = orderIdsByDispatch.get(dId) || [];
    const orderStatuses = Array.from(
      new Set(linkedIds.map((id) => orderStatusMap.get(id)).filter((s): s is string => Boolean(s)))
    );

    return {
      dispatch_id: dId,
      dispatch_no: r.dispatch_no,
      branch_id: branchId,
      branch_name: branchId ? branchMap.get(branchId) || "-" : "-",
      driver_id: driverId,
      driver_name: driverId ? userMap.get(driverId) || "-" : "-",
      helper_id: helperId,
      helper_name: helperId ? userMap.get(helperId) || "-" : "-",
      vehicle_id: r.vehicle_id ? Number(r.vehicle_id) : null,
      vehicle_name:
        r.vehicle_id && vehicleMap.has(Number(r.vehicle_id))
          ? vehicleMap.get(Number(r.vehicle_id))!
          : LOCKED_VEHICLE_LABEL,
      departure_date: r.departure_date ?? r.dispatch_date ?? null,
      arrival_date: r.arrival_date ?? null,
      total_amount: r.total_amount !== null && r.total_amount !== undefined ? Number(r.total_amount) : null,
      total_weight: null,
      status: r.status,
      order_statuses: orderStatuses,
      created_at: r.created_at ?? null,
      created_by: createdBy,
      created_by_name: createdBy ? userMap.get(createdBy) || "-" : "-",
      approved_by: approvedBy,
      approved_by_name: approvedBy ? userMap.get(approvedBy) || null : null,
      approved_at: r.approved_at ?? null,
      rejected_by: rejectedBy,
      rejected_by_name: rejectedBy ? userMap.get(rejectedBy) || null : null,
      rejected_at: r.rejected_at ?? null,
      rejection_reason: r.rejection_reason ?? r.reject_remarks ?? null,
      remarks: r.remarks ?? null,
      stop_count: stopCountMap.get(dId) || 0,
    };
  });
}

/**
 * Fetches full detail of a single dispatch plan including linked sales orders,
 * linked invoices, customer info, and COA budget rows.
 */
export async function fetchFullDispatchPlanDetail(
  dispatchId: number
): Promise<DispatchPlanDetail | null> {
  const row = await directusGetOne<RawDispatchPlanRow>(
    `/items/dispatch_plan/${dispatchId}?fields=*`
  );
  if (!row || parseBitFlag(row.is_delete)) return null;

  const [enrichedList, details, rawBudgets] = await Promise.all([
    enrichDispatchPlanList([row]),
    directusGet<RawDispatchDetailRow>(
      `/items/dispatch_plan_details?filter[dispatch_id][_eq]=${dispatchId}&limit=-1&fields=detail_id,dispatch_id,sales_order_id`
    ),
    directusGet<RawDispatchBudgetRow>(
      `/items/dispatch_plan_budget?filter[dispatch_plan_id][_eq]=${dispatchId}&limit=-1&fields=id,dispatch_plan_id,coa_id,remarks,amount`
    ),
  ]);

  const base = enrichedList[0];
  const orderIds = Array.from(
    new Set(details.map((d) => Number(d.sales_order_id)).filter(Boolean))
  );
  const coaIds = Array.from(
    new Set(rawBudgets.map((b) => Number(b.coa_id)).filter((n) => !Number.isNaN(n) && n > 0))
  );

  const [orders, coaRows] = await Promise.all([
    orderIds.length > 0
      ? directusGet<RawSalesOrderRow>(
          `/items/sales_order?filter[order_id][_in]=${orderIds.join(
            ","
          )}&limit=-1&fields=order_id,order_no,customer_code,branch_id,order_status,total_amount,net_amount,created_date,order_date`
        )
      : Promise.resolve([]),
    coaIds.length > 0
      ? directusGet<{ coa_id: number; account_title: string; gl_code?: string }>(
          `/items/chart_of_accounts?filter[coa_id][_in]=${coaIds.join(
            ","
          )}&limit=-1&fields=coa_id,account_title,gl_code`
        )
      : Promise.resolve([]),
  ]);

  const customerCodes = Array.from(new Set(orders.map((o) => o.customer_code).filter(Boolean)));

  const [customers, invoiceMap] = await Promise.all([
    customerCodes.length > 0
      ? directusGet<RawCustomerRow>(
          `/items/customer?filter[customer_code][_in]=${customerCodes
            .map((c) => encodeURIComponent(c))
            .join(",")}&limit=-1&fields=customer_code,customer_name,store_name,city`
        )
      : Promise.resolve([]),
    fetchInvoicesForOrders(orders),
  ]);

  const orderMap = new Map(orders.map((o) => [Number(o.order_id), o]));
  const customerMap = new Map(customers.map((c) => [c.customer_code, c]));
  const coaMap = new Map(coaRows.map((c) => [Number(c.coa_id), c]));

  const salesOrders: DispatchPlanSalesOrderRef[] = details.map((d) => {
    const so = orderMap.get(Number(d.sales_order_id));
    const cust = so?.customer_code ? customerMap.get(so.customer_code) : undefined;
    const invs = so ? getInvoicesForOrder(invoiceMap, Number(so.order_id), so.order_no) : [];
    const primaryInv = invs[0] || null;
    const invTotal =
      invs.length > 0
        ? invs.reduce((sum, x) => sum + Number(x.total_amount || 0), 0)
        : Number(so?.total_amount ?? so?.net_amount ?? 0);

    return {
      detail_id: Number(d.detail_id),
      sales_order_id: Number(d.sales_order_id),
      order_no: so?.order_no || `SO-${d.sales_order_id}`,
      order_status: so?.order_status || "-",
      customer_code: so?.customer_code || "-",
      customer_name: cust?.customer_name || so?.customer_code || "-",
      store_name: cust?.store_name || cust?.customer_name || "-",
      city: cust?.city || "-",
      invoice_id: primaryInv?.invoice_id ?? null,
      invoice_no: primaryInv?.invoice_no ?? null,
      invoices: invs,
      amount: invTotal,
      weight: null,
      created_date: so?.created_date ?? so?.order_date ?? null,
    };
  });

  const budgetRows: DispatchPlanBudgetRow[] = rawBudgets.map((b) => {
    const cId = Number(b.coa_id || 0);
    const coa = coaMap.get(cId);
    return {
      id: Number(b.id),
      coa_id: cId,
      account_title: coa?.account_title || (cId ? `COA #${cId}` : "-"),
      gl_code: coa?.gl_code || "",
      amount: Number(b.amount || 0),
      remarks: b.remarks ?? null,
    };
  });

  const totalInvoiceCount = salesOrders.reduce(
    (sum, s) => sum + (s.invoices.length > 0 ? s.invoices.length : 1),
    0
  );

  const stops = salesOrders.map((so, idx) => ({
    id: `so-${so.sales_order_id}`,
    type: "DELIVERY" as const,
    sequence: idx + 1,
    sales_order_id: so.sales_order_id,
    order_no: so.order_no,
    order_status: so.order_status,
    customer_name: so.customer_name,
    store_name: so.store_name,
    city: so.city,
    invoices: so.invoices,
    amount: so.amount,
    weight: so.weight || 0,
  }));

  return {
    ...base,
    vehicle_id: row.vehicle_id ? Number(row.vehicle_id) : null,
    stop_count: salesOrders.length,
    invoice_count: totalInvoiceCount,
    rejection_reason: base.rejection_reason ?? null,
    approved_by: base.approved_by ?? null,
    approved_by_name: base.approved_by_name ?? null,
    approved_at: base.approved_at ?? null,
    rejected_by: base.rejected_by ?? null,
    rejected_by_name: base.rejected_by_name ?? null,
    rejected_at: base.rejected_at ?? null,
    sales_orders: salesOrders,
    budget_rows: budgetRows,
    stops,
  };
}
