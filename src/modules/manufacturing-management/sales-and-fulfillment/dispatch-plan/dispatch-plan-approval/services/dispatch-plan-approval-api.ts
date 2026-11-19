import { toast } from "sonner";
import { formatUserFriendlyError } from "../../shared.utils";
import type {
  PaginatedDispatchPlansResponse,
  DispatchPlanDetail,
  FetchDispatchPlansParams,
  ApprovalActionPayload,
  BranchOption,
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

export async function fetchApprovalBranches(): Promise<BranchOption[]> {
  const res = await fetchWithRetry(`${BASE}/master-data`, { cache: "no-store" });
  const data = await handleResponse<{ success: boolean; branches: BranchOption[] }>(
    res,
    "Failed to load branches"
  );
  return data.branches || [];
}

export async function fetchApprovalDispatchPlans(
  params: FetchDispatchPlansParams = {}
): Promise<PaginatedDispatchPlansResponse> {
  const qs = new URLSearchParams();
  if (params.search?.trim()) qs.set("search", params.search.trim());
  if (params.branchId) qs.set("branchId", String(params.branchId));
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));

  const url = `${BASE}/approval${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetchWithRetry(url, { cache: "no-store" });
  const data = await handleResponse<{ success: boolean } & PaginatedDispatchPlansResponse>(
    res,
    "Failed to load dispatch plans for approval"
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

export async function fetchApprovalPlanDetail(id: number): Promise<DispatchPlanDetail> {
  const res = await fetchWithRetry(`${BASE}/approval/${id}`, { cache: "no-store" });
  const data = await handleResponse<{ success: boolean; data: DispatchPlanDetail }>(
    res,
    `Failed to load Dispatch Plan #${id}`
  );
  return data.data;
}

export async function submitApprovalAction(
  id: number,
  payload: ApprovalActionPayload
): Promise<{ success: boolean }> {
  if (payload.action === "reject" && !payload.reason?.trim()) {
    toast.error("Reason Required", {
      description: "Please provide a reason when returning a trip for correction.",
    });
    throw new Error("Reason is required for rejection");
  }

  const res = await fetchWithRetry(`${BASE}/approval/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{ success: boolean }>(
    res,
    `Failed to ${payload.action} Dispatch Plan`
  );

  if (payload.action === "approve") {
    toast.success("Dispatch Plan Approved", {
      description: "Linked Sales Orders have been updated to Dispatched.",
    });
  } else {
    toast.success("Returned for Correction", {
      description: "Linked Sales Orders have been reverted to For Loading.",
    });
  }

  return data;
}
