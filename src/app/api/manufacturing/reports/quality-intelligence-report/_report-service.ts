import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    JOB_ORDER_STATUS,
    displayJobOrderStatus,
    normalizeJobOrderStatus,
    type CanonicalJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";
import type {
    AiTierInfo,
    ComponentGenealogyItem,
    QualityDefectParetoRow,
    QualityFilterCatalogPayload,
    QualityFilters,
    QualityJobOrderDetail,
    QualityKpiMetrics,
    QualityLotTraceRow,
    QualityReportPayload,
    QualityRootCauseRow,
    QualityTrendPoint
} from "@/modules/manufacturing-management/quality-intelligence-report/types";

type DirectusRecord = Record<string, unknown>;

const STORED_STATUS_VARIANTS: Record<CanonicalJobOrderStatus, string[]> = {
    [JOB_ORDER_STATUS.DRAFT]: ["Draft", "Planned", "Planning", "Shortage"],
    [JOB_ORDER_STATUS.FOR_PICKING]: ["For Picking", "Released", "Proceed"],
    [JOB_ORDER_STATUS.PICKED]: ["Picked", "Reserved"],
    [JOB_ORDER_STATUS.IN_PRODUCTION]: ["In Production", "Ongoing", "In Progress"],
    [JOB_ORDER_STATUS.ON_HOLD]: ["On Hold"],
    [JOB_ORDER_STATUS.QA_HOLD]: ["QA Hold"],
    [JOB_ORDER_STATUS.PRODUCTION_COMPLETED]: ["Production Completed", "Finished"],
    [JOB_ORDER_STATUS.FOR_QA_RECONCILIATION]: ["For QA and Reconciliation", "Completed"],
    [JOB_ORDER_STATUS.CLOSED]: ["Closed"],
    [JOB_ORDER_STATUS.CANCELLED]: ["Cancelled", "Canceled"]
};

function safeNumber(val: unknown, fallback: number = 0): number {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

function safeNumberOrNull(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

function parseBitBoolean(val: unknown): boolean {
    if (val === true || val === 1 || val === "1" || val === "true") return true;
    if (val === false || val === 0 || val === "0" || val === "false" || val === null || val === undefined) return false;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(val)) {
        return val.length > 0 && val[0] === 1;
    }
    if (typeof val === "object" && val !== null) {
        const obj = val as { type?: string; data?: unknown };
        if (Array.isArray(obj.data) && obj.data.length > 0) {
            return Number(obj.data[0]) === 1;
        }
        if (typeof obj.data === "number") {
            return obj.data === 1;
        }
    }
    if (typeof val === "string") {
        const trimmed = val.trim().toLowerCase();
        if (trimmed === "1" || trimmed === "true" || trimmed === "b'1'") return true;
        if (trimmed === "0" || trimmed === "false" || trimmed === "b'0'") return false;
        if (val.length > 0) {
            if (val.charCodeAt(0) === 1) return true;
            if (val.charCodeAt(0) === 0) return false;
        }
    }
    return Boolean(val);
}

function manilaTimestamp(date: Date): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

/**
 * DATETIME columns arrive without a timezone marker and are already the plant's wall-clock
 * value, so they must not be shifted by whatever clock the server runs on. Values that do
 * carry an offset are converted to Manila time.
 */
function manilaTimestampOrDash(value: unknown): string {
    if (value === null || value === undefined || value === "") return "-";
    const raw = String(value).trim();
    const wallClock = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?!\S*(?:Z|[+-]\d{2}:?\d{2}))/);
    if (wallClock) {
        return `${wallClock[1]}-${wallClock[2]}-${wallClock[3]} ${wallClock[4]}:${wallClock[5]}:${wallClock[6]}`;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? "-" : manilaTimestamp(date);
}

interface LotFieldObject {
    lot_id?: unknown;
    lot_name?: unknown;
}

function resolveLotName(
    mmLotField: unknown,
    lotField: unknown,
    lotMap: Map<number, string>
): string | null {
    if (mmLotField && typeof mmLotField === "object" && "lot_name" in mmLotField) {
        const name = String((mmLotField as LotFieldObject).lot_name || "").trim();
        if (name) return name;
    }
    const mmLotId = Number(
        typeof mmLotField === "object" && mmLotField !== null
            ? (mmLotField as LotFieldObject).lot_id
            : mmLotField
    );
    if (Number.isInteger(mmLotId) && mmLotId > 0 && lotMap.has(mmLotId)) {
        return lotMap.get(mmLotId)!;
    }
    if (lotField && typeof lotField === "object" && "lot_name" in lotField) {
        const name = String((lotField as LotFieldObject).lot_name || "").trim();
        if (name) return name;
    }
    const lotId = Number(
        typeof lotField === "object" && lotField !== null
            ? (lotField as LotFieldObject).lot_id
            : lotField
    );
    if (Number.isInteger(lotId) && lotId > 0 && lotMap.has(lotId)) {
        return lotMap.get(lotId)!;
    }
    return null;
}

async function fetchDirectus(
    url: string,
    collection: string,
    signal?: AbortSignal
): Promise<DirectusRecord | null> {
    let res: Response;
    try {
        res = await fetch(url, { headers, signal, cache: "no-store" });
    } catch (err) {
        if (signal?.aborted) throw err;
        throw new Error(`Could not reach Directus for ${collection}.`);
    }
    if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const reason =
            payload?.errors?.[0]?.message ?? payload?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(`Directus query failed for ${collection}: ${reason}`);
    }
    const payload = await res.json().catch(() => null);
    if (!payload || !("data" in payload)) {
        throw new Error(`Directus returned no data envelope for ${collection}.`);
    }
    return payload.data as DirectusRecord | null;
}

async function fetchDirectusRows(
    url: string,
    collection: string,
    signal?: AbortSignal
): Promise<DirectusRecord[]> {
    const data = await fetchDirectus(url, collection, signal);
    if (!Array.isArray(data)) {
        return [];
    }
    return data as DirectusRecord[];
}

export async function resolveServerAiTier(signal?: AbortSignal): Promise<AiTierInfo> {
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        return {
            assigned: true,
            tierLevel: 3,
            tierName: "Executive Strategic (Default)",
            tierSlug: "executive",
            description: "Default strategic advisory tier active for authorized manufacturing users."
        };
    }

    try {
        const params = new URLSearchParams({
            "filter[base_path][_eq]": "/mm/reports/quality-intelligence-report",
            fields: "id,title,ai_tier.id,ai_tier.name,ai_tier.slug,ai_tier.tier_level,ai_tier.description",
            limit: "1"
        });
        const url = `${directusBase}/items/modules?${params.toString()}`;
        const rows = await fetchDirectusRows(url, "modules", signal);
        const mod = rows[0];
        const tierObj =
            mod && typeof mod.ai_tier === "object" && mod.ai_tier !== null
                ? (mod.ai_tier as Record<string, unknown>)
                : null;

        if (tierObj) {
            const slugRaw = String(tierObj.slug || "basic").toLowerCase();
            const slug =
                slugRaw === "executive" || slugRaw === "pro" || slugRaw === "basic"
                    ? slugRaw
                    : "basic";
            return {
                assigned: true,
                tierLevel: Number(tierObj.tier_level) || 1,
                tierName: String(tierObj.name || "Basic"),
                tierSlug: slug,
                description: String(tierObj.description || "")
            };
        }
    } catch {
        // Fall back to default
    }

    return {
        assigned: true,
        tierLevel: 3,
        tierName: "Executive Strategic (Default)",
        tierSlug: "executive",
        description: "Default strategic advisory tier active for authorized manufacturing users."
    };
}

export async function fetchQualityFilterCatalog(
    signal?: AbortSignal
): Promise<QualityFilterCatalogPayload> {
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        throw new Error("Directus API URL is not configured.");
    }

    const [productRows, wcRows] = await Promise.all([
        fetchDirectusRows(
            `${directusBase}/items/products?fields=product_id,product_name,product_code&filter[isActive][_eq]=1&limit=-1`,
            "products",
            signal
        ),
        fetchDirectusRows(
            `${directusBase}/items/manufacturing_work_centers?fields=work_center_id,work_center_name&filter[is_active][_eq]=1&limit=-1`,
            "manufacturing_work_centers",
            signal
        )
    ]);

    return {
        products: productRows.map((p: DirectusRecord) => ({
            id: Number(p.product_id),
            code: String(p.product_code || ""),
            name: String(p.product_name || "Unnamed Product")
        })),
        workCenters: wcRows.map((wc: DirectusRecord) => ({
            id: Number(wc.work_center_id),
            name: String(wc.work_center_name || "Unnamed Work Center")
        })),
        shifts: [
            "Shift 1 - Day",
            "Shift 2 - Swing",
            "Shift 3 - Night",
            "Daily Summary"
        ]
    };
}

export async function buildQualityIntelligenceReport(params: {
    filters: QualityFilters;
    accessToken: string;
    signal?: AbortSignal;
}): Promise<QualityReportPayload> {
    const { filters, signal } = params;
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        throw new Error("Directus API URL is not configured.");
    }

    // 1. Build filter for Job Orders
    const joFilter: Record<string, unknown> = {};

    if (filters.dateFrom && filters.dateTo) {
        joFilter._or = [
            { start_date: { _between: [filters.dateFrom, filters.dateTo] } },
            { created_at: { _between: [`${filters.dateFrom} 00:00:00`, `${filters.dateTo} 23:59:59`] } }
        ];
    } else if (filters.dateFrom) {
        joFilter.start_date = { _gte: filters.dateFrom };
    } else if (filters.dateTo) {
        joFilter.start_date = { _lte: filters.dateTo };
    }

    if (filters.productId && filters.productId !== "all") {
        joFilter.product_id = { _eq: Number(filters.productId) };
    }

    if (filters.workCenterId && filters.workCenterId !== "all") {
        // Find matching Job Orders whose routing contains this work center
        const routeMatchingJoRows = await fetchDirectusRows(
            `${directusBase}/items/manufacturing_job_order_routes?filter[work_center_id][_eq]=${filters.workCenterId}&fields=job_order_id&limit=-1`,
            "manufacturing_job_order_routes",
            signal
        ).catch(() => []);
        const matchingJoIds = routeMatchingJoRows
            .map((r) => Number(typeof r.job_order_id === "object" ? r.job_order_id?.job_order_id : r.job_order_id))
            .filter((id) => Number.isInteger(id) && id > 0);

        if (matchingJoIds.length > 0) {
            joFilter._or = [
                { job_order_id: { _in: matchingJoIds } },
                { primary_work_center_id: { _eq: Number(filters.workCenterId) } }
            ];
        } else {
            joFilter.primary_work_center_id = { _eq: Number(filters.workCenterId) };
        }
    }

    if (filters.status && filters.status !== "all") {
        const canonical = normalizeJobOrderStatus(filters.status);
        const variants = canonical ? STORED_STATUS_VARIANTS[canonical] : [String(filters.status)];
        joFilter.status = { _in: variants };
    }

    const joQuery = new URLSearchParams({
        filter: JSON.stringify(joFilter),
        fields: "job_order_id,job_order_no,product_id.product_id,product_id.product_name,product_id.product_code,status,target_quantity,actual_quantity_produced,completed_quantity,rejected_quantity,start_date,end_date,primary_work_center_id.work_center_id,primary_work_center_id.work_center_name",
        sort: "-created_at",
        limit: "500"
    });

    const rawJobOrders = await fetchDirectusRows(
        `${directusBase}/items/manufacturing_job_orders?${joQuery.toString()}`,
        "manufacturing_job_orders",
        signal
    );
    const jobOrderIds = rawJobOrders
        .map((j) => Number(j.job_order_id))
        .filter((id) => Number.isInteger(id) && id > 0);

    const EMPTY_ROWS: DirectusRecord[] = [];
    const scoped = jobOrderIds.length > 0;

    // 2. Fetch related data in parallel
    const yieldFilter: Record<string, unknown> = scoped ? { job_order_id: { _in: jobOrderIds } } : {};
    if (filters.shiftName && filters.shiftName !== "all") {
        yieldFilter.shift_name = { _eq: filters.shiftName };
    }

    const [
        yieldRows,
        qaRecords,
        dispositionRows,
        genealogyRows,
        routeOperators,
        jobOrderRoutes,
        mmLotsRows,
        lotsRows,
        allWorkCenters,
        aiTier
    ] = await Promise.all([
        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_job_order_yield_ledger?filter=${encodeURIComponent(
                      JSON.stringify(yieldFilter)
                  )}&fields=ledger_id,job_order_id,shift_name,yield_quantity,scrap_quantity,rejected_quantity,qa_status,logged_at,lot_number,mm_lot_id,work_center_id.work_center_id,work_center_id.work_center_name&limit=-1`,
                  "manufacturing_job_order_yield_ledger",
                  signal
              )
            : EMPTY_ROWS,

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_job_order_qa_records?filter=${encodeURIComponent(
                      JSON.stringify({ job_order_id: { _in: jobOrderIds } })
                  )}&fields=qa_record_id,job_order_id,is_passed,parameter_id.parameter_id,parameter_id.test_name,parameter_id.is_critical,inspected_at&limit=-1`,
                  "manufacturing_job_order_qa_records",
                  signal
              )
            : EMPTY_ROWS,

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_qa_dispositions?filter=${encodeURIComponent(
                      JSON.stringify({ job_order_id: { _in: jobOrderIds } })
                  )}&fields=id,job_order_id,product_name,task_name,station_name,expected_quantity,actual_quantity,failed_parameters,disposition_status,decision,recorded_at&limit=-1`,
                  "manufacturing_qa_dispositions",
                  signal
              )
            : EMPTY_ROWS,

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/jo_material_genealogy?filter=${encodeURIComponent(
                      JSON.stringify({ job_order_id: { _in: jobOrderIds } })
                  )}&fields=genealogy_id,job_order_id,batch_no,component_product_id.product_id,component_product_id.product_name,component_lot_id,component_lot_id.lot_name,component_mm_lot_id,component_mm_lot_id.lot_name,component_batch_no,consumed_quantity&limit=-1`,
                  "jo_material_genealogy",
                  signal
              ).catch(() => [])
            : EMPTY_ROWS,

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_job_order_route_operators?filter=${encodeURIComponent(
                      JSON.stringify({ "jo_route_id.job_order_id": { _in: jobOrderIds } })
                  )}&fields=jo_route_operator_id,jo_route_id.job_order_id,operator_id.user_fname,operator_id.user_lname,operator_id.user_id&limit=-1`,
                  "manufacturing_job_order_route_operators",
                  signal
              ).catch(() => [])
            : EMPTY_ROWS,

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_job_order_routes?filter=${encodeURIComponent(
                      JSON.stringify({ job_order_id: { _in: jobOrderIds } })
                  )}&fields=jo_route_id,job_order_id,sequence_order,work_center_id,work_center_id.work_center_id,work_center_id.work_center_name,status&sort=sequence_order&limit=-1`,
                  "manufacturing_job_order_routes",
                  signal
              ).catch(() => [])
            : EMPTY_ROWS,

        fetchDirectusRows(
            `${directusBase}/items/mm_lots?limit=-1&fields=lot_id,lot_name`,
            "mm_lots",
            signal
        ).catch(() => []),

        fetchDirectusRows(
            `${directusBase}/items/lots?limit=-1&fields=lot_id,lot_name`,
            "lots",
            signal
        ).catch(() => []),

        fetchDirectusRows(
            `${directusBase}/items/manufacturing_work_centers?fields=work_center_id,work_center_name&limit=-1`,
            "manufacturing_work_centers",
            signal
        ).catch(() => []),

        resolveServerAiTier(signal)
    ]);

    // Map of lot_id -> lot_name for resolving lot labels
    const lotNameMap = new Map<number, string>();
    for (const l of lotsRows) {
        const id = Number(l.lot_id);
        if (id && l.lot_name) lotNameMap.set(id, String(l.lot_name).trim());
    }
    for (const ml of mmLotsRows) {
        const id = Number(ml.lot_id);
        if (id && ml.lot_name) lotNameMap.set(id, String(ml.lot_name).trim());
    }

    // 3. Process Yield and Quality Per Job Order
    const yieldByJo = new Map<
        number,
        {
            yieldQty: number;
            scrapQty: number;
            rejectedQty: number;
            passedYieldQty: number;
            shifts: Set<string>;
            lots: Set<string>;
            qaHoldCount: number;
        }
    >();

    for (const yr of yieldRows) {
        const jid = Number(typeof yr.job_order_id === "object" ? yr.job_order_id?.job_order_id : yr.job_order_id);
        if (!jid) continue;

        const cur = yieldByJo.get(jid) || {
            yieldQty: 0,
            scrapQty: 0,
            rejectedQty: 0,
            passedYieldQty: 0,
            shifts: new Set(),
            lots: new Set(),
            qaHoldCount: 0
        };

        const y = safeNumber(yr.yield_quantity);
        const s = safeNumber(yr.scrap_quantity);
        const r = safeNumber(yr.rejected_quantity);

        cur.yieldQty += y;
        cur.scrapQty += s;
        cur.rejectedQty += r;

        const qaStatus = String(yr.qa_status || "").trim().toLowerCase();
        if (qaStatus === "passed") {
            cur.passedYieldQty += y;
        } else if (qaStatus.includes("hold") || qaStatus.includes("quarantine")) {
            cur.qaHoldCount += 1;
        }

        if (yr.shift_name) cur.shifts.add(String(yr.shift_name));
        let resolvedLot: string | null = null;
        if (yr.lot_number && String(yr.lot_number).trim()) {
            resolvedLot = String(yr.lot_number).trim();
        } else if (yr.mm_lot_id) {
            resolvedLot = resolveLotName(yr.mm_lot_id, null, lotNameMap);
        }
        if (resolvedLot) cur.lots.add(resolvedLot);

        yieldByJo.set(jid, cur);
    }

    // Genealogy mapping per Job Order (captures both component lot/batch and finished output batch)
    const finishedBatchesByJo = new Map<number, Set<string>>();
    const genealogyByJo = new Map<number, ComponentGenealogyItem[]>();
    for (const g of genealogyRows) {
        const jid = Number(typeof g.job_order_id === "object" ? g.job_order_id?.job_order_id : g.job_order_id);
        if (!jid) continue;

        if (g.batch_no && String(g.batch_no).trim()) {
            const bSet = finishedBatchesByJo.get(jid) || new Set<string>();
            bSet.add(String(g.batch_no).trim());
            finishedBatchesByJo.set(jid, bSet);
        }

        const compLot = resolveLotName(g.component_mm_lot_id, g.component_lot_id, lotNameMap);
        const list = genealogyByJo.get(jid) || [];
        const prod = typeof g.component_product_id === "object" && g.component_product_id ? g.component_product_id : null;
        list.push({
            componentProductId: prod ? Number(prod.product_id) : safeNumber(g.component_product_id),
            componentProductName: prod ? String(prod.product_name || "Component Item") : `Product #${g.component_product_id}`,
            componentBatchNo: String(g.component_batch_no || "-").trim(),
            componentLotName: compLot,
            consumedQty: safeNumber(g.consumed_quantity),
            componentLotId: g.component_lot_id ? Number(g.component_lot_id) : null,
            componentMmLotId: g.component_mm_lot_id ? Number(g.component_mm_lot_id) : null
        });
        genealogyByJo.set(jid, list);
    }

    // Work center name lookup
    const wcNameMap = new Map<number, string>();
    for (const wc of allWorkCenters) {
        const wid = Number(wc.work_center_id || wc.id);
        if (wid && (wc.work_center_name || wc.name)) {
            wcNameMap.set(wid, String(wc.work_center_name || wc.name).trim());
        }
    }

    // Authoritative routing and work center mapping from manufacturing_job_order_routes
    const routesByJo = new Map<number, Array<{ workCenterId: number; workCenterName: string; sequence: number }>>();
    for (const r of jobOrderRoutes) {
        const jid = Number(typeof r.job_order_id === "object" ? r.job_order_id?.job_order_id : r.job_order_id);
        if (!jid) continue;

        let wcId = 0;
        let wcName = "";
        if (r.work_center_id && typeof r.work_center_id === "object") {
            wcId = Number(r.work_center_id.work_center_id || r.work_center_id.id);
            wcName = String(r.work_center_id.work_center_name || r.work_center_id.name || "").trim();
        } else if (r.work_center_id) {
            wcId = Number(r.work_center_id);
        }
        if (!wcName && wcId > 0) {
            wcName = wcNameMap.get(wcId) || `Station #${wcId}`;
        }

        if (wcId > 0 && wcName) {
            const list = routesByJo.get(jid) || [];
            list.push({
                workCenterId: wcId,
                workCenterName: wcName,
                sequence: Number(r.sequence_order || list.length + 1)
            });
            routesByJo.set(jid, list);
        }
    }

    // Operator mapping per Job Order
    const operatorsByJo = new Map<number, Set<string>>();
    for (const ro of routeOperators) {
        const jid = Number(ro.jo_route_id?.job_order_id);
        if (!jid) continue;
        const u = ro.operator_id;
        const name = u ? [u.user_fname, u.user_lname].filter(Boolean).join(" ") : null;
        if (!name) continue;
        const cur = operatorsByJo.get(jid) || new Set<string>();
        cur.add(name);
        operatorsByJo.set(jid, cur);
    }

    // 4. Assemble Lot Trace Rows
    const lotTrace: QualityLotTraceRow[] = rawJobOrders.map((jo) => {
        const id = Number(jo.job_order_id);
        const prod = typeof jo.product_id === "object" && jo.product_id ? jo.product_id : null;
        const wc = typeof jo.primary_work_center_id === "object" && jo.primary_work_center_id ? jo.primary_work_center_id : null;

        const yInfo = yieldByJo.get(id);
        const target = safeNumber(jo.target_quantity);
        const actual = safeNumberOrNull(jo.actual_quantity_produced);
        const completed = safeNumberOrNull(jo.completed_quantity);
        const rejected = safeNumberOrNull(jo.rejected_quantity) ?? (yInfo?.rejectedQty ?? null);
        const scrap = yInfo ? yInfo.scrapQty : null;

        const producedQty = completed ?? actual ?? (yInfo ? yInfo.yieldQty : null);
        const defectiveUnits = (rejected || 0) + (yInfo?.qaHoldCount ? yInfo.qaHoldCount * 10 : 0);

        let defectRatePct: number | null = null;
        if (producedQty && producedQty > 0) {
            defectRatePct = Number(((defectiveUnits / producedQty) * 100).toFixed(1));
        }

        let qaStatus = "Passed";
        if (yInfo && yInfo.qaHoldCount > 0) {
            qaStatus = "QA Hold";
        } else if (rejected && rejected > 0) {
            qaStatus = "Defects Detected";
        }

        const shiftStr = yInfo && yInfo.shifts.size > 0 ? Array.from(yInfo.shifts).join(", ") : "-";
        const lotStr = yInfo && yInfo.lots.size > 0 ? Array.from(yInfo.lots).join(", ") : `LOT-JO-${id}`;
        const finishedBatchSet = finishedBatchesByJo.get(id);
        const finishedBatchNo = finishedBatchSet && finishedBatchSet.size > 0
            ? Array.from(finishedBatchSet).join(", ")
            : null;
        const opStr = operatorsByJo.has(id) ? Array.from(operatorsByJo.get(id)!).join(", ") : "-";

        // Resolve Line / Station from manufacturing_job_order_routes
        const joRoutes = routesByJo.get(id) || [];
        joRoutes.sort((a, b) => a.sequence - b.sequence);

        let resolvedWcId: number | null = null;
        let resolvedWcName: string | null = null;

        if (joRoutes.length > 0) {
            resolvedWcId = joRoutes[0].workCenterId;
            const uniqueNames = Array.from(new Set(joRoutes.map((r) => r.workCenterName)));
            resolvedWcName = uniqueNames.join(" / ");
        } else if (wc && (wc.work_center_name || wc.name)) {
            resolvedWcId = Number(wc.work_center_id || wc.id);
            resolvedWcName = String(wc.work_center_name || wc.name);
        }

        return {
            jobOrderId: id,
            jobOrderNo: String(jo.job_order_no || `JO-${id}`),
            productId: prod ? Number(prod.product_id) : safeNumber(jo.product_id),
            productCode: prod ? String(prod.product_code || "") : "",
            productName: prod ? String(prod.product_name || `Product #${jo.product_id}`) : `Product #${jo.product_id}`,
            finishedLotNumber: lotStr,
            finishedBatchNo,
            startDate: jo.start_date ? String(jo.start_date) : null,
            endDate: jo.end_date ? String(jo.end_date) : null,
            workCenterId: resolvedWcId,
            workCenterName: resolvedWcName || "-",
            shiftName: shiftStr,
            operatorName: opStr,
            targetQty: target,
            producedQty,
            completedQty: completed,
            rejectedQty: rejected,
            scrapQty: scrap,
            defectRatePct,
            qaStatus,
            componentBatches: genealogyByJo.get(id) || []
        };
    });

    // 5. Defect Pareto from Dispositions and QA Records
    const defectCountMap = new Map<string, { qty: number; count: number; isCrit: boolean }>();

    for (const d of dispositionRows) {
        let failedParams: unknown = d.failed_parameters;
        if (typeof failedParams === "string") {
            try {
                failedParams = JSON.parse(failedParams);
            } catch {
                failedParams = [];
            }
        }
        if (!Array.isArray(failedParams) || failedParams.length === 0) continue;

        const failedQty = Math.max(0, safeNumber(d.expected_quantity) - safeNumber(d.actual_quantity));
        const share = failedQty > 0 ? failedQty / failedParams.length : 1;

        for (const p of failedParams as DirectusRecord[]) {
            const label = String(p?.test_name || "Unspecified Defect").trim();
            const cur = defectCountMap.get(label) || { qty: 0, count: 0, isCrit: false };
            cur.qty += share;
            cur.count += 1;
            defectCountMap.set(label, cur);
        }
    }

    // Also include in-process QA failed records
    for (const qr of qaRecords) {
        if (!parseBitBoolean(qr.is_passed)) {
            const label = String(qr.parameter_id?.test_name || "Parameter Inspection Failure").trim();
            const isCrit = parseBitBoolean(qr.parameter_id?.is_critical);
            const cur = defectCountMap.get(label) || { qty: 0, count: 0, isCrit: false };
            cur.qty += 1; // 1 unit defect observation
            cur.count += 1;
            cur.isCrit = cur.isCrit || isCrit;
            defectCountMap.set(label, cur);
        }
    }

    const totalDefectQty = Array.from(defectCountMap.values()).reduce((sum, v) => sum + v.qty, 0);
    const sortedDefects = Array.from(defectCountMap.entries()).sort((a, b) => b[1].qty - a[1].qty);

    let cumulativeSum = 0;
    const defectPareto: QualityDefectParetoRow[] = sortedDefects.map(([label, info]) => {
        cumulativeSum += info.qty;
        const cumulativePct =
            totalDefectQty > 0 ? Number(((cumulativeSum / totalDefectQty) * 100).toFixed(1)) : 100;
        return {
            defectLabel: label,
            defectQuantity: Number(info.qty.toFixed(1)),
            defectiveUnits: info.count,
            cumulativePct,
            isCritical: info.isCrit
        };
    });

    // 6. Overall Quality KPIs
    let totalInspected = 0;
    let totalYieldProduced = 0;
    let totalScrap = 0;
    let totalRejected = 0;
    let totalPassedYield = 0;

    for (const y of yieldByJo.values()) {
        totalYieldProduced += y.yieldQty;
        totalScrap += y.scrapQty;
        totalRejected += y.rejectedQty;
        totalPassedYield += y.passedYieldQty;
    }

    totalInspected = totalYieldProduced + totalScrap + totalRejected;
    if (totalInspected === 0) {
        totalInspected = rawJobOrders.reduce((sum, jo) => sum + (safeNumber(jo.completed_quantity) || safeNumber(jo.actual_quantity_produced) || 0), 0);
    }

    const totalDefective = totalRejected + Array.from(defectCountMap.values()).reduce((sum, d) => sum + d.count, 0);

    const defectRatePct = totalInspected > 0 ? Number(((totalDefective / totalInspected) * 100).toFixed(1)) : null;
    const scrapRatePct =
        totalYieldProduced + totalScrap > 0
            ? Number(((totalScrap / (totalYieldProduced + totalScrap)) * 100).toFixed(1))
            : null;

    // First Pass Yield excludes units requiring rework or rejected
    const fpyPct = totalInspected > 0 ? Number(((totalPassedYield / totalInspected) * 100).toFixed(1)) : null;

    // Repeat Defect Count: defects that appear in >= 2 distinct places
    const repeatDefectCount = Array.from(defectCountMap.values()).filter((d) => d.count >= 2).length;

    const qaHoldBatchCount = rawJobOrders.filter((jo) => {
        const s = String(jo.status || "").toLowerCase();
        return s.includes("hold") || s.includes("reconciliation");
    }).length;

    const kpis: QualityKpiMetrics = {
        defectRatePct,
        scrapRatePct,
        fpyPct,
        repeatDefectCount,
        qaHoldBatchCount,
        totalInspectedUnits: Number(totalInspected.toFixed(1)),
        totalDefectiveUnits: Number(totalDefective.toFixed(1)),
        totalScrapUnits: Number(totalScrap.toFixed(1)),
        totalJobOrders: rawJobOrders.length
    };

    // 8. Trend Series (Grouped by date)
    const trendMap = new Map<
        string,
        {
            date: string;
            inspected: number;
            defective: number;
            scrap: number;
            passed: number;
        }
    >();

    for (const jo of lotTrace) {
        const d = jo.startDate || filters.dateFrom || "2026-11-01";
        const cur = trendMap.get(d) || {
            date: d,
            inspected: 0,
            defective: 0,
            scrap: 0,
            passed: 0
        };

        const ins = jo.producedQty || jo.targetQty || 0;
        const def = jo.rejectedQty || 0;
        const scr = jo.scrapQty || 0;

        cur.inspected += ins;
        cur.defective += def;
        cur.scrap += scr;
        if (jo.qaStatus === "Passed") cur.passed += Math.max(0, ins - def - scr);

        trendMap.set(d, cur);
    }

    const sortedDates = Array.from(trendMap.keys()).sort();
    const trendSeries: QualityTrendPoint[] = sortedDates.map((dateStr) => {
        const item = trendMap.get(dateStr)!;
        const dObj = new Date(dateStr);
        const periodLabel = !isNaN(dObj.getTime())
            ? dObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : dateStr;

        const dRate = item.inspected > 0 ? Number(((item.defective / item.inspected) * 100).toFixed(1)) : null;
        const sRate = item.inspected > 0 ? Number(((item.scrap / item.inspected) * 100).toFixed(1)) : null;
        const fRate = item.inspected > 0 ? Number(((item.passed / item.inspected) * 100).toFixed(1)) : null;

        return {
            periodLabel,
            date: dateStr,
            defectRatePct: dRate,
            scrapRatePct: sRate,
            fpyPct: fRate,
            inspectedQty: Number(item.inspected.toFixed(1)),
            defectiveQty: Number(item.defective.toFixed(1)),
            scrapQty: Number(item.scrap.toFixed(1))
        };
    });

    // 9. Root-Cause Correlations
    const rootCauseCorrelations: QualityRootCauseRow[] = [];

    // By Work Center
    const wcDefectMap = new Map<string, { label: string; count: number; defectiveQty: number }>();
    for (const jo of lotTrace) {
        if (!jo.workCenterName || jo.workCenterName === "-") continue;
        const cur = wcDefectMap.get(jo.workCenterName) || { label: jo.workCenterName, count: 0, defectiveQty: 0 };
        if ((jo.rejectedQty && jo.rejectedQty > 0) || jo.qaStatus !== "Passed") {
            cur.count += 1;
            cur.defectiveQty += jo.rejectedQty || 0;
        }
        wcDefectMap.set(jo.workCenterName, cur);
    }
    for (const [name, val] of wcDefectMap.entries()) {
        if (val.defectiveQty > 0) {
            rootCauseCorrelations.push({
                dimensionType: "work_center",
                dimensionLabel: name,
                defectCount: val.count,
                defectiveQty: Number(val.defectiveQty.toFixed(1)),
                primaryDefectLabel: defectPareto[0]?.defectLabel || "General Rejection",
                correlationScore: Math.min(100, Math.round((val.count / Math.max(1, rawJobOrders.length)) * 100))
            });
        }
    }

    // By Shift
    const shiftDefectMap = new Map<string, { label: string; count: number; defectiveQty: number }>();
    for (const jo of lotTrace) {
        if (!jo.shiftName || jo.shiftName === "-") continue;
        const cur = shiftDefectMap.get(jo.shiftName) || { label: jo.shiftName, count: 0, defectiveQty: 0 };
        if ((jo.rejectedQty && jo.rejectedQty > 0) || jo.qaStatus !== "Passed") {
            cur.count += 1;
            cur.defectiveQty += jo.rejectedQty || 0;
        }
        shiftDefectMap.set(jo.shiftName, cur);
    }
    for (const [name, val] of shiftDefectMap.entries()) {
        if (val.defectiveQty > 0) {
            rootCauseCorrelations.push({
                dimensionType: "shift",
                dimensionLabel: name,
                defectCount: val.count,
                defectiveQty: Number(val.defectiveQty.toFixed(1)),
                primaryDefectLabel: defectPareto[0]?.defectLabel || "Shift Discrepancy",
                correlationScore: Math.min(100, Math.round((val.count / Math.max(1, rawJobOrders.length)) * 100))
            });
        }
    }

    // Sort correlations by defective quantity
    rootCauseCorrelations.sort((a, b) => b.defectiveQty - a.defectiveQty);

    // Meta Labels
    const productLabel =
        filters.productId && filters.productId !== "all"
            ? lotTrace.find((j) => String(j.productId) === filters.productId)?.productName || "Selected SKU"
            : "All Products";

    const workCenterLabel =
        filters.workCenterId && filters.workCenterId !== "all"
            ? allWorkCenters.find((w) => String(w.work_center_id) === filters.workCenterId)?.work_center_name || "Selected Station"
            : "All Work Centers";

    return {
        meta: {
            dateLabel: `${filters.dateFrom || "Start"} to ${filters.dateTo || "End"}`,
            productLabel,
            workCenterLabel,
            shiftLabel: filters.shiftName === "all" ? "All Shifts" : filters.shiftName,
            statusLabel:
                filters.status && filters.status !== "all"
                    ? displayJobOrderStatus(filters.status)
                    : "All Statuses",
            freshnessCutoff: manilaTimestamp(new Date()),
            totalRecordsEvaluated: rawJobOrders.length,
            aiTier,
            notices: []
        },
        kpis,
        defectPareto,
        trendSeries,
        lotTrace,
        rootCauseCorrelations
    };
}

export async function fetchQualityJobOrderDetail(
    jobOrderId: number,
    signal?: AbortSignal
): Promise<QualityJobOrderDetail> {
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        throw new Error("Directus API URL is not configured.");
    }

    const [
        joRaw,
        yieldRows,
        genealogyRows,
        qaRows,
        dispoRows,
        routeRows,
        workCenterRows,
        mmLotsRows,
        lotsRows
    ] = await Promise.all([
        fetchDirectus(
            `${directusBase}/items/manufacturing_job_orders/${jobOrderId}?fields=job_order_id,job_order_no,product_id.product_name,status,target_quantity,actual_quantity_produced,completed_quantity`,
            `manufacturing_job_orders/${jobOrderId}`,
            signal
        ),
        fetchDirectusRows(
            `${directusBase}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${jobOrderId}&fields=ledger_id,shift_name,yield_quantity,scrap_quantity,rejected_quantity,qa_status,logged_at,lot_number,mm_lot_id,work_center_id.work_center_name&sort=-logged_at`,
            "manufacturing_job_order_yield_ledger",
            signal
        ),
        fetchDirectusRows(
            `${directusBase}/items/jo_material_genealogy?filter[job_order_id][_eq]=${jobOrderId}&fields=genealogy_id,batch_no,component_product_id.product_id,component_product_id.product_name,component_lot_id,component_lot_id.lot_name,component_mm_lot_id,component_mm_lot_id.lot_name,component_batch_no,consumed_quantity`,
            "jo_material_genealogy",
            signal
        ).catch(() => []),
        fetchDirectusRows(
            `${directusBase}/items/manufacturing_job_order_qa_records?filter[job_order_id][_eq]=${jobOrderId}&fields=qa_record_id,parameter_id.test_name,parameter_id.test_type,parameter_id.is_critical,value_text,value_numeric,value_boolean,is_passed,inspected_at,remarks`,
            "manufacturing_job_order_qa_records",
            signal
        ),
        fetchDirectusRows(
            `${directusBase}/items/manufacturing_qa_dispositions?filter[job_order_id][_eq]=${jobOrderId}&fields=id,task_name,station_name,expected_quantity,actual_quantity,failed_parameters,decision`,
            "manufacturing_qa_dispositions",
            signal
        ).catch(() => []),
        fetchDirectusRows(
            `${directusBase}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,sequence_order,work_center_id,work_center_id.work_center_id,work_center_id.work_center_name,status&sort=sequence_order&limit=-1`,
            "manufacturing_job_order_routes",
            signal
        ).catch(() => []),
        fetchDirectusRows(
            `${directusBase}/items/manufacturing_work_centers?fields=work_center_id,work_center_name&limit=-1`,
            "manufacturing_work_centers",
            signal
        ).catch(() => []),
        fetchDirectusRows(
            `${directusBase}/items/mm_lots?limit=-1&fields=lot_id,lot_name`,
            "mm_lots",
            signal
        ).catch(() => []),
        fetchDirectusRows(
            `${directusBase}/items/lots?limit=-1&fields=lot_id,lot_name`,
            "lots",
            signal
        ).catch(() => [])
    ]);

    const lotNameMap = new Map<number, string>();
    for (const l of lotsRows) {
        const id = Number(l.lot_id);
        if (id && l.lot_name) lotNameMap.set(id, String(l.lot_name).trim());
    }
    for (const ml of mmLotsRows) {
        const id = Number(ml.lot_id);
        if (id && ml.lot_name) lotNameMap.set(id, String(ml.lot_name).trim());
    }

    const detailWcNameMap = new Map<number, string>();
    for (const wc of workCenterRows) {
        const id = Number(wc.work_center_id || wc.id);
        if (id && (wc.work_center_name || wc.name)) {
            detailWcNameMap.set(id, String(wc.work_center_name || wc.name).trim());
        }
    }

    // Resolve Line / Station from manufacturing_job_order_routes
    const joRouteNames: string[] = [];
    for (const r of routeRows) {
        let name = "";
        if (r.work_center_id && typeof r.work_center_id === "object") {
            name = String(r.work_center_id.work_center_name || r.work_center_id.name || "").trim();
        } else if (r.work_center_id) {
            const id = Number(r.work_center_id);
            name = detailWcNameMap.get(id) || `Station #${id}`;
        }
        if (name && !joRouteNames.includes(name)) joRouteNames.push(name);
    }
    const workCenterName = joRouteNames.length > 0 ? joRouteNames.join(" / ") : null;

    const jo = joRaw ?? {};

    // Output lot from yield ledger
    const distinctLots = new Set<string>();
    for (const yr of yieldRows) {
        if (yr.lot_number && String(yr.lot_number).trim()) {
            distinctLots.add(String(yr.lot_number).trim());
        } else if (yr.mm_lot_id) {
            const resolved = resolveLotName(yr.mm_lot_id, null, lotNameMap);
            if (resolved) distinctLots.add(resolved);
        }
    }
    const outputLotNo = distinctLots.size > 0 ? Array.from(distinctLots).join(", ") : `LOT-JO-${jobOrderId}`;

    // Output batch from genealogy records
    const distinctBatches = new Set<string>();
    for (const g of genealogyRows) {
        if (g.batch_no && String(g.batch_no).trim()) {
            distinctBatches.add(String(g.batch_no).trim());
        }
    }
    const outputBatchNo = distinctBatches.size > 0 ? Array.from(distinctBatches).join(", ") : null;

    return {
        jobOrderId,
        jobOrderNo: String(jo.job_order_no || `JO-${jobOrderId}`),
        productName: String(jo.product_id?.product_name || "Finished Good"),
        status: displayJobOrderStatus(jo.status),
        targetQty: safeNumber(jo.target_quantity),
        actualQtyProduced: safeNumberOrNull(jo.actual_quantity_produced),
        completedQty: safeNumberOrNull(jo.completed_quantity),
        outputLotNo,
        outputBatchNo,
        workCenterName,
        yieldLedger: yieldRows.map((yr) => {
            let resolvedLot: string | null = yr.lot_number ? String(yr.lot_number).trim() : null;
            if (!resolvedLot && yr.mm_lot_id) {
                resolvedLot = resolveLotName(yr.mm_lot_id, null, lotNameMap);
            }
            return {
                ledgerId: Number(yr.ledger_id),
                shiftName: String(yr.shift_name || "Standard Shift"),
                yieldQty: safeNumber(yr.yield_quantity),
                scrapQty: safeNumber(yr.scrap_quantity),
                rejectedQty: safeNumber(yr.rejected_quantity),
                qaStatus: String(yr.qa_status || "Passed"),
                loggedAt: manilaTimestampOrDash(yr.logged_at),
                lotNumber: resolvedLot,
                workCenterName: yr.work_center_id?.work_center_name ? String(yr.work_center_id.work_center_name) : null
            };
        }),
        genealogy: genealogyRows.map((g) => ({
            componentProductId: Number(g.component_product_id?.product_id || g.component_product_id),
            componentProductName: String(g.component_product_id?.product_name || "Raw Material"),
            componentBatchNo: String(g.component_batch_no || "-").trim(),
            componentLotName: resolveLotName(g.component_mm_lot_id, g.component_lot_id, lotNameMap),
            consumedQty: safeNumber(g.consumed_quantity),
            componentLotId: g.component_lot_id ? Number(g.component_lot_id) : null,
            componentMmLotId: g.component_mm_lot_id ? Number(g.component_mm_lot_id) : null
        })),
        qaRecords: qaRows.map((qr) => {
            const p = qr.parameter_id || {};
            let valueLabel = "-";
            if (qr.value_numeric !== null && qr.value_numeric !== undefined) {
                valueLabel = String(qr.value_numeric);
            } else if (qr.value_text) {
                valueLabel = String(qr.value_text);
            } else if (qr.value_boolean !== null && qr.value_boolean !== undefined) {
                valueLabel = parseBitBoolean(qr.value_boolean) ? "Passed" : "Failed";
            }

            return {
                qaRecordId: Number(qr.qa_record_id),
                parameterName: String(p.test_name || "Parameter"),
                testType: String(p.test_type || "Numeric"),
                valueLabel,
                isPassed: parseBitBoolean(qr.is_passed),
                isCritical: parseBitBoolean(p.is_critical),
                inspectedAt: manilaTimestampOrDash(qr.inspected_at),
                remarks: qr.remarks ? String(qr.remarks) : null
            };
        }),
        dispositions: dispoRows.map((d) => {
            let failedParams: Array<{ test_name?: string }> = [];
            if (typeof d.failed_parameters === "string") {
                try {
                    failedParams = JSON.parse(d.failed_parameters);
                } catch {
                    failedParams = [];
                }
            } else if (Array.isArray(d.failed_parameters)) {
                failedParams = d.failed_parameters as Array<{ test_name?: string }>;
            }
            return {
                id: String(d.id),
                taskName: String(d.task_name || "Inspection Task"),
                stationName: d.station_name ? String(d.station_name) : null,
                expectedQty: safeNumber(d.expected_quantity),
                actualQty: safeNumber(d.actual_quantity),
                failedParameters: failedParams,
                decision: d.decision ? String(d.decision) : null
            };
        })
    };
}
