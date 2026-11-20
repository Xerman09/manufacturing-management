import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    buildForecastAnalytics,
    classifyInventoryPolicy,
    parseHorizonSteps,
    resolveCustomerRegion
} from "./_forecast-engine";
import type {
    NormalizedDemandLine,
    ProductSupplyContext
} from "./_forecast-engine";
import type {
    AiTierInfo,
    DemandForecastFilters,
    DemandForecastReportPayload,
    EvidenceRecord,
    ForecastCadence,
    ForecastHorizonOption,
    HistoricalPeriodPreset,
    InventoryPolicyTag,
    LaborPositionEstimate,
    SourceHealthNotice
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/types";

type DirectusRow = Record<string, unknown>;

const EXCLUDED_ORDER_STATUSES = new Set([
    "Cancelled",
    "For Cancellation",
    "Draft",
    "Not Fulfilled"
]);

const OPEN_JOB_ORDER_STATUSES = new Set([
    "Draft",
    "Scheduled",
    "Released",
    "Material Picking",
    "Staged",
    "In Progress",
    "In Production",
    "QA Pending",
    "Pending QA"
]);

export function parseParentId(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "object" && val !== null) {
        const inner = (val as Record<string, unknown>).product_id;
        const n = Number(inner);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    }
    const n = Number(val);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function parsePositiveMultiplier(val: unknown): number {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function formatUtcDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export function resolveHistoricalDateRange(
    period: HistoricalPeriodPreset,
    customFrom: string,
    customTo: string
): { start: string; end: string; label: string } {
    if (period === "custom" && customFrom && customTo) {
        return {
            start: customFrom,
            end: customTo,
            label: `${customFrom} to ${customTo}`
        };
    }

    const now = new Date();
    const manila = new Date(now.getTime() + 8 * 3600 * 1000);
    const y = manila.getUTCFullYear();
    const m = manila.getUTCMonth();
    const d = manila.getUTCDate();
    const today = new Date(Date.UTC(y, m, d));

    if (period === "last8Weeks") {
        const start = new Date(today.getTime());
        start.setUTCDate(start.getUTCDate() - 55);
        return { start: formatUtcDate(start), end: formatUtcDate(today), label: "Last 8 Weeks" };
    }

    if (period === "last12Weeks") {
        const start = new Date(today.getTime());
        start.setUTCDate(start.getUTCDate() - 83);
        return { start: formatUtcDate(start), end: formatUtcDate(today), label: "Last 12 Weeks" };
    }

    if (period === "last12Months") {
        const start = new Date(Date.UTC(y, m - 11, 1));
        return { start: formatUtcDate(start), end: formatUtcDate(today), label: "Last 12 Months" };
    }

    if (period === "thisYear") {
        const start = new Date(Date.UTC(y, 0, 1));
        return { start: formatUtcDate(start), end: formatUtcDate(today), label: `Year to Date (${y})` };
    }

    const start = new Date(Date.UTC(y, m - 5, 1));
    return { start: formatUtcDate(start), end: formatUtcDate(today), label: "Last 6 Months" };
}

async function fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = 1
): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, init);
            if (res.ok || res.status < 500 || attempt === retries) {
                return res;
            }
            lastError = new Error(`HTTP ${res.status}`);
        } catch (err) {
            if (init.signal?.aborted) throw err;
            lastError = err;
            if (attempt === retries) throw err;
        }
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
    throw lastError instanceof Error ? lastError : new Error("Request failed");
}

async function fetchDirectusStrict(
    collection: string,
    params: URLSearchParams,
    signal?: AbortSignal
): Promise<DirectusRow[]> {
    const url = `${DIRECTUS_URL}/items/${collection}?${params.toString()}`;
    const res = await fetchWithRetry(url, { headers, cache: "no-store", signal }, 1);
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Unable to load ${collection} data (HTTP ${res.status}): ${text.slice(0, 120)}`);
    }
    const json = await res.json();
    return Array.isArray(json?.data) ? (json.data as DirectusRow[]) : [];
}

/**
 * Bounded-concurrency chunk fetcher (max 4 in flight) with per-chunk retry.
 * Prevents random 503 spikes on large "All Plants / Last 12 Months" queries.
 */
async function fetchDirectusChunked(
    collection: string,
    filterField: string,
    values: Array<string | number>,
    fields: string,
    extraFilters?: Record<string, string>,
    signal?: AbortSignal,
    chunkSize = 75,
    maxConcurrency = 4
): Promise<DirectusRow[]> {
    if (values.length === 0) return [];
    const unique = Array.from(new Set(values));
    const chunks: Array<Array<string | number>> = [];
    for (let i = 0; i < unique.length; i += chunkSize) {
        chunks.push(unique.slice(i, i + chunkSize));
    }

    const out: DirectusRow[][] = Array.from({ length: chunks.length }, () => []);
    let cursor = 0;

    const worker = async () => {
        while (cursor < chunks.length) {
            const idx = cursor++;
            const chunk = chunks[idx];
            const params = new URLSearchParams({ fields, limit: "-1" });
            params.set(`filter[${filterField}][_in]`, chunk.join(","));
            if (extraFilters) {
                for (const [k, v] of Object.entries(extraFilters)) {
                    params.set(k, v);
                }
            }
            out[idx] = await fetchDirectusStrict(collection, params, signal);
        }
    };

    const workers = Array.from({ length: Math.min(maxConcurrency, chunks.length) }, () => worker());
    await Promise.all(workers);
    return out.flat();
}

export async function resolveServerAiTier(signal?: AbortSignal): Promise<AiTierInfo> {
    try {
        const params = new URLSearchParams({
            "filter[base_path][_eq]": "/mm/reports/demand-forecasting-ai-report",
            fields: "id,title,ai_tier.id,ai_tier.name,ai_tier.slug,ai_tier.tier_level,ai_tier.description",
            limit: "1"
        });
        const rows = await fetchDirectusStrict("modules", params, signal);
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

    // Module row not yet registered in Directus `modules` — allow Pro advisory mode for authorized users
    return {
        assigned: true,
        tierLevel: 2,
        tierName: "Pro Diagnostic",
        tierSlug: "pro",
        description: "Standard advisory demand commentary tier."
    };
}

interface SpringOnhandRow {
    branchId?: number;
    branch_id?: number;
    productId?: number;
    product_id?: number;
    unitId?: number;
    unit_id?: number;
    onhandQuantity?: number;
    onhand_quantity?: number;
}

interface SpringBatchOnhandRow {
    branchId?: number;
    branch_id?: number;
    inventoryLotId?: number | null;
    inventory_lot_id?: number | null;
    productId?: number;
    product_id?: number;
    unitId?: number;
    unit_id?: number;
    batchNo?: string;
    batch_no?: string;
    manufacturingDate?: string | null;
    manufacturing_date?: string | null;
    expirationDate?: string | null;
    expiration_date?: string | null;
    inventoryCondition?: string;
    inventory_condition?: string;
    onhandQuantity?: number;
    onhand_quantity?: number;
    sourceStatus?: string;
    source_status?: string;
    status?: string;
    qaStatus?: string;
    qa_status?: string;
}

async function fetchSpringOnhand(
    accessToken: string,
    branchId: string,
    signal?: AbortSignal
): Promise<{ ok: true; rows: SpringOnhandRow[] } | { ok: false; error: string }> {
    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");
    if (!springBase) return { ok: false, error: "Live inventory service is not configured." };

    const url =
        branchId !== "all"
            ? `${springBase}/api/mm-product-onhand/filter?branch=${encodeURIComponent(branchId)}`
            : `${springBase}/api/mm-product-onhand/all`;

    try {
        const res = await fetchWithRetry(
            url,
            {
                headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
                signal
            },
            1
        );
        if (!res.ok) {
            return { ok: false, error: `Live inventory service returned HTTP ${res.status}.` };
        }
        const json = await res.json();
        const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        return { ok: true, rows: rows as SpringOnhandRow[] };
    } catch (error: unknown) {
        if (signal?.aborted) throw error;
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Live inventory service is unreachable."
        };
    }
}

async function fetchSpringBatchOnhand(
    accessToken: string,
    signal?: AbortSignal
): Promise<{ ok: true; rows: SpringBatchOnhandRow[] } | { ok: false; error: string }> {
    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");
    if (!springBase) return { ok: false, error: "Batch inventory service is not configured." };

    try {
        const res = await fetchWithRetry(
            `${springBase}/api/mm-batch-onhand/all`,
            {
                headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
                signal
            },
            1
        );
        if (!res.ok) {
            return { ok: false, error: `Batch inventory service returned HTTP ${res.status}.` };
        }
        const json = await res.json();
        const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        return { ok: true, rows: rows as SpringBatchOnhandRow[] };
    } catch (error: unknown) {
        if (signal?.aborted) throw error;
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Batch inventory service is unreachable."
        };
    }
}

function getManilaTodayUtcMs(): number {
    const now = new Date();
    const manila = new Date(now.getTime() + 8 * 3600 * 1000);
    return Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate());
}

function evaluateLotStatus(
    rawQa: unknown,
    expStr: string | null,
    todayManilaMs: number,
    policy: InventoryPolicyTag,
    rawStatus?: unknown,
    rawSourceStatus?: unknown
): {
    daysRemaining: number | null;
    effectiveStatus: "EXPIRED" | "EXPIRING SOON" | "QUARANTINED" | "DAMAGED" | "GOOD" | "HOLD";
    statusLabel: string;
    isUnusable: boolean;
    isExpiringSoon: boolean;
    isRisky: boolean;
} {
    const qa = String(rawQa || "GOOD").trim().toUpperCase();
    const st = String(rawStatus || "ACTIVE").trim().toUpperCase();
    const srcSt = String(rawSourceStatus || "").trim().toUpperCase();
    const expMs = expStr ? new Date(`${expStr}T00:00:00.000Z`).getTime() : null;
    const validExpMs = expMs !== null && !Number.isNaN(expMs) ? expMs : null;
    const daysRemaining =
        validExpMs !== null ? Math.floor((validExpMs - todayManilaMs) / 86400000) : null;

    const isHold =
        qa === "HOLD" ||
        qa === "ON HOLD" ||
        qa === "ON_HOLD" ||
        st === "HOLD" ||
        st === "ON HOLD" ||
        st === "ON_HOLD" ||
        st === "INACTIVE" ||
        st === "CLOSED" ||
        srcSt === "HOLD" ||
        srcSt === "ON HOLD" ||
        srcSt === "ON_HOLD";

    if (isHold) {
        return {
            daysRemaining,
            effectiveStatus: "HOLD",
            statusLabel: st === "CLOSED" ? "Closed" : st === "INACTIVE" ? "Inactive" : "On Hold",
            isUnusable: true,
            isExpiringSoon: false,
            isRisky: true
        };
    }

    if (qa === "QUARANTINED" || st === "QUARANTINED" || srcSt === "QUARANTINED" || srcSt === "REJECTED") {
        return {
            daysRemaining,
            effectiveStatus: "QUARANTINED",
            statusLabel:
                daysRemaining !== null && daysRemaining < 0
                    ? `Quarantined · Expired ${Math.abs(daysRemaining)}d ago`
                    : "Quarantined",
            isUnusable: true,
            isExpiringSoon: false,
            isRisky: true
        };
    }

    if (qa === "DAMAGED" || st === "DAMAGED") {
        return {
            daysRemaining,
            effectiveStatus: "DAMAGED",
            statusLabel: "Damaged",
            isUnusable: true,
            isExpiringSoon: false,
            isRisky: true
        };
    }

    if (qa === "EXPIRED" || st === "EXPIRED" || (daysRemaining !== null && daysRemaining < 0)) {
        return {
            daysRemaining,
            effectiveStatus: "EXPIRED",
            statusLabel:
                daysRemaining !== null && daysRemaining < 0
                    ? `Expired (${Math.abs(daysRemaining)}d ago)`
                    : "Expired",
            isUnusable: true,
            isExpiringSoon: false,
            isRisky: true
        };
    }

    if (daysRemaining !== null && daysRemaining <= 30) {
        return {
            daysRemaining,
            effectiveStatus: "EXPIRING SOON",
            statusLabel: daysRemaining === 0 ? "Expires today" : `Expires in ${daysRemaining}d`,
            isUnusable: false,
            isExpiringSoon: true,
            isRisky: true
        };
    }

    return {
        daysRemaining,
        effectiveStatus: "GOOD",
        statusLabel:
            daysRemaining !== null
                ? `Valid (${daysRemaining}d left)`
                : policy === "FIFO"
                ? "Active (FIFO)"
                : "Active Lot",
        isUnusable: false,
        isExpiringSoon: false,
        isRisky: false
    };
}

interface IndividualProductInfo {
    productId: number;
    parentId: number | null;
    isChild: boolean;
    familyId: number;
    productCode: string;
    productName: string;
    categoryName: string;
    rawCategoryName: string;
    rawInventoryType: unknown;
    unitId: number;
    unitLabel: string;
    baseUnitLabel: string;
    multiplier: number;
    inventoryPolicy: InventoryPolicyTag;
    manufacturingLeadDays: number;
    maintainingBaseQty: number;
    shelfLifeDays: number | null;
}

export async function buildDemandForecastReport(params: {
    filters: DemandForecastFilters;
    accessToken: string;
    signal?: AbortSignal;
}): Promise<DemandForecastReportPayload> {
    const { filters, accessToken, signal } = params;
    const cadence: ForecastCadence = filters.cadence === "weekly" ? "weekly" : "monthly";
    const period: HistoricalPeriodPreset =
        filters.period || (cadence === "weekly" ? "last12Weeks" : "last6Months");
    const branchId = filters.branchId || "all";
    const productId = filters.productId || "all";
    const regionKey = filters.regionKey || "all";
    const forecastHorizon: ForecastHorizonOption =
        filters.forecastHorizon || (cadence === "weekly" ? "8w" : "6m");
    const includeUnmappedRegions = filters.includeUnmappedRegions !== false;

    const { start: dateFrom, end: dateTo, label: periodLabel } = resolveHistoricalDateRange(
        period,
        filters.dateFrom || "",
        filters.dateTo || ""
    );
    const { steps: horizonSteps, label: forecastHorizonLabel } = parseHorizonSteps(
        forecastHorizon,
        cadence
    );

    const notices: SourceHealthNotice[] = [];

    // Stage 1: Core registries, products, sales order headers, and live inventory
    const soParams = new URLSearchParams({
        limit: "-1",
        fields: "order_id,order_no,customer_code,branch_id,order_date,order_status,isCancelled",
        sort: "order_date"
    });
    soParams.set("filter[order_date][_gte]", dateFrom);
    soParams.set("filter[order_date][_lte]", dateTo);
    if (branchId !== "all") {
        soParams.set("filter[branch_id][_eq]", branchId);
    }

    const [
        aiTier,
        allBranchRows,
        rawSalesOrders,
        allProductsRows,
        categoryRows,
        unitRows,
        springOnhandRes,
        springBatchOnhandRes
    ] = await Promise.all([
        resolveServerAiTier(signal),
        fetchDirectusStrict(
            "branches",
            new URLSearchParams({
                "filter[isActive][_eq]": "1",
                fields: "id,branch_code,branch_name,isActive,isBadStock",
                limit: "-1"
            }),
            signal
        ),
        fetchDirectusStrict("sales_order", soParams, signal),
        fetchDirectusStrict(
            "products",
            new URLSearchParams({
                fields: "product_id,parent_id,product_code,product_name,product_category,unit_of_measurement,unit_of_measurement_count,inventory_type,maintaining_quantity,manufacturing_lead_days,product_shelf_life",
                limit: "-1"
            }),
            signal
        ),
        fetchDirectusStrict(
            "categories",
            new URLSearchParams({ fields: "category_id,category_name", limit: "-1" }),
            signal
        ),
        fetchDirectusStrict(
            "units",
            new URLSearchParams({ fields: "unit_id,unit_shortcut,unit_name", limit: "-1" }),
            signal
        ),
        fetchSpringOnhand(accessToken, branchId, signal),
        fetchSpringBatchOnhand(accessToken, signal)
    ]);

    const badStockBranchIds = new Set<number>();
    const branchRows: DirectusRow[] = [];
    for (const b of allBranchRows) {
        if (Number(b.isActive ?? 1) !== 1) continue;
        const bid = Number(b.id);
        if (Number(b.isBadStock || 0) === 1) badStockBranchIds.add(bid);
        if (branchId !== "all" && String(bid) === branchId) branchRows.push(b);
    }

    const categoryMap = new Map<number, string>();
    for (const c of categoryRows) {
        categoryMap.set(Number(c.category_id), String(c.category_name || "General"));
    }

    const unitMap = new Map<number, string>();
    for (const u of unitRows) {
        unitMap.set(Number(u.unit_id), String(u.unit_shortcut || u.unit_name || "PCS").trim());
    }

    const baseUnitByFamily = new Map<number, string>();
    const familyUomMultiplierMap = new Map<number, Map<number, number>>();
    const nameCounts = new Map<string, number>();

    // Pass 1: Parent/root products establish the authoritative base UOM for the product family
    for (const p of allProductsRows) {
        const pid = Number(p.product_id);
        if (!pid) continue;
        const parentId = parseParentId(p.parent_id);
        const isParent = !parentId || parentId === pid;
        if (!isParent) continue;

        const unitId = Number(p.unit_of_measurement) || 0;
        const uLabel = unitMap.get(unitId) || "PCS";
        baseUnitByFamily.set(pid, uLabel);
    }

    // Pass 2: Register children and UOM multiplier mappings without overriding parent base unit
    for (const p of allProductsRows) {
        const pid = Number(p.product_id);
        if (!pid) continue;
        const rawName = String(p.product_name || `Product #${pid}`).trim();

        const parentId = parseParentId(p.parent_id);
        const familyId = parentId && parentId !== pid ? parentId : pid;
        const unitId = Number(p.unit_of_measurement) || 0;
        const uLabel = unitMap.get(unitId) || "PCS";
        const mult = parsePositiveMultiplier(p.unit_of_measurement_count);

        if (!baseUnitByFamily.has(familyId)) {
            baseUnitByFamily.set(familyId, uLabel);
        }
        if (unitId > 0) {
            const fm = familyUomMultiplierMap.get(familyId) || new Map<number, number>();
            fm.set(unitId, mult);
            familyUomMultiplierMap.set(familyId, fm);
        }
        nameCounts.set(rawName.toLowerCase(), (nameCounts.get(rawName.toLowerCase()) || 0) + 1);
    }

    const productMap = new Map<number, IndividualProductInfo>();
    for (const p of allProductsRows) {
        const pid = Number(p.product_id);
        if (!pid) continue;
        const rawName = String(p.product_name || `Product #${pid}`).trim();

        const parentId = parseParentId(p.parent_id);
        const isChild = Boolean(parentId && parentId !== pid);
        const familyId = isChild ? parentId! : pid;
        const unitId = Number(p.unit_of_measurement) || 0;
        const unitLabel = unitMap.get(unitId) || "PCS";
        const mult = parsePositiveMultiplier(p.unit_of_measurement_count);
        const baseUnitLabel =
            isChild && mult > 1 ? baseUnitByFamily.get(familyId) || unitLabel : unitLabel;
        const rawCategoryName = categoryMap.get(Number(p.product_category)) || "General";
        const hasDuplicateName = (nameCounts.get(rawName.toLowerCase()) || 0) > 1;
        const displayName = hasDuplicateName
            ? `${rawName} (${unitLabel}${mult > 1 ? ` ×${mult}` : ""})`
            : rawName;
        const shelfLifeDays = p.product_shelf_life ? Number(p.product_shelf_life) : null;

        productMap.set(pid, {
            productId: pid,
            parentId: isChild ? parentId : null,
            isChild,
            familyId,
            productCode: String(p.product_code || `SKU-${pid}`),
            productName: displayName,
            categoryName: `${rawCategoryName} · ${isChild ? "Child" : "Parent"}`,
            rawCategoryName,
            rawInventoryType: p.inventory_type,
            unitId,
            unitLabel,
            baseUnitLabel,
            multiplier: mult,
            inventoryPolicy: classifyInventoryPolicy(shelfLifeDays),
            manufacturingLeadDays: Math.max(0, Number(p.manufacturing_lead_days) || 0),
            maintainingBaseQty: Math.round(
                Math.max(0, Number(p.maintaining_quantity) || 0) * mult
            ),
            shelfLifeDays
        });
    }

    // Filter active sales orders
    const validSalesOrders = rawSalesOrders.filter((so) => {
        const status = String(so.order_status || "");
        const isCancelled = so.isCancelled === true || so.isCancelled === 1;
        return !isCancelled && !EXCLUDED_ORDER_STATUSES.has(status);
    });

    const orderMap = new Map<number, DirectusRow>();
    const customerCodes = new Set<string>();
    const orderIds: number[] = [];

    for (const so of validSalesOrders) {
        const oid = Number(so.order_id);
        if (!oid) continue;
        orderMap.set(oid, so);
        orderIds.push(oid);
        const code = String(so.customer_code || "").trim();
        if (code) customerCodes.add(code);
    }

    // Stage 2: Bounded-concurrency fetch of Sales Order Details + Customers
    const [rawOrderDetails, customerRows] = await Promise.all([
        fetchDirectusChunked(
            "sales_order_details",
            "order_id",
            orderIds,
            "detail_id,order_id,product_id,ordered_quantity,allocated_quantity,served_quantity",
            undefined,
            signal
        ),
        fetchDirectusChunked(
            "customer",
            "customer_code",
            Array.from(customerCodes),
            "customer_code,customer_name,store_name,province,city,brgy",
            undefined,
            signal
        )
    ]);

    const targetProductId = productId !== "all" ? Number(productId) : null;
    const filteredDetails = rawOrderDetails.filter((d) => {
        const pid = Number(d.product_id);
        const qty = Number(d.ordered_quantity) || 0;
        if (!pid || qty <= 0) return false;
        if (targetProductId && pid !== targetProductId) return false;
        return true;
    });

    const matchedProductIds = Array.from(
        new Set<number>([
            ...filteredDetails.map((d) => Number(d.product_id)).filter(Boolean),
            ...(targetProductId ? [targetProductId] : [])
        ])
    );

    const bomLookupProductIds = Array.from(
        new Set<number>(
            matchedProductIds.flatMap((pid) => {
                const parentId = productMap.get(pid)?.parentId;
                return parentId ? [pid, parentId] : [pid];
            })
        )
    );

    // Stage 3: Scoped fetches for Job Orders, Active Lots, and BOMs strictly for matched SKUs (no full-table scans!)
    const extraBranchFilter: Record<string, string> | undefined =
        branchId !== "all" ? { "filter[branch_id][_eq]": branchId } : undefined;
    const lotExtraFilters: Record<string, string> = {
        ...(extraBranchFilter || {})
    };

    const [rawJobOrders, rawInventoryLots, bomVersionRows] = await Promise.all([
        fetchDirectusChunked(
            "manufacturing_job_orders",
            "product_id",
            matchedProductIds,
            "job_order_id,job_order_no,branch_id,product_id,uom_id,target_quantity,actual_quantity_produced,status,start_date,end_date",
            extraBranchFilter,
            signal
        ),
        fetchDirectusChunked(
            "mm_inventory_lots",
            "product_id",
            matchedProductIds,
            "inventory_lot_id,branch_id,product_id,batch_no,manufacturing_date,expiry_date,qa_status,status,created_at",
            lotExtraFilters,
            signal
        ),
        fetchDirectusChunked(
            "product_manufacturing_version",
            "product_id",
            bomLookupProductIds,
            "version_id,product_id,version_name,base_quantity,uom_id,expected_yield_percentage,status,is_primary",
            undefined,
            signal
        )
    ]);

    // Refine product FEFO/FIFO policy using actual expiry-tracked lots (never keyword guess!)
    const productsWithExpiryLots = new Set<number>();
    for (const lot of rawInventoryLots) {
        if (lot.expiry_date) {
            productsWithExpiryLots.add(Number(lot.product_id));
        }
    }

    const activeBomByProduct = new Map<number, DirectusRow>();
    for (const bv of bomVersionRows) {
        if (String(bv.status || "") !== "Active") continue;
        const pid = Number(bv.product_id);
        const existing = activeBomByProduct.get(pid);
        if (!existing || (Number(bv.is_primary) === 1 && Number(existing.is_primary) !== 1)) {
            activeBomByProduct.set(pid, bv);
        }
    }

    const bomVersionIds = Array.from(activeBomByProduct.values()).map((bv) =>
        Number(bv.version_id)
    );
    const laborPositionRows = await fetchDirectusChunked(
        "product_version_positions",
        "version_id",
        bomVersionIds,
        "id,version_id,position_name,manpower_count,hours_required,hourly_rate,category",
        undefined,
        signal
    );

    // Customer region resolution (direct customer province & city)
    const regionLabelMap = new Map<string, string>();
    const customerRegionMap = new Map<
        string,
        {
            customerName: string;
            key: string;
            label: string;
            source: "cluster" | "province" | "unmapped";
        }
    >();

    const cleanCustomerField = (val: unknown): string => {
        const s = String(val ?? "").trim();
        return s && s !== "0" && s !== "null" && s !== "undefined" ? s : "";
    };

    for (const cust of customerRows) {
        const code = String(cust.customer_code || "").trim();
        const cName = cleanCustomerField(cust.customer_name);
        const sName = cleanCustomerField(cust.store_name);
        let name = cName || sName || code || "Customer";
        if (cName && sName && cName.toLowerCase() !== sName.toLowerCase()) {
            name = `${cName} (${sName})`;
        }
        const reg = resolveCustomerRegion(cust.province, cust.city);
        const entry = { customerName: name, ...reg };
        customerRegionMap.set(code, entry);
        if (code.toLowerCase() !== code) {
            customerRegionMap.set(code.toLowerCase(), entry);
        }
        regionLabelMap.set(reg.key, reg.label);
    }

    // Normalize Sales Order demand lines per individual product_id
    const demandLines: NormalizedDemandLine[] = [];
    let selectedRegionLabel = "All Customer Regions";

    for (const d of filteredDetails) {
        const oid = Number(d.order_id);
        const so = orderMap.get(oid);
        if (!so) continue;

        const custCode = String(so.customer_code || "").trim();
        const custInfo =
            customerRegionMap.get(custCode) ||
            customerRegionMap.get(custCode.toLowerCase()) || {
                customerName: custCode || "Direct Customer",
                key: "unmapped",
                label: "Unmapped Region",
                source: "unmapped" as const
            };

        if (!includeUnmappedRegions && custInfo.source === "unmapped") continue;
        if (regionKey !== "all" && custInfo.key !== regionKey) continue;
        if (regionKey !== "all" && custInfo.key === regionKey) {
            selectedRegionLabel = custInfo.label;
        }

        const pid = Number(d.product_id);
        const prod = productMap.get(pid);
        const uomMultiplier = prod?.multiplier ?? 1;
        const rawUnitLabel = prod?.unitLabel ?? "PCS";
        const baseUnitLabel = prod?.baseUnitLabel ?? rawUnitLabel;

        const rawOrderedQty = Number(d.ordered_quantity) || 0;
        const rawServedQty = Number(d.served_quantity) || 0;

        demandLines.push({
            orderId: oid,
            orderNo: String(so.order_no || `SO-${oid}`),
            orderDate: String(so.order_date || "").slice(0, 10),
            orderStatus: String(so.order_status || "Open"),
            branchId: Number(so.branch_id) || 0,
            customerCode: custCode,
            customerName: custInfo.customerName,
            regionKey: custInfo.key,
            regionLabel: custInfo.label,
            regionSource: custInfo.source,
            productId: pid,
            productCode: prod?.productCode ?? `SKU-${pid}`,
            productName: prod?.productName ?? `Product #${pid}`,
            categoryName: prod?.categoryName ?? "General",
            unitLabel: baseUnitLabel,
            inventoryPolicy: prod?.inventoryPolicy ?? "FEFO",
            orderedQuantity: rawOrderedQty * uomMultiplier,
            servedQuantity: rawServedQty * uomMultiplier,
            rawOrderedQuantity: rawOrderedQty,
            rawUnitLabel,
            uomMultiplier,
            manufacturingLeadDays: prod?.manufacturingLeadDays ?? 0,
            maintainingQty: prod?.maintainingBaseQty ?? 0,
            shelfLifeDays: prod?.shelfLifeDays ?? null
        });
    }

    // Build per-SKU supply context (Live Usable On-Hand, Expiring-Soon Units, Open JOs, Active Lots, BOM Labor)
    const evidenceRegistry: Record<string, EvidenceRecord> = {};
    const supplyByProduct = new Map<number, ProductSupplyContext>();
    const todayManilaMs = getManilaTodayUtcMs();

    const lotMetaById = new Map<number, DirectusRow>();
    const lotMetaByProdBatch = new Map<string, DirectusRow>();
    for (const lot of rawInventoryLots) {
        const lotId = Number(lot.inventory_lot_id);
        const pid = Number(lot.product_id);
        const bno = String(lot.batch_no || "").trim().toLowerCase();
        if (lotId) lotMetaById.set(lotId, lot);
        if (pid && bno) lotMetaByProdBatch.set(`${pid}::${bno}`, lot);
    }

    const batchBaseOnhandByLotId = new Map<number, number>();
    const batchBaseOnhandByProdBatch = new Map<string, number>();
    const unusableBaseByProduct = new Map<number, number>();
    const expiringSoonBaseByProduct = new Map<number, number>();
    const batchUsableBaseByProduct = new Map<number, number>();
    const totalPositiveBatchBaseByProduct = new Map<number, number>();
    const productsWithBatchRows = new Set<number>();

    if (springBatchOnhandRes.ok) {
        for (const brow of springBatchOnhandRes.rows) {
            const bBranchId = Number(brow.branchId ?? brow.branch_id ?? 0);
            if (branchId !== "all" && bBranchId !== Number(branchId)) continue;
            if (branchId === "all" && badStockBranchIds.has(bBranchId)) continue;

            const pid = Number(brow.productId ?? brow.product_id ?? 0);
            const qty = Number(brow.onhandQuantity ?? brow.onhand_quantity ?? 0);
            if (!pid || !Number.isFinite(qty)) continue;

            productsWithBatchRows.add(pid);

            // Strictly exclude negative or zero batches from calculation (do not subtract from good stock)
            if (qty <= 0) continue;

            const prod = productMap.get(pid);
            const familyUoms = prod ? familyUomMultiplierMap.get(prod.familyId) : undefined;
            const rowUnitId = Number(brow.unitId ?? brow.unit_id ?? 0);
            const mult =
                (rowUnitId > 0 ? familyUoms?.get(rowUnitId) : undefined) ??
                prod?.multiplier ??
                1;
            const baseQty = qty * mult;

            totalPositiveBatchBaseByProduct.set(
                pid,
                (totalPositiveBatchBaseByProduct.get(pid) || 0) + baseQty
            );

            const invLotId = Number(brow.inventoryLotId ?? brow.inventory_lot_id ?? 0);
            const bno = String(brow.batchNo ?? brow.batch_no ?? "").trim().toLowerCase();
            if (invLotId) {
                batchBaseOnhandByLotId.set(
                    invLotId,
                    (batchBaseOnhandByLotId.get(invLotId) || 0) + baseQty
                );
            }
            if (bno) {
                const key = `${pid}::${bno}`;
                batchBaseOnhandByProdBatch.set(
                    key,
                    (batchBaseOnhandByProdBatch.get(key) || 0) + baseQty
                );
            }

            const matchedLot =
                (invLotId ? lotMetaById.get(invLotId) : undefined) ||
                (bno ? lotMetaByProdBatch.get(`${pid}::${bno}`) : undefined);
            const rawQa =
                matchedLot?.qa_status ??
                brow.qaStatus ??
                brow.qa_status ??
                brow.inventoryCondition ??
                brow.inventory_condition ??
                "GOOD";
            const rawStatus =
                matchedLot?.status ??
                brow.status ??
                "ACTIVE";
            const rawSourceStatus =
                matchedLot?.source_status ??
                brow.sourceStatus ??
                brow.source_status;
            const rawExp =
                matchedLot?.expiry_date ?? brow.expirationDate ?? brow.expiration_date ?? null;
            const expStr = rawExp ? String(rawExp).slice(0, 10) : null;
            const evalRes = evaluateLotStatus(
                rawQa,
                expStr,
                todayManilaMs,
                prod?.inventoryPolicy ?? "FEFO",
                rawStatus,
                rawSourceStatus
            );

            if (evalRes.isUnusable) {
                unusableBaseByProduct.set(pid, (unusableBaseByProduct.get(pid) || 0) + baseQty);
            } else {
                batchUsableBaseByProduct.set(
                    pid,
                    (batchUsableBaseByProduct.get(pid) || 0) + baseQty
                );

                if (evalRes.isExpiringSoon) {
                    expiringSoonBaseByProduct.set(
                        pid,
                        (expiringSoonBaseByProduct.get(pid) || 0) + baseQty
                    );
                }
            }
        }
    }

    const onhandBaseByProduct = new Map<number, number>();
    if (springBatchOnhandRes.ok || springOnhandRes.ok) {
        // Priority 1: When Spring Batch On-hand is available, use verified batch quantities directly
        // strictly excluding unusable/hold/expired batches (negative batches are never deducted)
        if (springBatchOnhandRes.ok) {
            for (const pid of productsWithBatchRows) {
                const usableStock = batchUsableBaseByProduct.get(pid) || 0;
                onhandBaseByProduct.set(pid, usableStock);
            }
        }

        // Priority 2: For items without batch tracking, use springOnhandRes (strictly excluding negative quantities)
        if (springOnhandRes.ok) {
            for (const row of springOnhandRes.rows) {
                const rBranchId = Number(row.branchId ?? row.branch_id ?? 0);
                if (branchId !== "all" && rBranchId !== Number(branchId)) continue;
                if (branchId === "all" && badStockBranchIds.has(rBranchId)) continue;

                const pid = Number(row.productId ?? row.product_id);
                if (!pid) continue;
                // If product was already resolved from batch inventory, don't overwrite with unverified product-level total
                if (productsWithBatchRows.has(pid)) continue;

                const qty = Number(row.onhandQuantity ?? row.onhand_quantity ?? 0);
                // Do not include negative batches or negative on-hand in calculation
                if (!Number.isFinite(qty) || qty <= 0) continue;

                const prod = productMap.get(pid);
                const familyUoms = prod ? familyUomMultiplierMap.get(prod.familyId) : undefined;
                const rowUnitId = Number(row.unitId ?? row.unit_id ?? 0);
                const mult =
                    (rowUnitId > 0 ? familyUoms?.get(rowUnitId) : undefined) ??
                    prod?.multiplier ??
                    1;
                onhandBaseByProduct.set(pid, (onhandBaseByProduct.get(pid) || 0) + qty * mult);
            }
        }

        if (!springBatchOnhandRes.ok) {
            notices.push({
                id: "batch-expiry-unavailable",
                severity: "warning",
                message:
                    "Batch-level expiry quantities are temporarily unavailable; Live On-Hand reflects total physical stock."
            });
        }
    } else {
        notices.push({
            id: "live-inventory-unavailable",
            severity: "error",
            message:
                "Live inventory balances could not be reached. Planning quantities are shown as '-' until inventory reconnects."
        });
    }

    // Open Job Orders per SKU
    const openJoByProduct = new Map<
        number,
        { units: number; count: number; evIds: string[]; totalCount: number }
    >();
    for (const jo of rawJobOrders) {
        const status = String(jo.status || "");
        if (!OPEN_JOB_ORDER_STATUSES.has(status)) continue;
        const pid = Number(jo.product_id);
        if (!pid) continue;
        const prod = productMap.get(pid);
        const familyUoms = prod ? familyUomMultiplierMap.get(prod.familyId) : undefined;
        const joUomId = Number(jo.uom_id || 0);
        const mult = (joUomId > 0 ? familyUoms?.get(joUomId) : undefined) ?? prod?.multiplier ?? 1;

        const target = Number(jo.target_quantity) || 0;
        const produced = Number(jo.actual_quantity_produced) || 0;
        const remainingRaw = Math.max(0, target - produced);
        const remainingBase = remainingRaw * mult;

        const entry = openJoByProduct.get(pid) || {
            units: 0,
            count: 0,
            evIds: [],
            totalCount: 0
        };
        entry.units += remainingBase;
        entry.count += 1;
        entry.totalCount += 1;

        const evId = `jo-${jo.job_order_id}`;
        if (!evidenceRegistry[evId]) {
            const baseUnit = prod?.baseUnitLabel || "PCS";
            const joUnitLabel =
                (joUomId > 0 ? unitMap.get(joUomId) : undefined) || prod?.unitLabel || baseUnit;
            evidenceRegistry[evId] = {
                id: evId,
                type: "job_order",
                reference: String(jo.job_order_no || `JO-${jo.job_order_id}`),
                title: prod?.productName || `Product #${pid}`,
                subtitle: `Open Supply · Target ${target.toLocaleString()} / Produced ${produced.toLocaleString()} ${joUnitLabel}`,
                date: String(jo.end_date || jo.start_date || "-").slice(0, 10),
                quantityLabel:
                    mult > 1 && joUnitLabel !== baseUnit
                        ? `${Math.round(remainingRaw).toLocaleString()} ${joUnitLabel} → ${Math.round(remainingBase).toLocaleString()} ${baseUnit}`
                        : `${Math.round(remainingBase).toLocaleString()} ${baseUnit} open`,
                status
            };
        }
        if (entry.evIds.length < 12) entry.evIds.push(evId);
        openJoByProduct.set(pid, entry);
    }

    // Active Lots per SKU sorted in true FEFO / FIFO order with priority for live physical stock
    interface EvaluatedLotEntry {
        evId: string;
        batchNo: string;
        pid: number;
        expStr: string | null;
        mfgStr: string;
        sortKey: number;
        priorityTier: number;
        effectiveStatus: "EXPIRED" | "EXPIRING SOON" | "QUARANTINED" | "DAMAGED" | "GOOD" | "HOLD";
        statusLabel: string;
        isRisky: boolean;
        baseOnhandQty: number | null;
        rawQa?: string;
    }

    const evaluatedLotsByProduct = new Map<number, EvaluatedLotEntry[]>();
    const emittedBatchAggKeys = new Set<string>();

    // 1. Process verified live batch balances from Spring Boot v_mm_batch_onhand
    if (springBatchOnhandRes.ok) {
        // Aggregate rows by (product, batch_no, expStr) across shelves/racks
        const batchAggregates = new Map<
            string,
            {
                invLotId: number;
                batchNo: string;
                pid: number;
                expStr: string | null;
                mfgStr: string;
                baseQty: number;
                rawQa: string;
                rawStatus: string;
                rawSourceStatus?: string;
            }
        >();

        for (const brow of springBatchOnhandRes.rows) {
            const bBranchId = Number(brow.branchId ?? brow.branch_id ?? 0);
            if (branchId !== "all" && bBranchId !== Number(branchId)) continue;
            if (branchId === "all" && badStockBranchIds.has(bBranchId)) continue;

            const pid = Number(brow.productId ?? brow.product_id ?? 0);
            if (!pid) continue;

            const invLotId = Number(brow.inventoryLotId ?? brow.inventory_lot_id ?? 0);
            const bno = String(brow.batchNo ?? brow.batch_no ?? "").trim();
            if (!bno && !invLotId) continue;

            const qty = Number(brow.onhandQuantity ?? brow.onhand_quantity ?? 0);
            if (!Number.isFinite(qty)) continue;

            const prod = productMap.get(pid);
            const familyUoms = prod ? familyUomMultiplierMap.get(prod.familyId) : undefined;
            const rowUnitId = Number(brow.unitId ?? brow.unit_id ?? 0);
            const mult =
                (rowUnitId > 0 ? familyUoms?.get(rowUnitId) : undefined) ??
                prod?.multiplier ??
                1;
            const baseQty = qty > 0 ? qty * mult : 0;

            const rawExp = brow.expirationDate ?? brow.expiration_date;
            const expStr = rawExp ? String(rawExp).slice(0, 10) : null;
            const rawMfg = brow.manufacturingDate ?? brow.manufacturing_date;
            const mfgStr = rawMfg ? String(rawMfg).slice(0, 10) : "-";

            const matchedLot =
                (invLotId ? lotMetaById.get(invLotId) : undefined) ||
                (bno ? lotMetaByProdBatch.get(`${pid}::${bno.toLowerCase()}`) : undefined);

            const rawQa = String(
                matchedLot?.qa_status ??
                    brow.qaStatus ??
                    brow.qa_status ??
                    brow.inventoryCondition ??
                    brow.inventory_condition ??
                    "GOOD"
            );
            const rawStatus = String(matchedLot?.status ?? brow.status ?? "ACTIVE");
            const rawSourceStatus =
                matchedLot?.source_status ?? brow.sourceStatus ?? brow.source_status;

            const normBatch = (bno || `LOT-${invLotId}`).toLowerCase();
            const aggKey = `${pid}::${normBatch}::${expStr || "no-exp"}`;
            const existing = batchAggregates.get(aggKey);
            if (existing) {
                existing.baseQty += baseQty;
                if (invLotId > 0 && !existing.invLotId) existing.invLotId = invLotId;
            } else {
                batchAggregates.set(aggKey, {
                    invLotId,
                    batchNo: bno || `LOT-${invLotId}`,
                    pid,
                    expStr,
                    mfgStr,
                    baseQty,
                    rawQa,
                    rawStatus,
                    rawSourceStatus: rawSourceStatus ? String(rawSourceStatus) : undefined
                });
            }
        }

        for (const [aggKey, agg] of batchAggregates.entries()) {
            emittedBatchAggKeys.add(aggKey);
            const roundedQty = Math.round(agg.baseQty);
            // Strictly do not show batches with quantity equal to 0 (or negative)
            if (roundedQty <= 0) continue;

            const prod = productMap.get(agg.pid);
            const policy = prod?.inventoryPolicy ?? "FEFO";

            const evalRes = evaluateLotStatus(
                agg.rawQa,
                agg.expStr,
                todayManilaMs,
                policy,
                agg.rawStatus,
                agg.rawSourceStatus
            );

            const expTime = agg.expStr
                ? new Date(`${agg.expStr}T00:00:00.000Z`).getTime()
                : Number.MAX_SAFE_INTEGER;
            const mfgTime =
                agg.mfgStr && agg.mfgStr !== "-"
                    ? new Date(`${agg.mfgStr}T00:00:00.000Z`).getTime()
                    : 0;

            // Priority Tiers for FEFO Stock Allocation (positive physical stock only):
            // Tier 1: Active Good stock (unexpired, positive quantity) -> sorted FEFO by earliest future expiry date
            // Tier 2: Expiring Soon stock (usable within 30 days, positive quantity)
            // Tier 3: Hold stock (quarantine / QC hold, positive quantity)
            // Tier 4: Damaged / Quarantined stock (positive quantity)
            // Tier 5: Expired stock physically present (positive quantity) -> sorted by most recent expiry
            let priorityTier = 1;
            let sortKey = policy === "FEFO" ? expTime : mfgTime;

            if (evalRes.effectiveStatus === "GOOD") {
                priorityTier = 1;
                sortKey = policy === "FEFO" ? expTime : mfgTime;
            } else if (evalRes.effectiveStatus === "EXPIRING SOON") {
                priorityTier = 2;
                sortKey = expTime;
            } else if (evalRes.effectiveStatus === "HOLD") {
                priorityTier = 3;
                sortKey = expTime;
            } else if (
                evalRes.effectiveStatus === "QUARANTINED" ||
                evalRes.effectiveStatus === "DAMAGED"
            ) {
                priorityTier = 4;
                sortKey = expTime;
            } else if (evalRes.effectiveStatus === "EXPIRED") {
                priorityTier = 5;
                sortKey = -expTime;
            }

            const evId =
                agg.invLotId > 0
                    ? `lot-${agg.invLotId}`
                    : `lot-batch-${agg.pid}-${agg.batchNo.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;

            const list = evaluatedLotsByProduct.get(agg.pid) || [];
            list.push({
                evId,
                batchNo: agg.batchNo,
                pid: agg.pid,
                expStr: agg.expStr,
                mfgStr: agg.mfgStr,
                sortKey,
                priorityTier,
                effectiveStatus: evalRes.effectiveStatus,
                statusLabel: evalRes.statusLabel,
                isRisky: evalRes.isRisky,
                baseOnhandQty: roundedQty,
                rawQa: agg.rawQa
            });
            evaluatedLotsByProduct.set(agg.pid, list);
        }
    }

    // Directus mm_inventory_lots without positive Spring Boot on-hand balance have 0 stock
    // and are strictly excluded to satisfy the requirement: "do not show batches with equal 0".

    const lotsByProduct = new Map<
        number,
        { activeCount: number; expiringLotCount: number; evIds: string[] }
    >();

    for (const [pid, lotEntries] of evaluatedLotsByProduct.entries()) {
        lotEntries.sort((a, b) => a.priorityTier - b.priorityTier || a.sortKey - b.sortKey);
        const prod = productMap.get(pid);
        const baseUnit = prod?.baseUnitLabel || "PCS";
        const evIds: string[] = [];
        let expiringLotCount = 0;

        for (const item of lotEntries) {
            // Strictly exclude any batch with quantity equal to 0 or negative
            if (!item.baseOnhandQty || item.baseOnhandQty <= 0) continue;

            if (item.isRisky) expiringLotCount++;
            const evId = item.evId;
            if (!evidenceRegistry[evId] && evIds.length < 50) {
                const qtyPrefix =
                    item.baseOnhandQty !== null
                        ? `${item.baseOnhandQty.toLocaleString()} ${baseUnit} · `
                        : "";
                const rawQa = (item.rawQa || "GOOD").toUpperCase();
                const overrideMeta =
                    item.effectiveStatus === "EXPIRED" && rawQa === "GOOD"
                        ? "Flagged as EXPIRED based on expiry date"
                        : item.effectiveStatus === "HOLD"
                        ? "On Hold / Quarantined"
                        : undefined;

                evidenceRegistry[evId] = {
                    id: evId,
                    type: "inventory_lot",
                    reference: item.batchNo,
                    title: prod?.productName || `Product #${pid}`,
                    subtitle: item.expStr
                        ? `Expiry: ${item.expStr} (${prod?.inventoryPolicy || "FEFO"})`
                        : `No expiry date (${prod?.inventoryPolicy === "UNKNOWN" ? "Untracked" : "FIFO"})`,
                    date: item.mfgStr,
                    quantityLabel: `${qtyPrefix}${item.statusLabel}`,
                    status: item.effectiveStatus,
                    meta: overrideMeta
                };
                evIds.push(evId);
            }
        }

        lotsByProduct.set(pid, {
            activeCount:
                lotEntries.filter((l) => (l.baseOnhandQty ?? 0) > 0).length ||
                lotEntries.length,
            expiringLotCount,
            evIds
        });
    }

    // BOM Labor Positions
    const laborByVersion = new Map<number, LaborPositionEstimate[]>();
    for (const lp of laborPositionRows) {
        const vid = Number(lp.version_id);
        const list = laborByVersion.get(vid) || [];
        list.push({
            positionName: String(lp.position_name || "Line Operator"),
            manpowerCount: Number(lp.manpower_count) || 1,
            hoursPerBatch: Number(lp.hours_required) || 0,
            hourlyRate: Number(lp.hourly_rate) || 0
        });
        laborByVersion.set(vid, list);
    }

    for (const pid of matchedProductIds) {
        const prod = productMap.get(pid);
        const bom =
            activeBomByProduct.get(pid) ||
            (prod?.parentId ? activeBomByProduct.get(prod.parentId) : undefined);

        const vid = bom ? Number(bom.version_id) : 0;
        const positions = vid ? laborByVersion.get(vid) || [] : [];
        const laborHoursPerBatch =
            positions.length > 0
                ? positions.reduce((sum, p) => sum + p.hoursPerBatch * p.manpowerCount, 0)
                : null;

        let bomBaseInBaseUnits: number | null = null;
        if (bom) {
            const rawBaseQty = Number(bom.base_quantity) || 0;
            const bomUomId = Number(bom.uom_id || 0);
            const bomPid = Number(bom.product_id || 0);
            const familyUoms = prod ? familyUomMultiplierMap.get(prod.familyId) : undefined;
            const bomMult =
                (bomUomId > 0 ? familyUoms?.get(bomUomId) : undefined) ??
                productMap.get(bomPid)?.multiplier ??
                1;
            bomBaseInBaseUnits = rawBaseQty > 0 ? rawBaseQty * bomMult : null;
        }

        const joInfo = openJoByProduct.get(pid);
        const lotInfo = lotsByProduct.get(pid);
        const supplyEvidenceIds: string[] = [
            ...(joInfo?.evIds || []),
            ...(lotInfo?.evIds || [])
        ];
        let totalSupplyCount = (joInfo?.totalCount || 0) + (lotInfo?.activeCount || 0);

        if (bom && positions.length > 0) {
            const bomEvId = `bom-${vid}-${pid}`;
            if (!evidenceRegistry[bomEvId]) {
                const baseUnit = prod?.baseUnitLabel || "PCS";
                evidenceRegistry[bomEvId] = {
                    id: bomEvId,
                    type: "bom_labor",
                    reference: String(bom.version_name || `BOM v${vid}`),
                    title: prod?.productName || `Product #${pid}`,
                    subtitle: `${positions.length} labor position(s) · Yield ${Number(bom.expected_yield_percentage || 100)}%`,
                    date: dateTo,
                    quantityLabel: `${Number(laborHoursPerBatch || 0).toFixed(1)} hrs / batch (${Math.round(bomBaseInBaseUnits || 1).toLocaleString()} ${baseUnit})`,
                    status: "Active"
                };
            }
            supplyEvidenceIds.push(bomEvId);
            totalSupplyCount += 1;
        }

        supplyByProduct.set(pid, {
            productId: pid,
            liveOnhandUnits:
                springBatchOnhandRes.ok || springOnhandRes.ok
                    ? Math.round(onhandBaseByProduct.get(pid) || 0)
                    : null,
            expiringSoonUnits: Math.round(expiringSoonBaseByProduct.get(pid) || 0),
            expiringSoonLotCount: lotInfo?.expiringLotCount || 0,
            activeLotCount: lotInfo?.activeCount || 0,
            openJobOrderUnits: Math.round(joInfo?.units || 0),
            openJobOrderCount: joInfo?.count || 0,
            bomBaseQty: bomBaseInBaseUnits,
            bomYieldPct: bom ? Number(bom.expected_yield_percentage) || 100 : null,
            laborHoursPerBatch:
                laborHoursPerBatch !== null ? Number(laborHoursPerBatch.toFixed(2)) : null,
            laborPositions: positions,
            supplyEvidenceIds,
            totalSupplyEvidenceCount: totalSupplyCount
        });
    }

    const analytics = buildForecastAnalytics({
        lines: demandLines,
        cadence,
        dateFrom,
        dateTo,
        horizonSteps,
        supplyByProduct,
        evidenceRegistry
    });

    const branchLabel =
        branchId !== "all" && branchRows[0]
            ? String(branchRows[0].branch_name || `Branch #${branchId}`)
            : "All Branches";

    const productLabel =
        targetProductId && productMap.has(targetProductId)
            ? productMap.get(targetProductId)!.productName
            : "All Products";

    if (regionKey !== "all" && selectedRegionLabel === "All Customer Regions") {
        selectedRegionLabel =
            regionLabelMap.get(regionKey) ||
            (regionKey === "unmapped" ? "Unmapped Region" : regionKey);
    }

    const now = new Date();
    const freshnessCutoff = now.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

    return {
        meta: {
            cadence,
            periodLabel,
            dateFrom,
            dateTo,
            branchLabel,
            productLabel,
            regionLabel: selectedRegionLabel,
            forecastHorizonLabel,
            actualDemandSourceLabel: "Customer Sales Orders (converted to base units)",
            generatedAt: now.toISOString(),
            freshnessCutoff,
            aiTier,
            notices
        },
        kpis: analytics.kpis,
        timeSeries: analytics.timeSeries,
        matrixRows: analytics.matrixRows,
        regionComparison: analytics.regionComparison,
        productComparison: analytics.productComparison,
        planningRows: analytics.planningRows,
        evidenceRegistry
    };
}
