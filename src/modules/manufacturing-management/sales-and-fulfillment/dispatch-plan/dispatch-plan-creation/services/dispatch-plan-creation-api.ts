import { toast } from "sonner";
import { formatUserFriendlyError } from "../../shared.utils";
import type {
  PaginatedDispatchPlansResponse,
  DispatchPlanDetail,
  EligibleSalesOrder,
  DispatchMasterData,
  CreateDispatchPlanPayload,
  UpdateDispatchPlanPayload,
  FetchDispatchPlansParams,
} from "../../shared.types";

const BASE = "/api/manufacturing/sales-and-fulfillment/dispatch-plan";

let _refreshPromise: Promise<boolean> | null = null;
async function refreshAccessToken(): Promise<boolean> {
  if (!_refreshPromise) {
    _refreshPromise = fetch("/api/auth/refresh", { method: "POST", cache: "no-store" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        _refreshPromise = null;
      });
  }
  return _refreshPromise;
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  const refreshed = await refreshAccessToken();
  if (!refreshed) return res;
  return fetch(input, init);
}

async function handleResponse<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) {
      toast.error("Session Expired", { description: "Please log in again." });
      throw new Error("Authentication expired");
    }
    let msg = fallback;
    try {
      const d = await res.json();
      if (d?.message) msg = d.message;
      else if (d?.error) msg = d.error;
    } catch {
      const t = await res.text().catch(() => "");
      if (t) msg = `${fallback}: ${t}`;
    }
    const cleanMsg = formatUserFriendlyError(msg, fallback);
    toast.error("Request Failed", { description: cleanMsg });
    throw new Error(cleanMsg);
  }
  return res.json() as Promise<T>;
}

export async function fetchDispatchPlans(
  params: FetchDispatchPlansParams = {}
): Promise<PaginatedDispatchPlansResponse> {
  const qs = new URLSearchParams();
  if (params.search?.trim()) qs.set("search", params.search.trim());
  if (params.branchId) qs.set("branchId", String(params.branchId));
  if (params.status && params.status !== "All") qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));

  const url = `${BASE}/creation${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await handleResponse<{ success: boolean } & PaginatedDispatchPlansResponse>(
    res,
    "Failed to load dispatch plans"
  );
  return {
    data: data.data || [],
    total: data.total || 0,
    page: data.page || 1,
    pageSize: data.pageSize || 10,
    totalPages: data.totalPages || 1,
    counts: data.counts,
  };
}

export async function fetchDispatchPlanDetail(id: number): Promise<DispatchPlanDetail> {
  const res = await fetchWithRetry(`${BASE}/creation/${id}`, { cache: "no-store" });
  const data = await handleResponse<{ success: boolean; data: DispatchPlanDetail }>(
    res,
    `Failed to load Dispatch Plan #${id}`
  );
  return data.data;
}

export async function createDispatchPlan(
  payload: CreateDispatchPlanPayload
): Promise<{ success: boolean; dispatch_id: number; dispatch_no: string }> {
  const res = await fetchWithRetry(`${BASE}/creation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{
    success: boolean;
    dispatch_id: number;
    dispatch_no: string;
  }>(res, "Failed to create Dispatch Plan");
  toast.success("Dispatch Plan Created", {
    description: `${data.dispatch_no} saved. Linked Sales Orders updated to For Shipping.`,
  });
  return data;
}

export async function updateDispatchPlan(
  id: number,
  payload: UpdateDispatchPlanPayload
): Promise<{ success: boolean }> {
  const res = await fetchWithRetry(`${BASE}/creation/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{ success: boolean }>(res, "Failed to update Dispatch Plan");
  toast.success(payload.resubmit ? "Dispatch Plan Resubmitted" : "Dispatch Plan Updated", {
    description: payload.resubmit
      ? "Plan updated and resubmitted for approval."
      : "Changes saved successfully.",
  });
  return data;
}

export async function fetchEligibleSalesOrders(
  search?: string,
  branchId?: number | null,
  includeDispatchId?: number | null
): Promise<EligibleSalesOrder[]> {
  const qs = new URLSearchParams();
  if (search?.trim()) qs.set("search", search.trim());
  if (branchId) qs.set("branchId", String(branchId));
  if (includeDispatchId) qs.set("includeDispatchId", String(includeDispatchId));
  const res = await fetchWithRetry(`${BASE}/invoices${qs.toString() ? `?${qs}` : ""}`, {
    cache: "no-store",
  });
  const data = await handleResponse<{ success: boolean; data: EligibleSalesOrder[] }>(
    res,
    "Failed to load eligible sales orders"
  );
  return data.data || [];
}

export async function fetchMasterData(): Promise<DispatchMasterData> {
  const res = await fetchWithRetry(`${BASE}/master-data`, { cache: "no-store" });
  const data = await handleResponse<{ success: boolean } & DispatchMasterData>(
    res,
    "Failed to load master data"
  );
  return {
    branches: data.branches || [],
    drivers: data.drivers || [],
    helpers: data.helpers || [],
    vehicles: data.vehicles || [],
    coa: data.coa || [],
    locked_vehicle: data.locked_vehicle || { id: 0, name: "3rd Party Logistics" },
  };
}
