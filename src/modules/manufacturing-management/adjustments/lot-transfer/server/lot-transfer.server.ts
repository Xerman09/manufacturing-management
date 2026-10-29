import { DIRECTUS_URL, headers as baseHeaders } from "@/app/api/manufacturing/directus-api";
import { cookies } from "next/headers";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveProductClassification } from "../services/lot-allocation.engine";
import type {
  LotTransfer,
  LotTransferDetail,
  LotTransferStatus,
  LotTransferStatusHistory,
  LotTransferMovementHistory,
  LotTransferFilter,
} from "../types";

export class LotTransferServerError extends Error {
  statusCode: number;
  details?: unknown;
  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "LotTransferServerError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

const STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const HEADERS: Record<string, string> = {
  ...baseHeaders,
  ...(STATIC_TOKEN ? { Authorization: `Bearer ${STATIC_TOKEN}` } : {}),
};

async function directusFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${DIRECTUS_URL?.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...HEADERS,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }

  if (!response.ok) {
    const errorMsg =
      (Array.isArray(json.errors) && json.errors[0]?.message) ||
      json.message ||
      json.error ||
      `Directus request failed with status ${response.status}`;
    throw new LotTransferServerError(String(errorMsg), response.status >= 500 ? 502 : response.status, json);
  }

  return json as T;
}

export function getPhTimestamp(date?: Date | string | null): string {
  const d = date ? (typeof date === "string" ? new Date(date) : date) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  return validDate
    .toLocaleString("sv-SE", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    .replace("T", " ");
}

/**
 * Generates human readable request number: LT-YYYYMMDD-XXXX
 */
async function generateRequestNo(): Promise<string> {
  const dateStr = getPhTimestamp().slice(0, 10).replace(/-/g, "");
  const prefix = `LT-${dateStr}-`;

  const existing = await directusFetch<{ data: Array<{ request_no: string }> }>(
    `/items/mm_lot_transfers?filter[request_no][_starts_with]=${prefix}&sort=-request_no&limit=1&fields=request_no`
  ).catch(() => ({ data: [] }));

  let nextSeq = 1;
  if (existing.data && existing.data.length > 0) {
    const lastNo = existing.data[0].request_no;
    const parts = lastNo.split("-");
    const numPart = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(numPart)) {
      nextSeq = numPart + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function listLotTransfersServer(filter: LotTransferFilter = {}): Promise<{
  data: LotTransfer[];
  totalCount: number;
}> {
  const queryParams = new URLSearchParams();
  queryParams.set("fields", "*.*");
  queryParams.set("sort", "-lot_transfer_id");

  const filterObj: Record<string, unknown> = {};

  if (filter.status) {
    if (Array.isArray(filter.status)) {
      if (filter.status.length > 0) {
        filterObj.status = { _in: filter.status };
      }
    } else {
      filterObj.status = { _eq: filter.status };
    }
  }

  if (filter.branchId) {
    filterObj.branch_id = { _eq: filter.branchId };
  }

  if (filter.dateFrom && filter.dateTo) {
    filterObj.transfer_date = { _between: [filter.dateFrom, filter.dateTo] };
  } else if (filter.dateFrom) {
    filterObj.transfer_date = { _gte: filter.dateFrom };
  } else if (filter.dateTo) {
    filterObj.transfer_date = { _lte: filter.dateTo };
  }

  if (filter.sourceLotId) {
    filterObj.source_lot_id = { _eq: filter.sourceLotId };
  }

  if (filter.targetLotId) {
    filterObj.target_lot_id = { _eq: filter.targetLotId };
  }

  if (filter.search && filter.search.trim()) {
    const term = filter.search.trim();
    filterObj._or = [
      { request_no: { _icontains: term } },
      { reason: { _icontains: term } },
      { source_batch_no: { _icontains: term } },
      { target_batch_no: { _icontains: term } },
    ];
  }

  if (Object.keys(filterObj).length > 0) {
    queryParams.set("filter", JSON.stringify(filterObj));
  }

  const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
  const offset = filter.offset && filter.offset >= 0 ? filter.offset : 0;
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(offset));
  queryParams.set("fields", "*.*");
  queryParams.set("meta", "filter_count");

  const [res, lookups] = await Promise.all([
    directusFetch<{ data: Array<Record<string, unknown>>; meta?: { filter_count?: number } }>(
      `/items/mm_lot_transfers?${queryParams.toString()}`
    ),
    getServerLookups(),
  ]);

  const rawRows = res.data || [];
  const totalCount = res.meta?.filter_count ?? rawRows.length;

  // Batch-fetch details for all transfers in this page
  const ids = rawRows.map((r) => Number(r.lot_transfer_id || r.id)).filter((id) => id > 0);
  const detailsMap = new Map<number, Array<Record<string, unknown>>>();
  if (ids.length > 0) {
    const detailsRes = await directusFetch<{ data: Array<Record<string, unknown>> }>(
      `/items/mm_lot_transfer_details?filter[lot_transfer_id][_in]=${ids.join(",")}&sort=line_no&limit=-1&fields=*.*`
    ).catch(() => ({ data: [] }));
    for (const d of detailsRes.data || []) {
      const tId = Number(d.lot_transfer_id);
      if (!detailsMap.has(tId)) detailsMap.set(tId, []);
      detailsMap.get(tId)!.push(d);
    }
  }

  // Enrich with names and details
  const records: LotTransfer[] = [];
  for (const row of rawRows) {
    const rowId = Number(row.lot_transfer_id || row.id);
    records.push(mapToLotTransfer(row, detailsMap.get(rowId) || [], lookups));
  }

  return { data: records, totalCount };
}

export async function getLotTransferByIdServer(id: number): Promise<LotTransfer> {
  const queryParams = new URLSearchParams({
    fields: "*.*",
  });

  const [res, detailsRes, lookups] = await Promise.all([
    directusFetch<{ data: Record<string, unknown> }>(`/items/mm_lot_transfers/${id}?${queryParams.toString()}`),
    directusFetch<{ data: Array<Record<string, unknown>> }>(
      `/items/mm_lot_transfer_details?filter[lot_transfer_id][_eq]=${id}&sort=line_no&fields=*.*`
    ).catch(() => ({ data: [] })),
    getServerLookups(),
  ]);

  if (!res.data) {
    throw new LotTransferServerError(`Lot transfer #${id} not found`, 404);
  }

  const record = mapToLotTransfer(res.data, detailsRes.data || [], lookups);
  return record;
}

export async function getLotTransferStatusHistoryServer(transferId: number): Promise<LotTransferStatusHistory[]> {
  const [res, lookups] = await Promise.all([
    directusFetch<{ data: Array<Record<string, unknown>> }>(
      `/items/mm_lot_transfer_status_history?filter[lot_transfer_id][_eq]=${transferId}&sort=changed_at&fields=*.*`
    ).catch(() => ({ data: [] })),
    getServerLookups(),
  ]);

  return (res.data || []).map((row) => {
    const changedById = row.changed_by ? Number(row.changed_by) : null;
    return {
      id: Number(row.lot_transfer_status_history_id || row.id),
      lotTransferId: Number(row.lot_transfer_id),
      oldStatus: (row.old_status as LotTransferStatus) || null,
      newStatus: row.new_status as LotTransferStatus,
      changedBy: changedById,
      changedByName: extractUserName(row.changed_by) || (changedById ? lookups.users.get(changedById) : undefined) || "-",
      changedAt: String(row.changed_at || ""),
      remarks: String(row.remarks || ""),
    };
  });
}

export async function getLotTransferMovementsServer(transferId: number): Promise<LotTransferMovementHistory[]> {
  const [res, lookups] = await Promise.all([
    directusFetch<{ data: Array<Record<string, unknown>> }>(
      `/items/inventory_movements?filter[source_document_id][_eq]=${transferId}&fields=*.*&sort=movement_id`
    ).catch(() => ({ data: [] })),
    getServerLookups(),
  ]);

  return (res.data || []).map((row) => {
    const qty = Number(row.quantity || 0);
    const pId = Number(row.product_id);
    const lotId = row.mm_lot_id ? Number(row.mm_lot_id) : (row.lot_id ? Number(row.lot_id) : null);
    const createdById = row.created_by ? Number(row.created_by) : null;
    const prodMeta = lookups.products.get(pId);

    return {
      movementId: Number(row.movement_id || row.id),
      lotTransferId: transferId,
      detailId: row.source_document_detail_id ? Number(row.source_document_detail_id) : null,
      transactionTypeId: row.transaction_type_id ? Number(row.transaction_type_id) : null,
      transactionType: typeof row.transaction_type_id === "object" ? String((row.transaction_type_id as Record<string, unknown>)?.type_name || "") : "LOT_TRANSFER",
      movementDirection: qty < 0 ? "OUT" : "IN",
      sourceDocumentNo: String(row.source_document_no || ""),
      productId: pId,
      productName: typeof row.product_id === "object" ? String((row.product_id as Record<string, unknown>)?.product_name || "") : (prodMeta?.name || "-"),
      branchId: Number(row.branch_id),
      mmLotId: lotId,
      lotName: typeof row.mm_lot_id === "object" ? String((row.mm_lot_id as Record<string, unknown>)?.lot_name || "") : (lotId ? lookups.lots.get(lotId) || "-" : "-"),
      batchNo: String(row.batch_no || ""),
      quantity: Math.abs(qty),
      manufacturingDate: row.manufacturing_date ? String(row.manufacturing_date) : null,
      expirationDate: row.expiry_date ? String(row.expiry_date) : null,
      createdBy: createdById,
      createdByName: extractUserName(row.created_by) || (createdById ? lookups.users.get(createdById) : undefined) || "-",
      createdAt: row.created_at ? String(row.created_at) : null,
      remarks: row.remarks ? String(row.remarks) : null,
    };
  });
}

/**
 * Validates target lot capacity by checking current stock quantity + incoming transfer quantity
 * against mm_lots.max_batch_capacity (total product quantity in units).
 */
async function getReconciledLotOccupancyServer(targetLotId: number): Promise<number> {
  const springUrl = process.env.SPRING_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!springUrl) return 0;

  let token: string | undefined;
  try {
    const cookieStore = await cookies();
    token =
      cookieStore.get("vos_access_token")?.value ||
      cookieStore.get("springboot_token")?.value ||
      cookieStore.get("token")?.value;
  } catch {
    // ignore
  }
  if (!token) {
    try {
      const tokenPath = resolve(process.cwd(), "node_modules/.cache/vos-tokens/latest_token.txt");
      if (existsSync(tokenPath)) {
        token = readFileSync(tokenPath, "utf8").trim();
      }
    } catch {
      // ignore
    }
  }
  const reqHeaders: Record<string, string> = { Accept: "application/json" };
  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
    reqHeaders["Cookie"] = `vos_access_token=${token}`;
  }

  // 1. Fetch inventory lots for this target lot from Directus to know which inventory_lot_ids belong to targetLotId
  const invLotsRes = await directusFetch<{ data: Array<{ inventory_lot_id: number; lot_id: unknown }> }>(
    `/items/mm_inventory_lots?filter[lot_id][_eq]=${targetLotId}&fields=inventory_lot_id,lot_id&limit=-1`
  ).catch(() => ({ data: [] }));

  const targetInvLotIds = new Set<number>(
    (invLotsRes.data || []).map((r) => Number(r.inventory_lot_id)).filter((id) => id > 0)
  );

  // 2. Fetch movements and on-hand in parallel
  const [movementsRes, onhandRes] = await Promise.all([
    fetch(`${springUrl}/api/mm-inventory-movements/all`, { headers: reqHeaders, cache: "no-store" }).catch(() => null),
    fetch(`${springUrl}/api/mm-batch-onhand/all`, { headers: reqHeaders, cache: "no-store" }).catch(() => null),
  ]);

  let rawMovements: Array<Record<string, unknown>> = [];
  if (movementsRes && movementsRes.ok) {
    try {
      const movJson = await movementsRes.json();
      rawMovements = Array.isArray(movJson) ? movJson : movJson?.data || [];
    } catch {
      rawMovements = [];
    }
  }

  let rawOnhand: Array<Record<string, unknown>> = [];
  if (onhandRes && onhandRes.ok) {
    try {
      const ohJson = await onhandRes.json();
      rawOnhand = Array.isArray(ohJson) ? ohJson : ohJson?.data || [];
    } catch {
      rawOnhand = [];
    }
  }

  const isRowForTargetLot = (r: Record<string, unknown>): boolean => {
    const rawLot = r.mmLotId ?? r.mm_lot_id ?? r.lotId ?? r.lot_id;
    const lotId = typeof rawLot === "object" && rawLot !== null ? Number((rawLot as { lot_id?: number }).lot_id || 0) : Number(rawLot || 0);
    if (lotId === targetLotId) return true;
    const invId = Number(r.inventoryLotId ?? r.inventory_lot_id ?? 0);
    if (invId > 0 && targetInvLotIds.has(invId)) return true;
    return false;
  };

  // Reconcile batch quantities: movement net takes precedence, fallback to onhand
  const batchNetMap = new Map<string, { onhand: number; count: number }>();

  rawMovements.forEach((m) => {
    if (!isRowForTargetLot(m)) return;
    const pId = Number(m.productId || m.product_id || 0);
    const bNo = String(m.batchNo || m.batch_no || "").trim().toLowerCase();
    const qIn = Number(m.quantityIn || m.quantity_in || 0);
    const qOut = Number(m.quantityOut || m.quantity_out || 0);
    const net = qIn - qOut;
    const key = `${pId}_${bNo}`;
    const cur = batchNetMap.get(key) || { onhand: 0, count: 0 };
    cur.onhand += net;
    cur.count += 1;
    batchNetMap.set(key, cur);
  });

  rawOnhand.forEach((oh) => {
    if (!isRowForTargetLot(oh)) return;
    const pId = Number(oh.productId || oh.product_id || 0);
    const bNo = String(oh.batchNo || oh.batch_no || "").trim().toLowerCase();
    const onhand = Number(oh.onhandQuantity ?? oh.onhand_quantity ?? oh.quantity ?? 0);
    const key = `${pId}_${bNo}`;
    const cur = batchNetMap.get(key) || { onhand: 0, count: 0 };
    if (cur.count === 0) {
      cur.onhand = onhand;
    }
    batchNetMap.set(key, cur);
  });

  // Total occupancy is the sum of positive stock in this target lot
  let totalOccupancy = 0;
  batchNetMap.forEach((entry) => {
    if (entry.onhand > 0) {
      totalOccupancy += entry.onhand;
    }
  });

  return parseFloat(totalOccupancy.toFixed(8));
}

/**
 * Validates that incoming transfer lines will not exceed destination lot capacity
 * against mm_lots.max_batch_capacity (total product quantity in units).
 */
async function validateTargetLotCapacity(
  targetLotId: number,
  lines: Array<{ productId: number; targetBatchNo: string; quantity?: number }>
): Promise<void> {
  const lotRes = await directusFetch<{ data: Record<string, unknown> }>(
    `/items/mm_lots/${targetLotId}?fields=lot_id,lot_name,max_batch_capacity,unit_id`
  );
  if (!lotRes.data) {
    throw new LotTransferServerError(`Destination lot #${targetLotId} not found`, 404);
  }

  const maxCapacity = Number(lotRes.data.max_batch_capacity);
  const lotName = String(lotRes.data.lot_name || "Destination Lot");
  const unitId = lotRes.data.unit_id ? Number(lotRes.data.unit_id) : null;

  if (maxCapacity > 0) {
    let currentOccupancy = 0;
    try {
      currentOccupancy = await getReconciledLotOccupancyServer(targetLotId);
    } catch {
      currentOccupancy = 0;
    }

    const incomingTransferQty = lines.reduce(
      (sum, l) => sum + Number(l.quantity || 0),
      0
    );
    const projectedOccupancy = currentOccupancy + incomingTransferQty;

    let unitName = "";
    if (unitId) {
      const unitRes = await directusFetch<{ data: { unit_shortcut?: string; unit_name?: string } }>(
        `/items/units/${unitId}?fields=unit_shortcut,unit_name`
      ).catch(() => ({ data: undefined }));
      unitName = unitRes.data?.unit_shortcut || unitRes.data?.unit_name || "";
    }

    if (projectedOccupancy > maxCapacity) {
      const excess = projectedOccupancy - maxCapacity;
      const unitLabel = unitName ? ` ${unitName}` : "";
      throw new LotTransferServerError(
        `Destination lot '${lotName}' capacity exceeded. Max capacity is ${maxCapacity.toLocaleString()}${unitLabel}. Current stock (${currentOccupancy.toLocaleString()}) + incoming transfer (${incomingTransferQty.toLocaleString()}) = ${projectedOccupancy.toLocaleString()}${unitLabel} (exceeds limit by ${excess.toLocaleString()}${unitLabel}).`,
        400
      );
    }
  }
}

export async function createLotTransferServer(
  payload: {
    branchId: number;
    transferDate: string;
    sourceLotId: number;
    targetLotId: number;
    unitId?: number;
    reason: string;
    status?: "Draft" | "Submitted";
    lines: Array<{
      productId: number;
      sourceInventoryLotId: number;
      sourceBatchNo: string;
      targetBatchNo: string;
      quantity: number;
      lineRemarks?: string;
      sourceManufacturingDate?: string | null;
      sourceExpiryDate?: string | null;
      sourceUnitCost?: number | null;
    }>;
  },
  userId?: number | null
): Promise<LotTransfer> {
  if (!payload.sourceLotId || !payload.targetLotId) {
    throw new LotTransferServerError("Source and Target lot are required", 400);
  }
  if (payload.sourceLotId === payload.targetLotId) {
    throw new LotTransferServerError("Source and Destination lots must be different", 400);
  }
  if (!payload.lines || payload.lines.length === 0) {
    throw new LotTransferServerError("At least one line item is required", 400);
  }

  // Validate quantities
  for (const [idx, line] of payload.lines.entries()) {
    if (!line.quantity || line.quantity <= 0) {
      throw new LotTransferServerError(`Line #${idx + 1} must have a quantity greater than zero`, 400);
    }
    if (!line.sourceBatchNo || !line.targetBatchNo) {
      throw new LotTransferServerError(`Line #${idx + 1} must have valid source and target batch numbers`, 400);
    }
  }

  // Validate target lot capacity
  await validateTargetLotCapacity(payload.targetLotId, payload.lines);

  // Validate UOM compatibility between source and target lots
  const [sourceLotRes, targetLotRes] = await Promise.all([
    directusFetch<{ data?: { unit_id?: number; lot_name?: string } }>(
      `/items/mm_lots/${payload.sourceLotId}?fields=unit_id,lot_name`
    ).catch(() => ({ data: undefined })),
    directusFetch<{ data?: { unit_id?: number; lot_name?: string } }>(
      `/items/mm_lots/${payload.targetLotId}?fields=unit_id,lot_name`
    ).catch(() => ({ data: undefined })),
  ]);
  const sUnit = sourceLotRes.data?.unit_id;
  const tUnit = targetLotRes.data?.unit_id;
  if (sUnit && tUnit && sUnit !== tUnit) {
    throw new LotTransferServerError(
      `Source lot (${sourceLotRes.data?.lot_name || payload.sourceLotId}) and Destination lot (${targetLotRes.data?.lot_name || payload.targetLotId}) use incompatible units of measurement. Cross-UOM transfer without conversion is strictly forbidden.`,
      400
    );
  }

  // If unitId not provided, get from source lot
  const unitId = payload.unitId || sUnit || 1;

  const requestNo = await generateRequestNo();
  const now = getPhTimestamp();
  const initialStatus: LotTransferStatus = payload.status === "Submitted" ? "Submitted" : "Draft";

  // Total quantity
  const totalQuantity = payload.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const primaryLine = payload.lines[0];

  // Insert header
  const headerPayload = {
    request_no: requestNo,
    status: initialStatus,
    branch_id: payload.branchId,
    product_id: primaryLine.productId,
    source_lot_id: payload.sourceLotId,
    source_inventory_lot_id: primaryLine.sourceInventoryLotId,
    source_batch_no: primaryLine.sourceBatchNo,
    target_lot_id: payload.targetLotId,
    target_batch_no: primaryLine.targetBatchNo,
    quantity: totalQuantity,
    transfer_date: payload.transferDate,
    unit_id: unitId,
    reason: payload.reason,
    requested_by: userId || null,
    requested_at: now,
    submitted_by: initialStatus === "Submitted" ? userId || null : null,
    submitted_at: initialStatus === "Submitted" ? now : null,
    created_at: now,
    updated_at: now,
  };

  const createdHeader = await directusFetch<{ data: Record<string, unknown> }>(
    `/items/mm_lot_transfers`,
    {
      method: "POST",
      body: JSON.stringify(headerPayload),
    }
  );

  const transferId = Number(createdHeader.data.lot_transfer_id || createdHeader.data.id);

  // Insert details
  const detailPayloads = payload.lines.map((line, idx) => ({
    lot_transfer_id: transferId,
    line_no: idx + 1,
    product_id: line.productId,
    source_inventory_lot_id: line.sourceInventoryLotId,
    source_batch_no: line.sourceBatchNo,
    target_batch_no: line.targetBatchNo,
    quantity: line.quantity,
    line_remarks: line.lineRemarks ? String(line.lineRemarks).trim() : null,
    source_manufacturing_date: line.sourceManufacturingDate || null,
    source_expiry_date: line.sourceExpiryDate || null,
    target_manufacturing_date: line.sourceManufacturingDate || null,
    target_expiry_date: line.sourceExpiryDate || null,
    source_unit_cost:
      line.sourceUnitCost !== null && line.sourceUnitCost !== undefined && !isNaN(Number(line.sourceUnitCost))
        ? Number(line.sourceUnitCost)
        : null,
    target_unit_cost:
      line.sourceUnitCost !== null && line.sourceUnitCost !== undefined && !isNaN(Number(line.sourceUnitCost))
        ? Number(line.sourceUnitCost)
        : null,
    created_at: now,
    updated_at: now,
  }));

  for (const detail of detailPayloads) {
    await directusFetch(`/items/mm_lot_transfer_details`, {
      method: "POST",
      body: JSON.stringify(detail),
    });
  }

  // Insert status history
  const historyPayload = {
    lot_transfer_id: transferId,
    old_status: null,
    new_status: initialStatus,
    changed_by: userId || null,
    changed_at: now,
    remarks: initialStatus === "Submitted" ? "Lot transfer created and submitted." : "Lot transfer created as draft.",
    event_key: `LT-${transferId}-${initialStatus}-${Date.now()}`,
  };

  await directusFetch(`/items/mm_lot_transfer_status_history`, {
    method: "POST",
    body: JSON.stringify(historyPayload),
  }).catch((err) => console.warn("Failed to write status history:", err));

  return getLotTransferByIdServer(transferId);
}

export async function updateLotTransferServer(
  id: number,
  payload: {
    branchId: number;
    transferDate: string;
    sourceLotId: number;
    targetLotId: number;
    unitId?: number;
    reason: string;
    status?: "Draft" | "Submitted";
    lines: Array<{
      productId: number;
      sourceInventoryLotId: number;
      sourceBatchNo: string;
      targetBatchNo: string;
      quantity: number;
      lineRemarks?: string;
      sourceManufacturingDate?: string | null;
      sourceExpiryDate?: string | null;
      sourceUnitCost?: number | null;
    }>;
  },
  userId?: number | null
): Promise<LotTransfer> {
  const current = await getLotTransferByIdServer(id);
  if (current.status !== "Draft") {
    throw new LotTransferServerError(`Only Draft transfers can be edited. Current status: ${current.status}`, 400);
  }

  if (!payload.sourceLotId || !payload.targetLotId) {
    throw new LotTransferServerError("Source and Target lot are required", 400);
  }
  if (payload.sourceLotId === payload.targetLotId) {
    throw new LotTransferServerError("Source and Destination lots must be different", 400);
  }
  if (!payload.lines || payload.lines.length === 0) {
    throw new LotTransferServerError("At least one line item is required", 400);
  }

  for (const [idx, line] of payload.lines.entries()) {
    if (!line.quantity || line.quantity <= 0) {
      throw new LotTransferServerError(`Line #${idx + 1} must have a quantity greater than zero`, 400);
    }
    if (!line.sourceBatchNo || !line.targetBatchNo) {
      throw new LotTransferServerError(`Line #${idx + 1} must have valid source and target batch numbers`, 400);
    }
  }

  await validateTargetLotCapacity(payload.targetLotId, payload.lines);

  const now = getPhTimestamp();
  const nextStatus: LotTransferStatus = payload.status === "Submitted" ? "Submitted" : "Draft";
  const totalQuantity = payload.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const primaryLine = payload.lines[0];

  await directusFetch(`/items/mm_lot_transfers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: nextStatus,
      branch_id: payload.branchId,
      product_id: primaryLine.productId,
      source_lot_id: payload.sourceLotId,
      source_inventory_lot_id: primaryLine.sourceInventoryLotId,
      source_batch_no: primaryLine.sourceBatchNo,
      target_lot_id: payload.targetLotId,
      target_batch_no: primaryLine.targetBatchNo,
      quantity: totalQuantity,
      transfer_date: payload.transferDate,
      reason: payload.reason,
      updated_at: now,
    }),
  });

  // 1. Use existing details from current transfer record to update in-place
  let existingDetails = (current.details || []).sort(
    (a, b) => Number(a.lineNo || 0) - Number(b.lineNo || 0)
  );

  // If current.details was empty, query with fields=*.* as reliable fallback
  if (existingDetails.length === 0) {
    const fallbackRes = await directusFetch<{ data: Array<Record<string, unknown>> }>(
      `/items/mm_lot_transfer_details?filter[lot_transfer_id][_eq]=${id}&sort=line_no&fields=*.*`
    ).catch(() => ({ data: [] }));
    existingDetails = (fallbackRes.data || []).map((d) => ({
      detailId: Number(d.lot_transfer_detail_id || (d as Record<string, unknown>).id),
      lotTransferId: id,
      lineNo: Number(d.line_no || 1),
      productId: Number(
        typeof d.product_id === "object" && d.product_id !== null
          ? (d.product_id as { product_id?: number }).product_id
          : d.product_id || 0
      ),
      sourceInventoryLotId: Number(d.source_inventory_lot_id || 0),
      sourceBatchNo: String(d.source_batch_no || ""),
      targetBatchNo: String(d.target_batch_no || ""),
      quantity: Number(d.quantity || 0),
    })) as unknown as typeof current.details;
  }

  // 2. Update existing rows in place or insert new rows if line items were added
  for (let idx = 0; idx < payload.lines.length; idx++) {
    const line = payload.lines[idx];
    const updateData = {
      product_id: line.productId,
      source_inventory_lot_id: line.sourceInventoryLotId,
      source_batch_no: line.sourceBatchNo,
      target_batch_no: line.targetBatchNo,
      quantity: line.quantity,
      line_remarks: line.lineRemarks ? String(line.lineRemarks).trim() : null,
      source_manufacturing_date: line.sourceManufacturingDate || null,
      source_expiry_date: line.sourceExpiryDate || null,
      target_manufacturing_date: line.sourceManufacturingDate || null,
      target_expiry_date: line.sourceExpiryDate || null,
      source_unit_cost:
        line.sourceUnitCost !== null && line.sourceUnitCost !== undefined && !isNaN(Number(line.sourceUnitCost))
          ? Number(line.sourceUnitCost)
          : null,
      target_unit_cost:
        line.sourceUnitCost !== null && line.sourceUnitCost !== undefined && !isNaN(Number(line.sourceUnitCost))
          ? Number(line.sourceUnitCost)
          : null,
      updated_at: now,
    };

    if (idx < existingDetails.length) {
      const detailId = existingDetails[idx].detailId;
      await directusFetch(`/items/mm_lot_transfer_details/${detailId}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      });
    } else {
      await directusFetch(`/items/mm_lot_transfer_details`, {
        method: "POST",
        body: JSON.stringify({
          lot_transfer_id: id,
          line_no: idx + 1,
          ...updateData,
          created_at: now,
        }),
      });
    }
  }

  // 3. Delete any surplus detail rows if lines were removed
  if (existingDetails.length > payload.lines.length) {
    for (let idx = payload.lines.length; idx < existingDetails.length; idx++) {
      const surplusDetailId = existingDetails[idx].detailId;
      if (surplusDetailId > 0) {
        await directusFetch(`/items/mm_lot_transfer_details/${surplusDetailId}`, {
          method: "DELETE",
        }).catch((err) => console.warn(`Failed to delete surplus detail #${surplusDetailId}:`, err));
      }
    }
  }

  if (nextStatus === "Submitted") {
    const historyPayload = {
      lot_transfer_id: id,
      old_status: "Draft",
      new_status: "Submitted",
      changed_by: userId || null,
      changed_at: now,
      remarks: "Draft transfer modified and submitted for QA approval.",
      event_key: `LT-${id}-Submitted-${Date.now()}`,
    };
    await directusFetch(`/items/mm_lot_transfer_status_history`, {
      method: "POST",
      body: JSON.stringify(historyPayload),
    }).catch((err) => console.warn("Failed to write status history:", err));
  }

  return getLotTransferByIdServer(id);
}

export async function submitLotTransferServer(id: number, userId?: number | null): Promise<LotTransfer> {
  const current = await getLotTransferByIdServer(id);
  if (current.status !== "Draft") {
    throw new LotTransferServerError(`Only Draft transfers can be submitted. Current status: ${current.status}`, 400);
  }

  const now = getPhTimestamp();
  await directusFetch(`/items/mm_lot_transfers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "Submitted",
      submitted_by: userId || null,
      submitted_at: now,
      updated_at: now,
    }),
  });

  await directusFetch(`/items/mm_lot_transfer_status_history`, {
    method: "POST",
    body: JSON.stringify({
      lot_transfer_id: id,
      old_status: "Draft",
      new_status: "Submitted",
      changed_by: userId || null,
      changed_at: now,
      remarks: "Submitted for QA approval.",
      event_key: `LT-${id}-Submitted-${Date.now()}`,
    }),
  }).catch((err) => console.warn("Status history write warning:", err));

  return getLotTransferByIdServer(id);
}

export async function approveLotTransferServer(
  id: number,
  userId?: number | null,
  remarks?: string
): Promise<LotTransfer> {
  const current = await getLotTransferByIdServer(id);
  if (current.status !== "Submitted") {
    throw new LotTransferServerError(`Only Submitted transfers can be approved. Current status: ${current.status}`, 400);
  }

  const now = getPhTimestamp();
  await directusFetch(`/items/mm_lot_transfers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "Approved",
      approved_by: userId || null,
      approved_at: now,
      qa_evidence: remarks || "QA checks passed",
      updated_at: now,
    }),
  });

  await directusFetch(`/items/mm_lot_transfer_status_history`, {
    method: "POST",
    body: JSON.stringify({
      lot_transfer_id: id,
      old_status: "Submitted",
      new_status: "Approved",
      changed_by: userId || null,
      changed_at: now,
      remarks: remarks ? `Approved: ${remarks}` : "Approved by QA.",
      event_key: `LT-${id}-Approved-${Date.now()}`,
    }),
  }).catch((err) => console.warn("Status history write warning:", err));

  return getLotTransferByIdServer(id);
}

export async function rejectLotTransferServer(
  id: number,
  reason: string,
  userId?: number | null
): Promise<LotTransfer> {
  if (!reason || !reason.trim()) {
    throw new LotTransferServerError("Rejection reason is required", 400);
  }
  const current = await getLotTransferByIdServer(id);
  if (current.status !== "Submitted") {
    throw new LotTransferServerError(`Only Submitted transfers can be rejected. Current status: ${current.status}`, 400);
  }

  const now = getPhTimestamp();
  await directusFetch(`/items/mm_lot_transfers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "Rejected",
      rejected_by: userId || null,
      rejected_at: now,
      rejection_reason: reason.trim(),
      updated_at: now,
    }),
  });

  await directusFetch(`/items/mm_lot_transfer_status_history`, {
    method: "POST",
    body: JSON.stringify({
      lot_transfer_id: id,
      old_status: "Submitted",
      new_status: "Rejected",
      changed_by: userId || null,
      changed_at: now,
      remarks: `Rejected: ${reason.trim()}`,
      event_key: `LT-${id}-Rejected-${Date.now()}`,
    }),
  }).catch((err) => console.warn("Status history write warning:", err));

  return getLotTransferByIdServer(id);
}

export async function cancelLotTransferServer(
  id: number,
  reason: string,
  userId?: number | null
): Promise<LotTransfer> {
  if (!reason || !reason.trim()) {
    throw new LotTransferServerError("Cancellation reason is required", 400);
  }
  const current = await getLotTransferByIdServer(id);
  if (current.status === "Posted" || current.status === "Cancelled" || current.status === "Reversed") {
    throw new LotTransferServerError(`Cannot cancel transfer in '${current.status}' status`, 400);
  }

  const now = getPhTimestamp();
  await directusFetch(`/items/mm_lot_transfers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "Cancelled",
      cancelled_by: userId || null,
      cancelled_at: now,
      cancellation_reason: reason.trim(),
      updated_at: now,
    }),
  });

  await directusFetch(`/items/mm_lot_transfer_status_history`, {
    method: "POST",
    body: JSON.stringify({
      lot_transfer_id: id,
      old_status: current.status,
      new_status: "Cancelled",
      changed_by: userId || null,
      changed_at: now,
      remarks: `Cancelled: ${reason.trim()}`,
      event_key: `LT-${id}-Cancelled-${Date.now()}`,
    }),
  }).catch((err) => console.warn("Status history write warning:", err));

  return getLotTransferByIdServer(id);
}

/**
 * Resolves movement transaction type id from inventory_transaction_types
 */
async function resolveTransactionTypeId(name: string, direction: "IN" | "OUT"): Promise<number> {
  // First attempt: exact match with origin_table or type_name
  const res = await directusFetch<{ data: Array<{ transaction_type_id: number; type_name: string; direction: string }> }>(
    `/items/inventory_transaction_types?filter[direction][_eq]=${direction}&limit=50&fields=transaction_type_id,type_name,direction`
  ).catch(() => ({ data: [] }));

  const rows = res.data || [];
  const exact = rows.find((r) => r.type_name === name || r.type_name.toUpperCase().includes(name.toUpperCase()));
  if (exact) {
    return Number(exact.transaction_type_id);
  }

  // Fallback to any transfer movement with matching direction
  const fallback = rows.find((r) => r.type_name.toUpperCase().includes("TRANSFER") && r.direction === direction);
  if (fallback) {
    return Number(fallback.transaction_type_id);
  }

  // If still not found, return first matching direction
  if (rows.length > 0) {
    return Number(rows[0].transaction_type_id);
  }

  throw new LotTransferServerError(`No inventory transaction type configured for direction '${direction}'`, 500);
}

export async function postLotTransferServer(id: number, userId?: number | null): Promise<LotTransfer> {
  const current = await getLotTransferByIdServer(id);
  if (current.status !== "Approved" && current.status !== "Submitted") {
    throw new LotTransferServerError(`Only Submitted or Approved transfers can be posted. Current status: ${current.status}`, 400);
  }

  const activeUserId = userId || current.postedBy || current.approvedBy || current.submittedBy || current.requestedBy || 1;
  const now = getPhTimestamp();
  const outTypeId = await resolveTransactionTypeId("LOT_TRANSFER_OUT", "OUT");
  const inTypeId = await resolveTransactionTypeId("LOT_TRANSFER_IN", "IN");

  if (!current.details || current.details.length === 0) {
    throw new LotTransferServerError("Cannot post: Transfer has no movement lines", 400);
  }

  for (const detail of current.details) {
    const lineNum = detail.lineNo || 1;
    if (!detail.productId) {
      throw new LotTransferServerError(`Cannot post: Product ID is missing for line #${lineNum}`, 400);
    }
    if (!detail.sourceInventoryLotId) {
      throw new LotTransferServerError(`Cannot post: Source inventory lot ID is missing for line #${lineNum}`, 400);
    }
    if (!detail.targetBatchNo || !detail.targetBatchNo.trim()) {
      throw new LotTransferServerError(`Cannot post: Target batch number is missing for line #${lineNum}`, 400);
    }
    if (
      detail.quantity === null ||
      detail.quantity === undefined ||
      Number(detail.quantity) <= 0 ||
      isNaN(Number(detail.quantity))
    ) {
      throw new LotTransferServerError(`Cannot post: Quantity must be greater than zero for line #${lineNum}`, 400);
    }
  }

  // Validate target lot capacity before posting
  await validateTargetLotCapacity(
    current.targetLotId,
    current.details.map((d) => ({
      productId: d.productId,
      targetBatchNo: d.targetBatchNo,
      quantity: d.quantity,
    }))
  );

  for (const detail of current.details) {
    // 1. Resolve or create target inventory lot
    let targetInvLotId: number | null = null;
    let targetBatchAction: "MERGE" | "CREATE" = "MERGE";

    const existingTargetLotRes = await directusFetch<{ data: Array<{ inventory_lot_id: number }> }>(
      `/items/mm_inventory_lots?filter[lot_id][_eq]=${current.targetLotId}&filter[product_id][_eq]=${detail.productId}&filter[batch_no][_eq]=${encodeURIComponent(detail.targetBatchNo)}&limit=1&fields=inventory_lot_id`
    ).catch(() => ({ data: [] }));

    if (existingTargetLotRes.data && existingTargetLotRes.data.length > 0) {
      targetInvLotId = Number(existingTargetLotRes.data[0].inventory_lot_id);
      targetBatchAction = "MERGE";
    } else {
      // Resolve unit_cost for mm_inventory_lots (NOT NULL column with default 0.000000)
      // If product has no unit cost, save as 0 so Directus validation succeeds
      const resolvedUnitCost =
        detail.sourceUnitCost !== null &&
        detail.sourceUnitCost !== undefined &&
        !isNaN(Number(detail.sourceUnitCost))
          ? Number(detail.sourceUnitCost)
          : 0;

      // Create new row in mm_inventory_lots
      const newInvLotPayload = {
        lot_id: current.targetLotId,
        product_id: detail.productId,
        branch_id: current.branchId,
        batch_no: detail.targetBatchNo,
        manufacturing_date: detail.sourceManufacturingDate || null,
        expiry_date: detail.sourceExpiryDate || null,
        unit_cost: resolvedUnitCost,
        qa_status: "GOOD",
        status: "ACTIVE",
        created_by: activeUserId,
        created_at: now,
        updated_at: now,
      };

      const createdInvLot = await directusFetch<{ data: { inventory_lot_id?: number; id?: number } }>(
        `/items/mm_inventory_lots`,
        {
          method: "POST",
          body: JSON.stringify(newInvLotPayload),
        }
      );
      targetInvLotId = Number(createdInvLot.data.inventory_lot_id || createdInvLot.data.id);
      targetBatchAction = "CREATE";
    }

    // 2. Create OUT movement (negative qty)
    // Note: Do not set legacy `lot_id` which references legacy `lots` table. Use `mm_lot_id`.
    const outMovementPayload = {
      product_id: detail.productId,
      branch_id: current.branchId,
      mm_lot_id: current.sourceLotId,
      inventory_lot_id: detail.sourceInventoryLotId,
      transaction_type_id: outTypeId,
      source_document_id: current.id,
      source_document_no: current.requestNo,
      source_document_detail_id: detail.detailId,
      batch_no: detail.sourceBatchNo,
      quantity: -Math.abs(detail.quantity),
      manufacturing_date: detail.sourceManufacturingDate || null,
      expiry_date: detail.sourceExpiryDate || null,
      created_by: activeUserId,
      created_at: now,
      remarks: `Lot Transfer Out to ${current.targetLotName || `Lot #${current.targetLotId}`}`,
    };

    const createdOut = await directusFetch<{ data: { movement_id?: number; id?: number } }>(
      `/items/inventory_movements`,
      {
        method: "POST",
        body: JSON.stringify(outMovementPayload),
      }
    );
    const outMovementId = Number(createdOut.data.movement_id || createdOut.data.id);

    // 3. Create IN movement (positive qty)
    // Note: Do not set legacy `lot_id` which references legacy `lots` table. Use `mm_lot_id`.
    const inMovementPayload = {
      product_id: detail.productId,
      branch_id: current.branchId,
      mm_lot_id: current.targetLotId,
      inventory_lot_id: targetInvLotId,
      transaction_type_id: inTypeId,
      source_document_id: current.id,
      source_document_no: current.requestNo,
      source_document_detail_id: detail.detailId,
      batch_no: detail.targetBatchNo,
      quantity: Math.abs(detail.quantity),
      manufacturing_date: detail.sourceManufacturingDate || null,
      expiry_date: detail.sourceExpiryDate || null,
      created_by: activeUserId,
      created_at: now,
      remarks: `Lot Transfer In from ${current.sourceLotName || `Lot #${current.sourceLotId}`}`,
    };

    const createdIn = await directusFetch<{ data: { movement_id?: number; id?: number } }>(
      `/items/inventory_movements`,
      {
        method: "POST",
        body: JSON.stringify(inMovementPayload),
      }
    );
    const inMovementId = Number(createdIn.data.movement_id || createdIn.data.id);

    // 4. Update detail record
    if (detail.detailId) {
      await directusFetch(`/items/mm_lot_transfer_details/${detail.detailId}`, {
        method: "PATCH",
        body: JSON.stringify({
          target_inventory_lot_id: targetInvLotId,
          source_movement_id: outMovementId,
          target_movement_id: inMovementId,
          destination_batch_action: targetBatchAction,
          updated_at: now,
        }),
      });
    }
  }

  // 5. Update header record to Posted
  await directusFetch(`/items/mm_lot_transfers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "Posted",
      posted_by: activeUserId,
      posted_at: now,
      updated_at: now,
    }),
  });

  // 6. Write status history
  await directusFetch(`/items/mm_lot_transfer_status_history`, {
    method: "POST",
    body: JSON.stringify({
      lot_transfer_id: id,
      old_status: current.status,
      new_status: "Posted",
      changed_by: activeUserId,
      changed_at: now,
      remarks: "Inventory movements successfully posted.",
      event_key: `LT-${id}-Posted-${Date.now()}`,
    }),
  }).catch((err) => console.warn("Status history write warning:", err));

  return getLotTransferByIdServer(id);
}

export async function reverseLotTransferServer(
  id: number,
  reason: string,
  userId?: number | null
): Promise<LotTransfer> {
  if (!reason || !reason.trim()) {
    throw new LotTransferServerError("Reversal reason is required", 400);
  }
  const current = await getLotTransferByIdServer(id);
  if (current.status !== "Posted") {
    throw new LotTransferServerError(`Only Posted transfers can be reversed. Current status: ${current.status}`, 400);
  }

  const activeUserId = userId || current.postedBy || current.approvedBy || current.submittedBy || current.requestedBy || 1;
  const now = getPhTimestamp();
  const revRequestNo = `REV-${current.requestNo}`;

  // Reverse header: Swap source and target
  const reversalHeader = {
    request_no: revRequestNo,
    status: "Reversed",
    branch_id: current.branchId,
    product_id: current.details[0]?.productId || null,
    source_lot_id: current.targetLotId,
    target_lot_id: current.sourceLotId,
    quantity: current.quantity,
    transfer_date: now.slice(0, 10),
    unit_id: current.unitId,
    reason: `Reversal of ${current.requestNo}: ${reason.trim()}`,
    reversal_of_id: current.id,
    requested_by: activeUserId,
    requested_at: now,
    reversed_by: activeUserId,
    reversed_at: now,
    reversal_reason: reason.trim(),
    created_at: now,
    updated_at: now,
  };

  const createdRev = await directusFetch<{ data: { lot_transfer_id?: number; id?: number } }>(
    `/items/mm_lot_transfers`,
    {
      method: "POST",
      body: JSON.stringify(reversalHeader),
    }
  );
  const revId = Number(createdRev.data.lot_transfer_id || createdRev.data.id);

  // Invert movements
  const outTypeId = await resolveTransactionTypeId("LOT_TRANSFER_REVERSAL_OUT", "OUT");
  const inTypeId = await resolveTransactionTypeId("LOT_TRANSFER_REVERSAL_IN", "IN");

  for (const [idx, detail] of current.details.entries()) {
    // Detail line for reversal
    const revDetail = {
      lot_transfer_id: revId,
      line_no: idx + 1,
      product_id: detail.productId,
      source_inventory_lot_id: detail.targetInventoryLotId,
      source_batch_no: detail.targetBatchNo,
      target_inventory_lot_id: detail.sourceInventoryLotId,
      target_batch_no: detail.sourceBatchNo,
      quantity: detail.quantity,
      line_remarks: `Reversal line #${detail.lineNo}`,
      source_unit_cost: detail.targetUnitCost ?? detail.sourceUnitCost ?? null,
      target_unit_cost: detail.sourceUnitCost ?? detail.targetUnitCost ?? null,
      created_at: now,
      updated_at: now,
    };

    const createdDetail = await directusFetch<{ data: { lot_transfer_detail_id?: number; id?: number } }>(
      `/items/mm_lot_transfer_details`,
      {
        method: "POST",
        body: JSON.stringify(revDetail),
      }
    );
    const revDetailId = Number(createdDetail.data.lot_transfer_detail_id || createdDetail.data.id);

    // Compensating OUT (from previous target)
    await directusFetch(`/items/inventory_movements`, {
      method: "POST",
      body: JSON.stringify({
        product_id: detail.productId,
        branch_id: current.branchId,
        mm_lot_id: current.targetLotId,
        inventory_lot_id: detail.targetInventoryLotId,
        transaction_type_id: outTypeId,
        source_document_id: revId,
        source_document_no: revRequestNo,
        source_document_detail_id: revDetailId,
        batch_no: detail.targetBatchNo,
        quantity: -Math.abs(detail.quantity),
        created_by: activeUserId,
        created_at: now,
        remarks: `Reversal OUT of ${current.requestNo}`,
      }),
    });

    // Compensating IN (back to previous source)
    await directusFetch(`/items/inventory_movements`, {
      method: "POST",
      body: JSON.stringify({
        product_id: detail.productId,
        branch_id: current.branchId,
        mm_lot_id: current.sourceLotId,
        inventory_lot_id: detail.sourceInventoryLotId,
        transaction_type_id: inTypeId,
        source_document_id: revId,
        source_document_no: revRequestNo,
        source_document_detail_id: revDetailId,
        batch_no: detail.sourceBatchNo,
        quantity: Math.abs(detail.quantity),
        created_by: activeUserId,
        created_at: now,
        remarks: `Reversal IN back to ${current.sourceLotName || `Lot #${current.sourceLotId}`}`,
      }),
    });
  }

  // Update original transfer status to Reversed
  await directusFetch(`/items/mm_lot_transfers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "Reversed",
      reversed_by: activeUserId,
      reversed_at: now,
      reversal_reason: reason.trim(),
      updated_at: now,
    }),
  });

  // Write status history for original
  await directusFetch(`/items/mm_lot_transfer_status_history`, {
    method: "POST",
    body: JSON.stringify({
      lot_transfer_id: id,
      old_status: "Posted",
      new_status: "Reversed",
      changed_by: activeUserId,
      changed_at: now,
      remarks: `Reversed: ${reason.trim()} (Reversal Doc: ${revRequestNo})`,
      event_key: `LT-${id}-Reversed-${Date.now()}`,
    }),
  }).catch((err) => console.warn("Status history write warning:", err));

  return getLotTransferByIdServer(revId);
}

// Server Lookups for friendly name enrichment
interface ServerLookups {
  lots: Map<number, string>;
  branches: Map<number, { name: string; code?: string }>;
  units: Map<number, string>;
  users: Map<number, string>;
  products: Map<
    number,
    {
      name: string;
      code?: string;
      description?: string;
      productTypeId?: number | null;
      productTypeName?: string;
      classificationCode?: "RM" | "PKG" | "FG" | "OTHER";
    }
  >;
}

let serverLookupsCache: ServerLookups | null = null;
let serverLookupsCachedAt = 0;

export async function getServerLookups(): Promise<ServerLookups> {
  const now = Date.now();
  if (serverLookupsCache && now - serverLookupsCachedAt < 60000) {
    return serverLookupsCache;
  }

  const [rawLots, rawBranches, rawUnits, rawUsers, rawProducts] = await Promise.all([
    directusFetch<{ data: Array<{ lot_id?: number; lot_name?: string }> }>(
      "/items/mm_lots?limit=-1&fields=lot_id,lot_name"
    ).catch(() => ({ data: [] })),
    directusFetch<{ data: Array<{ id?: number; branch_name?: string; branch_code?: string }> }>(
      "/items/branches?limit=-1&fields=id,branch_name,branch_code"
    ).catch(() => ({ data: [] })),
    directusFetch<{ data: Array<{ unit_id?: number; unit_name?: string; unit_shortcut?: string }> }>(
      "/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut"
    ).catch(() => ({ data: [] })),
    directusFetch<{ data: Array<{ user_id?: number; user_fname?: string; user_lname?: string }> }>(
      "/items/user?limit=-1&fields=user_id,user_fname,user_lname"
    ).catch(() => ({ data: [] })),
    directusFetch<{
      data: Array<{
        product_id?: number;
        product_name?: string;
        product_code?: string;
        description?: string;
        product_type?: unknown;
        product_category?: unknown;
      }>;
    }>(
      "/items/products?limit=-1&fields=product_id,product_name,product_code,description,product_type,product_type.*,product_category.category_name"
    ).catch(() => ({ data: [] })),
  ]);

  const lots = new Map<number, string>();
  for (const l of rawLots.data || []) {
    const id = Number(l.lot_id || (l as Record<string, unknown>).id);
    if (id > 0 && l.lot_name) lots.set(id, String(l.lot_name));
  }

  const branches = new Map<number, { name: string; code?: string }>();
  for (const b of rawBranches.data || []) {
    const id = Number(b.id);
    if (id > 0) {
      branches.set(id, {
        name: String(b.branch_name || `Branch #${id}`),
        code: b.branch_code as string | undefined,
      });
    }
  }

  const units = new Map<number, string>();
  for (const u of rawUnits.data || []) {
    const id = Number(u.unit_id);
    const uName = String(u.unit_name || "");
    const sc = u.unit_shortcut as string | undefined;
    if (id > 0) units.set(id, sc ? `${uName} (${sc})` : uName || `Unit #${id}`);
  }

  const users = new Map<number, string>();
  for (const u of rawUsers.data || []) {
    const id = Number(u.user_id);
    const fname = String(u.user_fname || "").trim();
    const lname = String(u.user_lname || "").trim();
    const full = [fname, lname].filter(Boolean).join(" ");
    if (id > 0) users.set(id, full || `User #${id}`);
  }

  const products = new Map<
    number,
    {
      name: string;
      code?: string;
      description?: string;
      productTypeId?: number | null;
      productTypeName?: string;
      classificationCode?: "RM" | "PKG" | "FG" | "OTHER";
    }
  >();
  for (const p of rawProducts.data || []) {
    const id = Number(p.product_id);
    if (id > 0) {
      const ptObj = p.product_type as { id?: number; name?: string } | number | undefined;
      const ptId =
        typeof ptObj === "object" && ptObj !== null
          ? Number(ptObj.id || 0)
          : typeof ptObj === "number"
          ? ptObj
          : null;
      const ptName = typeof ptObj === "object" && ptObj !== null ? String(ptObj.name || "") : "";
      const catObj = p.product_category as { category_name?: string } | undefined;
      const catName = catObj?.category_name || "";
      const classification = resolveProductClassification(ptName || ptId, catName);

      let resolvedPtId = ptId;
      if (!resolvedPtId || resolvedPtId <= 0) {
        if (classification.code === "RM") resolvedPtId = 389;
        else if (classification.code === "FG") resolvedPtId = 388;
        else if (classification.code === "PKG") resolvedPtId = 390;
      }

      products.set(id, {
        name: String(p.product_name || `Product #${id}`),
        code: p.product_code as string | undefined,
        description: p.description ? String(p.description).trim() : undefined,
        productTypeId: resolvedPtId || null,
        productTypeName:
          ptName ||
          (classification.code === "RM"
            ? "Raw Materials"
            : classification.code === "FG"
            ? "Finished Goods"
            : classification.code === "PKG"
            ? "Packaging Items"
            : ""),
        classificationCode: classification.code,
      });
    }
  }

  serverLookupsCache = { lots, branches, units, users, products };
  serverLookupsCachedAt = now;
  return serverLookupsCache;
}

// Helpers
function extractUserName(userObj: unknown): string | null {
  if (!userObj) return null;
  if (typeof userObj === "object") {
    const u = userObj as Record<string, unknown>;
    const name = [u.first_name || u.FirstName || u.user_fname, u.last_name || u.LastName || u.user_lname].filter(Boolean).join(" ");
    return name || String(u.email || "") || null;
  }
  return null;
}

function mapToLotTransfer(
  row: Record<string, unknown>,
  rawDetails?: Array<Record<string, unknown>>,
  lookups?: ServerLookups
): LotTransfer {
  const id = Number(row.lot_transfer_id || row.id);
  const sourceLot = row.source_lot_id as Record<string, unknown> | undefined;
  const targetLot = row.target_lot_id as Record<string, unknown> | undefined;
  const branch = row.branch_id as Record<string, unknown> | undefined;
  const unit = row.unit_id as Record<string, unknown> | undefined;

  const branchId = typeof row.branch_id === "object" ? Number(branch?.id || branch?.branch_id) : Number(row.branch_id);
  const sourceLotId = typeof row.source_lot_id === "object" ? Number(sourceLot?.lot_id || sourceLot?.id) : Number(row.source_lot_id);
  const targetLotId = typeof row.target_lot_id === "object" ? Number(targetLot?.lot_id || targetLot?.id) : Number(row.target_lot_id);
  const unitId = typeof row.unit_id === "object" ? Number(unit?.unit_id || unit?.id) : Number(row.unit_id || 1);

  const reqById = row.requested_by ? (typeof row.requested_by === "object" ? Number((row.requested_by as Record<string, unknown>)?.user_id || (row.requested_by as Record<string, unknown>)?.id) : Number(row.requested_by)) : null;
  const subById = row.submitted_by ? (typeof row.submitted_by === "object" ? Number((row.submitted_by as Record<string, unknown>)?.user_id || (row.submitted_by as Record<string, unknown>)?.id) : Number(row.submitted_by)) : null;
  const appById = row.approved_by ? (typeof row.approved_by === "object" ? Number((row.approved_by as Record<string, unknown>)?.user_id || (row.approved_by as Record<string, unknown>)?.id) : Number(row.approved_by)) : null;
  const postById = row.posted_by ? (typeof row.posted_by === "object" ? Number((row.posted_by as Record<string, unknown>)?.user_id || (row.posted_by as Record<string, unknown>)?.id) : Number(row.posted_by)) : null;
  const rejById = row.rejected_by ? (typeof row.rejected_by === "object" ? Number((row.rejected_by as Record<string, unknown>)?.user_id || (row.rejected_by as Record<string, unknown>)?.id) : Number(row.rejected_by)) : null;
  const canById = row.cancelled_by ? (typeof row.cancelled_by === "object" ? Number((row.cancelled_by as Record<string, unknown>)?.user_id || (row.cancelled_by as Record<string, unknown>)?.id) : Number(row.cancelled_by)) : null;
  const revById = row.reversed_by ? (typeof row.reversed_by === "object" ? Number((row.reversed_by as Record<string, unknown>)?.user_id || (row.reversed_by as Record<string, unknown>)?.id) : Number(row.reversed_by)) : null;

  const details: LotTransferDetail[] = (rawDetails || (row.details as Array<Record<string, unknown>>) || []).map(
    (d: Record<string, unknown>) => {
      const prod = d.product_id as Record<string, unknown> | undefined;
      const pId = typeof d.product_id === "object" ? Number(prod?.product_id || prod?.id) : Number(d.product_id);
      const prodMeta = lookups?.products.get(pId);
      const prodName = typeof d.product_id === "object"
        ? String(prod?.product_name || prod?.name || "")
        : (prodMeta?.name || (pId > 0 ? `Product #${pId}` : "-"));
      const prodCode = typeof d.product_id === "object"
        ? String(prod?.product_code || prod?.sku_code || prod?.code || "")
        : (prodMeta?.code || "-");
      const prodDesc = typeof d.product_id === "object"
        ? String(prod?.description || "")
        : (prodMeta?.description || "");

      return {
        detailId: Number(d.lot_transfer_detail_id || d.id),
        lotTransferId: id,
        lineNo: Number(d.line_no || 1),
        productId: pId,
        productName: prodName,
        productCode: prodCode,
        productDescription: prodDesc || undefined,
        productTypeId: prodMeta?.productTypeId || null,
        productTypeName: prodMeta?.productTypeName || undefined,
        productClassification: prodMeta?.classificationCode || undefined,
        sourceInventoryLotId: Number(d.source_inventory_lot_id),
        sourceBatchNo: String(d.source_batch_no || ""),
        targetInventoryLotId: d.target_inventory_lot_id ? Number(d.target_inventory_lot_id) : null,
        targetBatchNo: String(d.target_batch_no || ""),
        quantity: Number(d.quantity || 0),
        lineRemarks: d.line_remarks ? String(d.line_remarks) : undefined,
        sourceManufacturingDate: d.source_manufacturing_date ? String(d.source_manufacturing_date) : null,
        sourceExpiryDate: d.source_expiry_date ? String(d.source_expiry_date) : null,
        targetManufacturingDate: d.target_manufacturing_date ? String(d.target_manufacturing_date) : null,
        targetExpiryDate: d.target_expiry_date ? String(d.target_expiry_date) : null,
        sourceUnitCost: d.source_unit_cost !== null && d.source_unit_cost !== undefined ? Number(d.source_unit_cost) : null,
        targetUnitCost: d.target_unit_cost !== null && d.target_unit_cost !== undefined ? Number(d.target_unit_cost) : null,
        sourceBalanceBefore: d.source_balance_before !== null && d.source_balance_before !== undefined ? Number(d.source_balance_before) : null,
        sourceBalanceAfter: d.source_balance_after !== null && d.source_balance_after !== undefined ? Number(d.source_balance_after) : null,
        targetBalanceBefore: d.target_balance_before !== null && d.target_balance_before !== undefined ? Number(d.target_balance_before) : null,
        targetBalanceAfter: d.target_balance_after !== null && d.target_balance_after !== undefined ? Number(d.target_balance_after) : null,
        sourceMovementId: d.source_movement_id ? Number(d.source_movement_id) : null,
        targetMovementId: d.target_movement_id ? Number(d.target_movement_id) : null,
        destinationBatchAction: (d.destination_batch_action as "MERGE" | "CREATE") || null,
        validationStatus: d.validation_status ? String(d.validation_status) : null,
        validationError: d.validation_error ? String(d.validation_error) : null,
        postingError: d.posting_error ? String(d.posting_error) : null,
        reconciliationRequired: Boolean(d.reconciliation_required),
      };
    }
  );

  const branchMeta = lookups?.branches.get(branchId);

  const primaryLine = details[0];
  const headerProductId = typeof row.product_id === "object"
    ? Number((row.product_id as Record<string, unknown>)?.product_id || (row.product_id as Record<string, unknown>)?.id)
    : Number(row.product_id || primaryLine?.productId || 0);

  const headerProdMeta = lookups?.products.get(headerProductId);
  let resolvedProductTypeId = headerProdMeta?.productTypeId || primaryLine?.productTypeId || null;
  const resolvedProductTypeName = headerProdMeta?.productTypeName || primaryLine?.productTypeName || undefined;
  const resolvedClassification = headerProdMeta?.classificationCode || primaryLine?.productClassification || undefined;

  if (!resolvedProductTypeId && resolvedClassification) {
    if (resolvedClassification === "RM") resolvedProductTypeId = 389;
    else if (resolvedClassification === "FG") resolvedProductTypeId = 388;
    else if (resolvedClassification === "PKG") resolvedProductTypeId = 390;
  }

  return {
    id,
    requestNo: String(row.request_no || ""),
    status: (row.status as LotTransferStatus) || "Draft",
    branchId,
    branchName: typeof row.branch_id === "object" ? String(branch?.branch_name || "") : (branchMeta?.name || (branchId > 0 ? `Branch #${branchId}` : "-")),
    branchCode: typeof row.branch_id === "object" ? String(branch?.branch_code || "") : (branchMeta?.code || "-"),
    transferDate: String(row.transfer_date || "").slice(0, 10),
    unitId,
    unitName: typeof row.unit_id === "object" ? String(unit?.unit_name || unit?.name || "") : (lookups?.units.get(unitId) || "-"),
    productTypeId: resolvedProductTypeId,
    productTypeName: resolvedProductTypeName,
    productClassification: resolvedClassification,
    sourceLotId,
    sourceLotName: typeof row.source_lot_id === "object" ? String(sourceLot?.lot_name || "") : (lookups?.lots.get(sourceLotId) || "-"),
    targetLotId,
    targetLotName: typeof row.target_lot_id === "object" ? String(targetLot?.lot_name || "") : (lookups?.lots.get(targetLotId) || "-"),
    quantity: Number(row.quantity || 0),
    reason: String(row.reason || ""),
    requestedBy: reqById,
    requestedByName: extractUserName(row.requested_by) || (reqById ? lookups?.users.get(reqById) : undefined) || "-",
    requestedAt: row.requested_at ? String(row.requested_at) : null,
    submittedBy: subById,
    submittedByName: extractUserName(row.submitted_by) || (subById ? lookups?.users.get(subById) : undefined) || "-",
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    approvedBy: appById,
    approvedByName: extractUserName(row.approved_by) || (appById ? lookups?.users.get(appById) : undefined) || "-",
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    rejectedBy: rejById,
    rejectedByName: extractUserName(row.rejected_by) || (rejById ? lookups?.users.get(rejById) : undefined) || "-",
    rejectedAt: row.rejected_at ? String(row.rejected_at) : null,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    qaEvidence: row.qa_evidence ? String(row.qa_evidence) : null,
    postedBy: postById,
    postedByName: extractUserName(row.posted_by) || (postById ? lookups?.users.get(postById) : undefined) || "-",
    postedAt: row.posted_at ? String(row.posted_at) : null,
    cancelledBy: canById,
    cancelledByName: extractUserName(row.cancelled_by) || (canById ? lookups?.users.get(canById) : undefined) || "-",
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    cancellationReason: row.cancellation_reason ? String(row.cancellation_reason) : null,
    reversedBy: revById,
    reversedByName: extractUserName(row.reversed_by) || (revById ? lookups?.users.get(revById) : undefined) || "-",
    reversedAt: row.reversed_at ? String(row.reversed_at) : null,
    reversalReason: row.reversal_reason ? String(row.reversal_reason) : null,
    reversalOfId: row.reversal_of_id ? Number(row.reversal_of_id) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    lineCount: details.length,
    details,
  };
}

