import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    JOB_ORDER_STATUS,
    displayJobOrderStatus,
    normalizeJobOrderStatus,
    type CanonicalJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";
import type {
    AiTierInfo,
    PPRDefectParetoRow,
    PPRDowntimeEvent,
    PPRFilterCatalogPayload,
    PPRJobOrderDetail,
    PPRJobOrderRow,
    PPRKpiMetrics,
    PPRLossDriver,
    PPRQaParameterRow,
    PPRRouteHeatmapCell,
    PPRTrendPoint,
    PPRWorkCenterRow,
    ProductionPerformanceFilters,
    ProductionPerformanceReportPayload
} from "@/modules/manufacturing-management/production-performance-report/types";

type DirectusRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DirectusRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(value: unknown): DirectusRecord | null {
    return isRecord(value) ? value : null;
}

/**
 * Rows written before the canonical status contract landed still carry legacy
 * spellings, so an equality filter on one canonical value under-counts.
 * Mirrors STATUS_BY_KEY in job-order-status.ts in the stored->canonical direction.
 */
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

/** Job Orders that finished producing units, regardless of later QA/closing steps. */
function isCompletedJobOrderStatus(value: unknown): boolean {
    const canonical = normalizeJobOrderStatus(value);
    return (
        canonical === JOB_ORDER_STATUS.CLOSED ||
        canonical === JOB_ORDER_STATUS.PRODUCTION_COMPLETED ||
        canonical === JOB_ORDER_STATUS.FOR_QA_RECONCILIATION
    );
}

function safeNumber(val: unknown, fallback: number = 0): number {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

function safeNumberOrNull(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

/**
 * These relation columns carry no FOREIGN KEY in MySQL, so whether Directus hands back a
 * scalar id or a nested object depends only on its field metadata. Both shapes are
 * reduced to an id here so the report never depends on that.
 */
function relationId(value: unknown, idKeys: string[]): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") {
        for (const key of idKeys) {
            const id = Number((value as DirectusRecord)[key]);
            if (Number.isSafeInteger(id) && id > 0) return id;
        }
        return null;
    }
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Normalizes boolean or MySQL bit(1) values returned through Directus / mysql2.
 * In mysql2 / Directus, bit(1) is returned as a Buffer or serialized JSON { type: "Buffer", data: [1] }.
 */
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

/** Shown to plant stakeholders, so the reporting clock stays in 24-hour Manila time. */
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

/** Directus returns UTC ISO strings; the report shows them on the plant's own clock. */
function manilaTimestampOrDash(value: unknown): string {
    if (value === null || value === undefined || value === "") return "-";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "-" : manilaTimestamp(date);
}

/**
 * A rejected Directus query must not look like an empty table: an unresolvable field,
 * a bad filter or an outage all throw so the caller surfaces an error state.
 */
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
        throw new Error(`Directus returned a non-list response for ${collection}.`);
    }
    return data as DirectusRecord[];
}

/**
 * Resolves the AI Tier assigned to this module from Directus `modules` table.
 * Falls back safely to an active strategic advisory tier if the module row is not yet registered.
 */
export async function resolveServerAiTier(signal?: AbortSignal): Promise<AiTierInfo> {
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        return {
            assigned: true,
            tierLevel: 3,
            tierName: "Executive Strategic (Default)",
            tierSlug: "executive",
            description: "Directus API URL not configured; using default strategic tier."
        };
    }

    try {
        const params = new URLSearchParams({
            "filter[base_path][_eq]": "/mm/reports/production-performance-report",
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

        // If module entry exists in Directus without an ai_tier, treat strictly as unassigned
        if (mod) {
            return {
                assigned: false,
                tierLevel: 0,
                tierName: "Unassigned",
                tierSlug: "unassigned",
                description: "No AI Tier is assigned to this report module."
            };
        }
    } catch {
        // Fall through to safe server default if module registry is temporarily unreachable
    }

    // Module row not yet registered in Directus `modules` — allow Executive mode for authorized manufacturing users
    return {
        assigned: true,
        tierLevel: 3,
        tierName: "Executive Strategic (Default)",
        tierSlug: "executive",
        description: "Default strategic advisory tier active for authorized manufacturing users."
    };
}

export async function fetchProductionFilterCatalog(
    signal?: AbortSignal
): Promise<PPRFilterCatalogPayload> {
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
        }))
    };
}

export const fetchQualityFilterCatalog = fetchProductionFilterCatalog;

export async function buildProductionPerformanceReport(params: {
    filters: ProductionPerformanceFilters;
    accessToken: string;
    signal?: AbortSignal;
}): Promise<ProductionPerformanceReportPayload> {
    const { filters, signal } = params;
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        throw new Error("Directus API URL is not configured.");
    }

    // Build filter for job orders
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
        joFilter.primary_work_center_id = { _eq: Number(filters.workCenterId) };
    }

    if (filters.status && filters.status !== "all") {
        const canonical = normalizeJobOrderStatus(filters.status);
        const variants = canonical ? STORED_STATUS_VARIANTS[canonical] : [String(filters.status)];
        joFilter.status = { _in: variants };
    }

    const joQuery = new URLSearchParams({
        filter: JSON.stringify(joFilter),
        fields: "job_order_id,job_order_no,product_id.product_id,product_id.product_name,product_id.product_code,status,target_quantity,actual_quantity_produced,completed_quantity,rejected_quantity,start_date,end_date,production_started_at,production_completed_at,primary_work_center_id,primary_work_center_id.work_center_id,primary_work_center_id.work_center_name",
        sort: "-created_at",
        limit: "500"
    });

    const rawJobOrders = await fetchDirectusRows(
        `${directusBase}/items/manufacturing_job_orders?${joQuery.toString()}`,
        "manufacturing_job_orders",
        signal
    );
    const jobOrderIds = rawJobOrders.map((j) => Number(j.job_order_id)).filter((id) => Number.isInteger(id) && id > 0);

    // Parallel fetch related tables: yield ledger, QA records, work centers, downtime events
    const yieldLedgerFilter: Record<string, unknown> =
        jobOrderIds.length > 0 ? { job_order_id: { _in: jobOrderIds } } : {};

    const qaRecordsFilter: Record<string, unknown> = jobOrderIds.length > 0 ? { job_order_id: { _in: jobOrderIds } } : {};

    // Maintenance episodes belong to the Job Orders that triggered them, so the
    // same scope plus period applies; unscoped episodes would pin availability at 100%.
    const downtimeFilter: {
        source_job_order_id?: { _in: number[] };
        started_at?: { _gte?: string; _lte?: string };
    } = {};
    if (jobOrderIds.length > 0) {
        downtimeFilter.source_job_order_id = { _in: jobOrderIds };
        const startedAt: { _gte?: string; _lte?: string } = {};
        if (filters.dateFrom) startedAt._gte = `${filters.dateFrom} 00:00:00`;
        if (filters.dateTo) startedAt._lte = `${filters.dateTo} 23:59:59`;
        if (Object.keys(startedAt).length > 0) downtimeFilter.started_at = startedAt;
    }

    const EMPTY_ROWS: DirectusRecord[] = [];
    const scoped = jobOrderIds.length > 0;

    const [
        yieldRows,
        qaRecords,
        allWorkCenters,
        rawDowntime,
        allQaParams,
        dispositionRows,
        routeRows,
        operationRows,
        aiTier
    ] = await Promise.all([
        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_job_order_yield_ledger?filter=${encodeURIComponent(
                      JSON.stringify(yieldLedgerFilter)
                  )}&fields=ledger_id,job_order_id,shift_name,yield_quantity,scrap_quantity,rejected_quantity,qa_status,logged_at,production_date,work_center_id,work_center_id.work_center_id,work_center_id.work_center_name,jo_route_id&limit=-1`,
                  "manufacturing_job_order_yield_ledger",
                  signal
              )
            : EMPTY_ROWS,

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_job_order_qa_records?filter=${encodeURIComponent(
                      JSON.stringify(qaRecordsFilter)
                  )}&fields=qa_record_id,job_order_id,is_passed,parameter_id.parameter_id,parameter_id.test_name,parameter_id.is_critical,inspected_at&limit=-1`,
                  "manufacturing_job_order_qa_records",
                  signal
              )
            : EMPTY_ROWS,

        fetchDirectusRows(
            // No is_active filter: job orders still route through retired stations, and their
            // output has to be attributed somewhere instead of vanishing from the card.
            `${directusBase}/items/manufacturing_work_centers?fields=work_center_id,work_center_name,capacity_per_hour&limit=-1`,
            "manufacturing_work_centers",
            signal
        ),

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_asset_maintenance_history?filter=${encodeURIComponent(
                      JSON.stringify(downtimeFilter)
                  )}&fields=id,asset_id.id,asset_id.serial,asset_id.item_id.item_name,started_at,ended_at,breakdown_category,root_cause,corrective_action,technician_name&sort=-started_at&limit=-1`,
                  "manufacturing_asset_maintenance_history",
                  signal
              )
            : EMPTY_ROWS,

        fetchDirectusRows(
            `${directusBase}/items/quality_inspection_parameters?fields=parameter_id,test_name,is_critical&limit=-1`,
            "quality_inspection_parameters",
            signal
        ),

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_qa_dispositions?filter=${encodeURIComponent(
                      JSON.stringify({ job_order_id: { _in: jobOrderIds } })
                  )}&fields=id,job_order_id,product_name,task_name,station_name,expected_quantity,actual_quantity,failed_parameters,decision,recorded_at&limit=-1`,
                  "manufacturing_qa_dispositions",
                  signal
              )
            : EMPTY_ROWS,

        scoped
            ? fetchDirectusRows(
                  `${directusBase}/items/manufacturing_job_order_routes?filter=${encodeURIComponent(
                      JSON.stringify({ job_order_id: { _in: jobOrderIds } })
                  )}&fields=jo_route_id,sequence_order,operation_id&limit=-1`,
                  "manufacturing_job_order_routes",
                  signal
              )
            : EMPTY_ROWS,

        fetchDirectusRows(
            `${directusBase}/items/manufacturing_operations?fields=id,operation_name&limit=-1`,
            "manufacturing_operations",
            signal
        ),

        resolveServerAiTier(signal)
    ]);

    const wcNameById = new Map<number, string>();
    for (const wc of allWorkCenters) {
        const id = Number(wc.work_center_id);
        if (Number.isSafeInteger(id) && id > 0) {
            wcNameById.set(id, String(wc.work_center_name || `Work Center #${id}`));
        }
    }

    /** Resolves a work center relation to id + display name without needing Directus metadata. */
    const resolveWorkCenter = (relValue: unknown): { id: number | null; name: string | null } => {
        const id = relationId(relValue, ["work_center_id", "id"]);
        const nestedName =
            relValue && typeof relValue === "object"
                ? String((relValue as DirectusRecord).work_center_name || "") || null
                : null;
        if (id === null) return { id: null, name: nestedName };
        return { id, name: wcNameById.get(id) ?? nestedName ?? `Work Center #${id}` };
    };

    // Map yield ledger per job order
    const joYieldMap = new Map<number, { yieldQty: number; scrapQty: number; rejectedQty: number }>();
    for (const yr of yieldRows) {
        const jid = Number(isRecord(yr.job_order_id) ? yr.job_order_id.job_order_id : yr.job_order_id);
        if (!jid) continue;
        const cur = joYieldMap.get(jid) || { yieldQty: 0, scrapQty: 0, rejectedQty: 0 };
        cur.yieldQty += safeNumber(yr.yield_quantity);
        cur.scrapQty += safeNumber(yr.scrap_quantity);
        cur.rejectedQty += safeNumber(yr.rejected_quantity);
        joYieldMap.set(jid, cur);
    }

    // Map QA pass rate per job order
    const joQaMap = new Map<number, { total: number; passed: number }>();
    for (const qr of qaRecords) {
        const jid = Number(isRecord(qr.job_order_id) ? qr.job_order_id.job_order_id : qr.job_order_id);
        if (!jid) continue;
        const cur = joQaMap.get(jid) || { total: 0, passed: 0 };
        cur.total += 1;
        if (parseBitBoolean(qr.is_passed)) {
            cur.passed += 1;
        }
        joQaMap.set(jid, cur);
    }

    // Transform Job Orders list
    const jobOrders: PPRJobOrderRow[] = rawJobOrders.map((jo) => {
        const id = Number(jo.job_order_id);
        const target = safeNumber(jo.target_quantity);
        const actual = safeNumberOrNull(jo.actual_quantity_produced);
        const completed = safeNumberOrNull(jo.completed_quantity);
        const rejected = safeNumberOrNull(jo.rejected_quantity);

        const yInfo = joYieldMap.get(id);
        const qInfo = joQaMap.get(id);

        let yieldRatePct: number | null = null;
        if (target > 0 && completed !== null) {
            yieldRatePct = Number(((completed / target) * 100).toFixed(1));
        } else if (target > 0 && actual !== null) {
            yieldRatePct = Number(((actual / target) * 100).toFixed(1));
        }

        let scrapRatePct: number | null = null;
        if (yInfo && yInfo.yieldQty + yInfo.scrapQty > 0) {
            scrapRatePct = Number(((yInfo.scrapQty / (yInfo.yieldQty + yInfo.scrapQty)) * 100).toFixed(1));
        }

        let qaPassRatePct: number | null = null;
        if (qInfo && qInfo.total > 0) {
            qaPassRatePct = Number(((qInfo.passed / qInfo.total) * 100).toFixed(1));
        }

        let cycleTimeHrs: number | null = null;
        if (jo.production_started_at && jo.production_completed_at) {
            const startMs = new Date(String(jo.production_started_at)).getTime();
            const endMs = new Date(String(jo.production_completed_at)).getTime();
            if (endMs > startMs) {
                cycleTimeHrs = Number(((endMs - startMs) / (1000 * 3600)).toFixed(1));
            }
        }

        const prodObj = nestedRecord(jo.product_id);
        const station = resolveWorkCenter(jo.primary_work_center_id);

        return {
            jobOrderId: id,
            jobOrderNo: String(jo.job_order_no || `JO-${id}`),
            productId: prodObj ? Number(prodObj.product_id) : safeNumber(jo.product_id),
            productName: prodObj ? String(prodObj.product_name || `Product #${jo.product_id}`) : `Product #${jo.product_id}`,
            status: displayJobOrderStatus(jo.status),
            startDate: jo.start_date ? String(jo.start_date) : null,
            endDate: jo.end_date ? String(jo.end_date) : null,
            targetQty: target,
            actualQtyProduced: actual,
            completedQty: completed,
            rejectedQty: rejected,
            yieldRatePct,
            scrapRatePct,
            qaPassRatePct,
            cycleTimeHrs,
            workCenterId: station.id,
            workCenterName: station.name
        };
    });

    // Compute Overall KPIs
    const evaluatedYieldRates = jobOrders.map((j) => j.yieldRatePct).filter((y): y is number => y !== null);
    const avgYieldRatePct =
        evaluatedYieldRates.length > 0
            ? Number((evaluatedYieldRates.reduce((a, b) => a + b, 0) / evaluatedYieldRates.length).toFixed(1))
            : null;

    let totalScrapQty = 0;
    let totalYieldPlusScrap = 0;
    for (const yr of yieldRows) {
        const y = safeNumber(yr.yield_quantity);
        const s = safeNumber(yr.scrap_quantity);
        totalScrapQty += s;
        totalYieldPlusScrap += y + s;
    }
    const avgScrapRatePct =
        totalYieldPlusScrap > 0 ? Number(((totalScrapQty / totalYieldPlusScrap) * 100).toFixed(1)) : null;

    const totalTarget = jobOrders.reduce((sum, j) => sum + j.targetQty, 0);
    const totalActualProduced = jobOrders.reduce((sum, j) => sum + (j.actualQtyProduced || j.completedQty || 0), 0);
    const totalRejected = jobOrders.reduce((sum, j) => sum + (j.rejectedQty || 0), 0);
    const avgRejectionRatePct =
        totalTarget > 0 ? Number(((totalRejected / totalTarget) * 100).toFixed(1)) : null;

    let totalQaChecks = 0;
    let passedQaChecks = 0;
    for (const qr of qaRecords) {
        totalQaChecks += 1;
        if (parseBitBoolean(qr.is_passed)) {
            passedQaChecks += 1;
        }
    }
    const qaPassRatePct =
        totalQaChecks > 0 ? Number(((passedQaChecks / totalQaChecks) * 100).toFixed(1)) : null;

    const cycleTimes = jobOrders.map((j) => j.cycleTimeHrs).filter((c): c is number => c !== null);
    const avgCycleTimeHrs =
        cycleTimes.length > 0 ? Number((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length).toFixed(1)) : null;

    // Filter Downtime Events to the selected period
    const downtimeEvents: PPRDowntimeEvent[] = [];
    let totalDowntimeHrs = 0;

    for (const dt of rawDowntime) {
        const start = dt.started_at ? new Date(String(dt.started_at)) : null;
        const end = dt.ended_at ? new Date(String(dt.ended_at)) : new Date();
        if (!start) continue;

        let durationHrs = 0;
        if (end.getTime() > start.getTime()) {
            durationHrs = Number(((end.getTime() - start.getTime()) / (1000 * 3600)).toFixed(1));
        }

        totalDowntimeHrs += durationHrs;

        const assetObj = nestedRecord(dt.asset_id);
        const itemId = assetObj ? nestedRecord(assetObj.item_id) : null;
        const assetName = assetObj
            ? String(itemId?.item_name || assetObj.serial || `Asset #${assetObj.id}`)
            : "Production Equipment";

        downtimeEvents.push({
            id: Number(dt.id),
            assetName,
            durationHrs,
            breakdownCategory: dt.breakdown_category ? String(dt.breakdown_category) : null,
            rootCause: dt.root_cause ? String(dt.root_cause) : null,
            startedAt: String(dt.started_at),
            endedAt: dt.ended_at ? String(dt.ended_at) : null,
            technicianName: dt.technician_name ? String(dt.technician_name) : null,
            correctiveAction: dt.corrective_action ? String(dt.corrective_action) : null
        });
    }

    const completedJobOrdersCount = jobOrders.filter((j) => isCompletedJobOrderStatus(j.status)).length;
    const completionRatePct =
        jobOrders.length > 0
            ? Number(((completedJobOrdersCount / jobOrders.length) * 100).toFixed(1))
            : null;

    // OEE Calculation (Availability x Performance x Quality)
    // Approximate scheduled hours based on job orders or standard shifts
    const scheduledHours = Math.max(8, jobOrders.length * 8);
    // Without a maintenance episode in scope, availability has no evidence and a
    // 100% would inflate OEE, so both report as undetermined instead.
    const availabilityPct =
        downtimeEvents.length > 0
            ? Number(
                  Math.min(
                      100,
                      Math.max(0, ((scheduledHours - totalDowntimeHrs) / scheduledHours) * 100)
                  ).toFixed(1)
              )
            : null;

    const performancePct =
        totalTarget > 0
            ? Number(Math.min(100, Math.max(0, (totalActualProduced / totalTarget) * 100)).toFixed(1))
            : avgYieldRatePct !== null
            ? Math.min(100, avgYieldRatePct)
            : null;

    const qualityPct =
        qaPassRatePct !== null
            ? qaPassRatePct
            : avgScrapRatePct !== null
            ? Number(Math.max(0, 100 - avgScrapRatePct).toFixed(1))
            : null;

    // A product of factors is meaningless when any one of them has no evidence behind it.
    const oeePct =
        availabilityPct === null || performancePct === null || qualityPct === null
            ? null
            : Number(
                  (((availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100)) * 100).toFixed(1)
              );

    const kpis: PPRKpiMetrics = {
        oeePct,
        availabilityPct,
        performancePct,
        qualityPct,
        avgYieldRatePct,
        avgScrapRatePct,
        avgRejectionRatePct,
        qaPassRatePct,
        avgCycleTimeHrs,
        totalDowntimeHrs: totalDowntimeHrs > 0 ? Number(totalDowntimeHrs.toFixed(1)) : null,
        totalJobOrders: jobOrders.length,
        completedJobOrders: completedJobOrdersCount,
        completionRatePct
    };

    // Trend Series (grouped by day)
    const trendMap = new Map<
        string,
        {
            date: string;
            yieldSum: number;
            yieldCount: number;
            scrapQty: number;
            yieldQty: number;
            rejectedQty: number;
            joCount: number;
            targetQty: number;
            actualQty: number;
        }
    >();

    for (const jo of jobOrders) {
        const d = jo.startDate || (filters.dateFrom || "2026-11-01");
        const cur = trendMap.get(d) || {
            date: d,
            yieldSum: 0,
            yieldCount: 0,
            scrapQty: 0,
            yieldQty: 0,
            rejectedQty: 0,
            joCount: 0,
            targetQty: 0,
            actualQty: 0
        };
        cur.joCount += 1;
        cur.targetQty += jo.targetQty;
        cur.actualQty += jo.actualQtyProduced || jo.completedQty || 0;
        if (jo.yieldRatePct !== null) {
            cur.yieldSum += jo.yieldRatePct;
            cur.yieldCount += 1;
        }
        if (jo.rejectedQty !== null) {
            cur.rejectedQty += jo.rejectedQty;
        }
        const yInfo = joYieldMap.get(jo.jobOrderId);
        if (yInfo) {
            cur.scrapQty += yInfo.scrapQty;
            cur.yieldQty += yInfo.yieldQty;
        }
        trendMap.set(d, cur);
    }

    const sortedDates = Array.from(trendMap.keys()).sort();
    const trendSeries: PPRTrendPoint[] = sortedDates.map((dateStr) => {
        const item = trendMap.get(dateStr)!;
        const dObj = new Date(dateStr);
        const periodLabel = !isNaN(dObj.getTime())
            ? dObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : dateStr;

        const yieldRatePct = item.yieldCount > 0 ? Number((item.yieldSum / item.yieldCount).toFixed(1)) : null;
        const totalYieldAndScrap = item.yieldQty + item.scrapQty;
        const scrapRatePct =
            totalYieldAndScrap > 0 ? Number(((item.scrapQty / totalYieldAndScrap) * 100).toFixed(1)) : null;

        return {
            periodLabel,
            date: dateStr,
            yieldRatePct,
            scrapRatePct,
            rejectedQty: item.rejectedQty > 0 ? Number(item.rejectedQty.toFixed(1)) : 0,
            jobOrderCount: item.joCount,
            targetQty: item.targetQty,
            actualQty: item.actualQty
        };
    });

    // Top Loss Drivers (Product & Work Center losses)
    const productLossMap = new Map<string, { label: string; lossQty: number }>();
    for (const jo of jobOrders) {
        const loss = (jo.rejectedQty || 0) + (joYieldMap.get(jo.jobOrderId)?.scrapQty || 0);
        if (loss > 0) {
            const cur = productLossMap.get(jo.productName) || { label: jo.productName, lossQty: 0 };
            cur.lossQty += loss;
            productLossMap.set(jo.productName, cur);
        }
    }

    const wcLossMap = new Map<string, { label: string; lossQty: number }>();
    for (const yr of yieldRows) {
        const s = safeNumber(yr.scrap_quantity);
        const r = safeNumber(yr.rejected_quantity);
        const loss = s + r;
        if (loss > 0) {
            const wcName = resolveWorkCenter(yr.work_center_id).name || "Unassigned Work Center";
            const cur = wcLossMap.get(wcName) || { label: wcName, lossQty: 0 };
            cur.lossQty += loss;
            wcLossMap.set(wcName, cur);
        }
    }

    const totalLossQtyCombined =
        Array.from(productLossMap.values()).reduce((s, p) => s + p.lossQty, 0) || 1;

    const topLossDrivers: PPRLossDriver[] = [
        ...Array.from(productLossMap.values()).map((p, idx) => ({
            id: `prod-${idx}`,
            label: p.label,
            lossQty: Number(p.lossQty.toFixed(1)),
            lossType: "product" as const,
            percentageOfTotal: Number(((p.lossQty / totalLossQtyCombined) * 100).toFixed(1))
        })),
        ...Array.from(wcLossMap.values()).map((w, idx) => ({
            id: `wc-${idx}`,
            label: w.label,
            lossQty: Number(w.lossQty.toFixed(1)),
            lossType: "work_center" as const,
            percentageOfTotal: Number(((w.lossQty / totalLossQtyCombined) * 100).toFixed(1))
        }))
    ]
        .sort((a, b) => b.lossQty - a.lossQty)
        .slice(0, 10);

    // Work Center Throughput
    const wcMap = new Map<
        number,
        {
            id: number;
            name: string;
            actualQty: number;
            scrapQty: number;
            joCount: number;
            capPerHour: number | null;
        }
    >();
    for (const wc of allWorkCenters) {
        const id = Number(wc.work_center_id);
        if (!Number.isSafeInteger(id) || id <= 0) continue;
        wcMap.set(id, {
            id,
            name: String(wc.work_center_name || `Work Center #${id}`),
            actualQty: 0,
            scrapQty: 0,
            joCount: 0,
            capPerHour: safeNumberOrNull(wc.capacity_per_hour)
        });
    }

    for (const jo of jobOrders) {
        if (jo.workCenterId === null) continue;
        let station = wcMap.get(jo.workCenterId);
        if (!station) {
            // Job orders also route through stations this query excludes (inactive ones),
            // but their output still belongs to a station rather than disappearing.
            station = {
                id: jo.workCenterId,
                name: jo.workCenterName || `Work Center #${jo.workCenterId}`,
                actualQty: 0,
                scrapQty: 0,
                joCount: 0,
                capPerHour: null
            };
            wcMap.set(jo.workCenterId, station);
        }
        station.actualQty += jo.actualQtyProduced || jo.completedQty || 0;
        station.joCount += 1;
        const yInfo = joYieldMap.get(jo.jobOrderId);
        if (yInfo) station.scrapQty += yInfo.scrapQty;
    }

    const workCenterThroughput: PPRWorkCenterRow[] = Array.from(wcMap.values())
        .filter((w) => w.actualQty > 0 || w.joCount > 0)
        .map((w) => {
            const estimatedCap =
                w.capPerHour === null ? null : w.capPerHour * 8 * Math.max(1, w.joCount);
            const util =
                estimatedCap && estimatedCap > 0
                    ? Math.min(100, Number(((w.actualQty / estimatedCap) * 100).toFixed(1)))
                    : null;
            const totalOut = w.actualQty + w.scrapQty;
            const scrapRate = totalOut > 0 ? Number(((w.scrapQty / totalOut) * 100).toFixed(1)) : 0;

            return {
                workCenterId: w.id,
                workCenterName: w.name,
                actualQty: Number(w.actualQty.toFixed(1)),
                capacityQty: estimatedCap,
                utilizationPct: util,
                avgScrapRatePct: scrapRate,
                jobOrderCount: w.joCount
            };
        });

    // Route Step Scrap Matrix. The yield ledger stores only `jo_route_id`, and that column has
    // no FK for Directus to traverse, so the step and its operation are joined here by id —
    // the same way every other report that needs route steps does it.
    const operationNameById = new Map<number, string>();
    for (const op of operationRows) {
        const id = Number(op.id);
        if (Number.isSafeInteger(id) && id > 0) {
            operationNameById.set(id, String(op.operation_name || `Operation #${id}`));
        }
    }

    const routeStepById = new Map<
        number,
        { sequenceOrder: number | null; operationId: number | null }
    >();
    for (const r of routeRows) {
        const id = relationId(r.jo_route_id, ["jo_route_id", "id"]);
        if (id === null) continue;
        const seq = Number(r.sequence_order);
        routeStepById.set(id, {
            sequenceOrder: Number.isSafeInteger(seq) && seq > 0 ? seq : null,
            operationId: relationId(r.operation_id, ["operation_id", "id"])
        });
    }

    const routeMap = new Map<
        string,
        {
            operationId: number | null;
            sequenceOrder: number | null;
            operationName: string;
            scrapQty: number;
            yieldQty: number;
            ledgerRowCount: number;
        }
    >();
    for (const yr of yieldRows) {
        const stepId = relationId(yr.jo_route_id, ["jo_route_id", "id"]);
        const step = stepId === null ? undefined : routeStepById.get(stepId);
        // Shift runs logged without a route step keep their own bucket instead of being
        // counted as step 1 of an unnamed operation.
        const operationName = step?.operationId
            ? operationNameById.get(step.operationId) ?? `Operation #${step.operationId}`
            : "No route step recorded";
        const sequenceOrder = step?.sequenceOrder ?? null;
        const key = sequenceOrder === null ? operationName : `${sequenceOrder}|${operationName}`;

        const cur = routeMap.get(key) || {
            operationId: step?.operationId ?? null,
            sequenceOrder,
            operationName,
            scrapQty: 0,
            yieldQty: 0,
            ledgerRowCount: 0
        };
        cur.scrapQty += safeNumber(yr.scrap_quantity);
        cur.yieldQty += safeNumber(yr.yield_quantity);
        cur.ledgerRowCount += 1;
        routeMap.set(key, cur);
    }

    const routeHeatmap: PPRRouteHeatmapCell[] = Array.from(routeMap.values())
        .sort((a, b) => {
            if (a.sequenceOrder === null) return 1;
            if (b.sequenceOrder === null) return -1;
            return a.sequenceOrder - b.sequenceOrder;
        })
        .map((v) => {
            const total = v.yieldQty + v.scrapQty;
            return {
                operationId: v.operationId,
                sequenceOrder: v.sequenceOrder,
                operationName: v.operationName,
                scrapRatePct: total > 0 ? Number(((v.scrapQty / total) * 100).toFixed(1)) : null,
                yieldQty: Number(v.yieldQty.toFixed(1)),
                ledgerRowCount: v.ledgerRowCount
            };
        });

    // QA Parameter Summary
    const paramStatsMap = new Map<
        number,
        {
            id: number;
            name: string;
            isCrit: boolean;
            total: number;
            passed: number;
            failed: number;
        }
    >();
    for (const p of allQaParams) {
        const pid = Number(p.parameter_id);
        paramStatsMap.set(pid, {
            id: pid,
            name: String(p.test_name || `Param #${pid}`),
            isCrit: parseBitBoolean(p.is_critical),
            total: 0,
            passed: 0,
            failed: 0
        });
    }

    for (const qr of qaRecords) {
        const pObj = nestedRecord(qr.parameter_id);
        const pid = pObj ? Number(pObj.parameter_id) : Number(qr.parameter_id);
        if (!pid) continue;

        const cur = paramStatsMap.get(pid) || {
            id: pid,
            name: String(pObj?.test_name || `Param #${pid}`),
            isCrit: parseBitBoolean(pObj?.is_critical),
            total: 0,
            passed: 0,
            failed: 0
        };

        cur.total += 1;
        if (parseBitBoolean(qr.is_passed)) {
            cur.passed += 1;
        } else {
            cur.failed += 1;
        }
        paramStatsMap.set(pid, cur);
    }

    const qaParameterSummary: PPRQaParameterRow[] = Array.from(paramStatsMap.values())
        .filter((p) => p.total > 0)
        .map((p) => ({
            parameterId: p.id,
            parameterName: p.name,
            passRatePct: p.total > 0 ? Number(((p.passed / p.total) * 100).toFixed(1)) : null,
            totalChecks: p.total,
            passedChecks: p.passed,
            failedChecks: p.failed,
            isCritical: p.isCrit
        }))
        .sort((a, b) => (a.passRatePct ?? 0) - (b.passRatePct ?? 0));

    // Defect Pareto from the QA dispositions' failed parameters. A disposition
    // records every parameter that failed on one batch, so its failed units are
    // split across them to keep the Pareto total equal to the lost quantity.
    const defectMap = new Map<string, number>();
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

        const failedQty = Math.max(
            0,
            safeNumber(d.expected_quantity) - safeNumber(d.actual_quantity)
        );
        const share = failedQty > 0 ? failedQty / failedParams.length : 1;

        for (const p of failedParams as DirectusRecord[]) {
            const label = String(p?.test_name || "").trim();
            if (!label) continue;
            defectMap.set(label, (defectMap.get(label) || 0) + share);
        }
    }

    const totalDefectSum = Array.from(defectMap.values()).reduce((a, b) => a + b, 0);
    const sortedDefects = Array.from(defectMap.entries()).sort((a, b) => b[1] - a[1]);

    let runningDefectSum = 0;
    const defectPareto: PPRDefectParetoRow[] = sortedDefects.map(([label, qty]) => {
        runningDefectSum += qty;
        const cumulativePct =
            totalDefectSum > 0 ? Number(((runningDefectSum / totalDefectSum) * 100).toFixed(1)) : 100;
        return {
            defectLabel: label,
            quantity: Number(qty.toFixed(1)),
            cumulativePct
        };
    });

    // Metadata
    const productLabel =
        filters.productId && filters.productId !== "all"
            ? jobOrders.find((j) => String(j.productId) === filters.productId)?.productName || "Specific SKU"
            : "All Products";

    const workCenterLabel =
        filters.workCenterId && filters.workCenterId !== "all"
            ? String(allWorkCenters.find((w) => String(w.work_center_id) === filters.workCenterId)?.work_center_name || "Specific Station")
            : "All Work Centers";

    const statusLabel =
        filters.status && filters.status !== "all" ? displayJobOrderStatus(filters.status) : "All Statuses";

    return {
        meta: {
            dateLabel: `${filters.dateFrom || "Start"} to ${filters.dateTo || "End"}`,
            productLabel,
            workCenterLabel,
            statusLabel,
            freshnessCutoff: manilaTimestamp(new Date()),
            totalRecordsEvaluated: jobOrders.length,
            aiTier,
            notices: []
        },
        kpis,
        trendSeries,
        topLossDrivers,
        workCenterThroughput,
        routeHeatmap,
        downtimeEvents,
        qaParameterSummary,
        defectPareto,
        jobOrders
    };
}

export const buildQualityIntelligenceReport = buildProductionPerformanceReport;

export async function fetchJobOrderDetail(
    jobOrderId: number,
    signal?: AbortSignal
): Promise<PPRJobOrderDetail> {
    const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
    if (!directusBase) {
        throw new Error("Directus API URL is not configured.");
    }

    const [joRaw, yieldRows, matRows, qaRows, timelineRows] = await Promise.all([
        fetchDirectus(
            `${directusBase}/items/manufacturing_job_orders/${jobOrderId}?fields=job_order_id,job_order_no,product_id.product_name,status,target_quantity,actual_quantity_produced,completed_quantity`,
            `manufacturing_job_orders/${jobOrderId}`,
            signal
        ),

        fetchDirectusRows(
            `${directusBase}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${jobOrderId}&fields=ledger_id,shift_name,yield_quantity,scrap_quantity,rejected_quantity,qa_status,logged_at,lot_number,work_center_id.work_center_name&sort=-logged_at`,
            "manufacturing_job_order_yield_ledger",
            signal
        ),

        fetchDirectusRows(
            `${directusBase}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_material_id,product_id.product_name,uom_id.unit_name,allocated_quantity,actual_consumed_quantity,scrap_quantity`,
            "manufacturing_job_order_materials",
            signal
        ),

        fetchDirectusRows(
            `${directusBase}/items/manufacturing_job_order_qa_records?filter[job_order_id][_eq]=${jobOrderId}&fields=qa_record_id,parameter_id.test_name,parameter_id.test_type,parameter_id.is_critical,value_text,value_numeric,value_boolean,is_passed,inspected_at,remarks`,
            "manufacturing_job_order_qa_records",
            signal
        ),

        fetchDirectusRows(
            `${directusBase}/items/manufacturing_job_order_status_history?filter[job_order_id][_eq]=${jobOrderId}&fields=history_id,old_status,new_status,changed_at,changed_by.user_fname,changed_by.user_lname,remarks&sort=changed_at`,
            "manufacturing_job_order_status_history",
            signal
        )
    ]);

    const jo = joRaw ?? {};

    return {
        jobOrderId,
        jobOrderNo: String(jo.job_order_no || `JO-${jobOrderId}`),
        productName: String(nestedRecord(jo.product_id)?.product_name || "Finished Good"),
        status: displayJobOrderStatus(jo.status),
        targetQty: safeNumber(jo.target_quantity),
        actualQtyProduced: safeNumberOrNull(jo.actual_quantity_produced),
        completedQty: safeNumberOrNull(jo.completed_quantity),
        yieldLedger: yieldRows.map((yr) => ({
            ledgerId: Number(yr.ledger_id),
            shiftName: String(yr.shift_name || "Standard Shift"),
            yieldQty: safeNumber(yr.yield_quantity),
            scrapQty: safeNumber(yr.scrap_quantity),
            rejectedQty: safeNumber(yr.rejected_quantity),
            qaStatus: String(yr.qa_status || "Passed"),
            loggedAt: manilaTimestampOrDash(yr.logged_at),
            workCenterName: nestedRecord(yr.work_center_id)?.work_center_name ? String(nestedRecord(yr.work_center_id)?.work_center_name) : null,
            lotNumber: yr.lot_number ? String(yr.lot_number) : null
        })),
        bomVariance: matRows.map((mr) => {
            const theo = safeNumberOrNull(mr.allocated_quantity);
            const act = safeNumber(mr.actual_consumed_quantity);
            const varQty = theo !== null ? Number((act - theo).toFixed(4)) : null;
            const varPct = theo !== null && theo > 0 ? Number(((varQty! / theo) * 100).toFixed(1)) : null;

            return {
                materialName: String(nestedRecord(mr.product_id)?.product_name || "Material"),
                theoreticalQty: theo,
                actualConsumedQty: act,
                varianceQty: varQty,
                variancePct: varPct,
                uomLabel: String(nestedRecord(mr.uom_id)?.unit_name || "units")
            };
        }),
        qaRecords: qaRows.map((qr) => {
            const p = nestedRecord(qr.parameter_id) || {};
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
                inspectedAt: manilaTimestampOrDash(qr.inspected_at),
                isCritical: parseBitBoolean(p.is_critical),
                remarks: qr.remarks ? String(qr.remarks) : null
            };
        }),
        statusTimeline: timelineRows.map((tr) => {
            const u = nestedRecord(tr.changed_by) || {};
            const name = [u.user_fname, u.user_lname].filter(Boolean).map(String).join(" ");
            return {
                historyId: Number(tr.history_id),
                oldStatus: tr.old_status ? String(tr.old_status) : null,
                newStatus: String(tr.new_status),
                changedAt: manilaTimestampOrDash(tr.changed_at),
                changedByLabel: name || null,
                remarks: tr.remarks ? String(tr.remarks) : null
            };
        })
    };
}
