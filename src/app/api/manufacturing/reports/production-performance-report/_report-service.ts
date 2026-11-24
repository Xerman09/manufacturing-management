import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import type {
    PPRDefectParetoRow,
    PPRDispositionRow,
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

type DirectusRecord = Record<string, any>;

function safeNumber(val: unknown, fallback: number = 0): number {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

function safeNumberOrNull(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

export async function fetchProductionFilterCatalog(
    signal?: AbortSignal
): Promise<PPRFilterCatalogPayload> {
    try {
        const directusBase = DIRECTUS_URL?.replace(/\/+$/, "");
        if (!directusBase) {
            return { products: [], workCenters: [], routes: [] };
        }

        const [productsRes, wcRes, routesRes] = await Promise.all([
            fetch(
                `${directusBase}/items/products?fields=product_id,product_name,product_code&filter[isActive][_eq]=1&limit=-1`,
                { headers, signal, cache: "no-store" }
            ).then((r) => (r.ok ? r.json() : { data: [] })),
            fetch(
                `${directusBase}/items/manufacturing_work_centers?fields=work_center_id,work_center_name&filter[is_active][_eq]=1&limit=-1`,
                { headers, signal, cache: "no-store" }
            ).then((r) => (r.ok ? r.json() : { data: [] })),
            fetch(
                `${directusBase}/items/manufacturing_routes?fields=route_id,route_name&limit=-1`,
                { headers, signal, cache: "no-store" }
            ).then((r) => (r.ok ? r.json() : { data: [] }))
        ]);

        const products = Array.isArray(productsRes.data)
            ? productsRes.data.map((p: DirectusRecord) => ({
                  id: Number(p.product_id),
                  code: String(p.product_code || ""),
                  name: String(p.product_name || "Unnamed Product")
              }))
            : [];

        const workCenters = Array.isArray(wcRes.data)
            ? wcRes.data.map((wc: DirectusRecord) => ({
                  id: Number(wc.work_center_id),
                  name: String(wc.work_center_name || "Unnamed Work Center")
              }))
            : [];

        const routes = Array.isArray(routesRes.data)
            ? routesRes.data.map((r: DirectusRecord) => ({
                  id: Number(r.route_id),
                  name: String(r.route_name || "Unnamed Route")
              }))
            : [];

        return { products, workCenters, routes };
    } catch {
        return { products: [], workCenters: [], routes: [] };
    }
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
    const joFilter: Record<string, any> = {};

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
        joFilter.status = { _eq: filters.status };
    }

    const joQuery = new URLSearchParams({
        filter: JSON.stringify(joFilter),
        fields: "job_order_id,job_order_no,product_id.product_id,product_id.product_name,product_id.product_code,status,target_quantity,actual_quantity_produced,completed_quantity,rejected_quantity,start_date,end_date,production_started_at,production_completed_at,primary_work_center_id.work_center_id,primary_work_center_id.work_center_name",
        sort: "-created_at",
        limit: "500"
    });

    const joRes = await fetch(`${directusBase}/items/manufacturing_job_orders?${joQuery.toString()}`, {
        headers,
        signal,
        cache: "no-store"
    });

    if (!joRes.ok) {
        const errJson = await joRes.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to fetch Job Orders (HTTP ${joRes.status}).`);
    }

    const joData = await joRes.json();
    const rawJobOrders: DirectusRecord[] = Array.isArray(joData.data) ? joData.data : [];
    const jobOrderIds = rawJobOrders.map((j) => Number(j.job_order_id)).filter((id) => Number.isInteger(id) && id > 0);

    // Parallel fetch related tables: yield ledger, QA records, final QA releases, work centers, downtime events
    const yieldLedgerFilter: Record<string, any> = jobOrderIds.length > 0 ? { job_order_id: { _in: jobOrderIds } } : {};
    if (filters.dateFrom && filters.dateTo && jobOrderIds.length === 0) {
        yieldLedgerFilter.production_date = { _between: [filters.dateFrom, filters.dateTo] };
    }

    const qaRecordsFilter: Record<string, any> = jobOrderIds.length > 0 ? { job_order_id: { _in: jobOrderIds } } : {};
    const finalQaFilter: Record<string, any> = jobOrderIds.length > 0 ? { job_order_id: { _in: jobOrderIds } } : {};

    const [yieldRes, qaRecordsRes, finalQaRes, workCentersRes, downtimeRes, paramsRes] = await Promise.all([
        jobOrderIds.length > 0
            ? fetch(
                  `${directusBase}/items/manufacturing_job_order_yield_ledger?filter=${encodeURIComponent(
                      JSON.stringify(yieldLedgerFilter)
                  )}&fields=ledger_id,job_order_id,shift_name,yield_quantity,scrap_quantity,rejected_quantity,qa_status,logged_at,production_date,work_center_id.work_center_id,work_center_id.work_center_name,jo_route_id.sequence_order,jo_route_id.operation_id.operation_name&limit=-1`,
                  { headers, signal, cache: "no-store" }
              ).then((r) => (r.ok ? r.json() : { data: [] }))
            : Promise.resolve({ data: [] }),

        jobOrderIds.length > 0
            ? fetch(
                  `${directusBase}/items/manufacturing_job_order_qa_records?filter=${encodeURIComponent(
                      JSON.stringify(qaRecordsFilter)
                  )}&fields=qa_record_id,job_order_id,is_passed,parameter_id.parameter_id,parameter_id.test_name,parameter_id.is_critical,inspected_at&limit=-1`,
                  { headers, signal, cache: "no-store" }
              ).then((r) => (r.ok ? r.json() : { data: [] }))
            : Promise.resolve({ data: [] }),

        jobOrderIds.length > 0
            ? fetch(
                  `${directusBase}/items/manufacturing_final_qa_releases?filter=${encodeURIComponent(
                      JSON.stringify(finalQaFilter)
                  )}&fields=final_release_id,job_order_id,inspected_quantity,defect_quantity,overall_disposition,packaging_seal_passed,label_compliance_passed&limit=-1`,
                  { headers, signal, cache: "no-store" }
              ).then((r) => (r.ok ? r.json() : { data: [] }))
            : Promise.resolve({ data: [] }),

        fetch(
            `${directusBase}/items/manufacturing_work_centers?fields=work_center_id,work_center_name,capacity_per_hour&filter[is_active][_eq]=1&limit=-1`,
            { headers, signal, cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : { data: [] })),

        fetch(
            `${directusBase}/items/manufacturing_asset_maintenance_history?fields=id,asset_id.id,asset_id.serial,asset_id.item_id.name,started_at,ended_at,breakdown_category,root_cause,corrective_action,technician_name&sort=-started_at&limit=50`,
            { headers, signal, cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : { data: [] })),

        fetch(
            `${directusBase}/items/quality_inspection_parameters?fields=parameter_id,test_name,is_critical&limit=-1`,
            { headers, signal, cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : { data: [] }))
    ]);

    const yieldRows: DirectusRecord[] = Array.isArray(yieldRes.data) ? yieldRes.data : [];
    const qaRecords: DirectusRecord[] = Array.isArray(qaRecordsRes.data) ? qaRecordsRes.data : [];
    const finalQaRows: DirectusRecord[] = Array.isArray(finalQaRes.data) ? finalQaRes.data : [];
    const allWorkCenters: DirectusRecord[] = Array.isArray(workCentersRes.data) ? workCentersRes.data : [];
    const rawDowntime: DirectusRecord[] = Array.isArray(downtimeRes.data) ? downtimeRes.data : [];
    const allQaParams: DirectusRecord[] = Array.isArray(paramsRes.data) ? paramsRes.data : [];

    // Map yield ledger per job order
    const joYieldMap = new Map<number, { yieldQty: number; scrapQty: number; rejectedQty: number }>();
    for (const yr of yieldRows) {
        const jid = Number(typeof yr.job_order_id === "object" ? yr.job_order_id?.job_order_id : yr.job_order_id);
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
        const jid = Number(typeof qr.job_order_id === "object" ? qr.job_order_id?.job_order_id : qr.job_order_id);
        if (!jid) continue;
        const cur = joQaMap.get(jid) || { total: 0, passed: 0 };
        cur.total += 1;
        if (qr.is_passed === true || qr.is_passed === 1 || qr.is_passed === "1" || qr.is_passed === "true") {
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
            const startMs = new Date(jo.production_started_at).getTime();
            const endMs = new Date(jo.production_completed_at).getTime();
            if (endMs > startMs) {
                cycleTimeHrs = Number(((endMs - startMs) / (1000 * 3600)).toFixed(1));
            }
        }

        const prodObj = typeof jo.product_id === "object" && jo.product_id ? jo.product_id : null;
        const wcObj = typeof jo.primary_work_center_id === "object" && jo.primary_work_center_id ? jo.primary_work_center_id : null;

        return {
            jobOrderId: id,
            jobOrderNo: String(jo.job_order_no || `JO-${id}`),
            productId: prodObj ? Number(prodObj.product_id) : safeNumber(jo.product_id),
            productName: prodObj ? String(prodObj.product_name || `Product #${jo.product_id}`) : `Product #${jo.product_id}`,
            status: String(jo.status || "Draft"),
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
            workCenterName: wcObj ? String(wcObj.work_center_name || "-") : null
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
        if (qr.is_passed === true || qr.is_passed === 1 || qr.is_passed === "1" || qr.is_passed === "true") {
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
        const start = dt.started_at ? new Date(dt.started_at) : null;
        const end = dt.ended_at ? new Date(dt.ended_at) : new Date();
        if (!start) continue;

        let durationHrs = 0;
        if (end.getTime() > start.getTime()) {
            durationHrs = Number(((end.getTime() - start.getTime()) / (1000 * 3600)).toFixed(1));
        }

        totalDowntimeHrs += durationHrs;

        const assetObj = typeof dt.asset_id === "object" && dt.asset_id ? dt.asset_id : null;
        const assetName = assetObj
            ? String(assetObj.item_id?.name || assetObj.serial || `Asset #${assetObj.id}`)
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

    const completedJobOrdersCount = jobOrders.filter(
        (j) => j.status === "Closed" || j.status === "Completed"
    ).length;
    const completionRatePct =
        jobOrders.length > 0
            ? Number(((completedJobOrdersCount / jobOrders.length) * 100).toFixed(1))
            : null;

    // OEE Calculation (Availability x Performance x Quality)
    // Approximate scheduled hours based on job orders or standard shifts
    const scheduledHours = Math.max(8, jobOrders.length * 8);
    const operatingHours = Math.max(0, scheduledHours - totalDowntimeHrs);
    const availabilityPct = Number(
        Math.min(100, Math.max(0, (operatingHours / scheduledHours) * 100)).toFixed(1)
    );

    const performancePct =
        totalTarget > 0
            ? Number(Math.min(100, Math.max(0, (totalActualProduced / totalTarget) * 100)).toFixed(1))
            : avgYieldRatePct !== null
            ? Math.min(100, avgYieldRatePct)
            : 85.0;

    const qualityPct =
        qaPassRatePct !== null
            ? qaPassRatePct
            : avgScrapRatePct !== null
            ? Number(Math.max(0, 100 - avgScrapRatePct).toFixed(1))
            : 95.0;

    const oeePct = Number(
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
            const wcName = yr.work_center_id?.work_center_name || "Unassigned Work Center";
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
            capPerHour: number;
        }
    >();
    for (const wc of allWorkCenters) {
        const id = Number(wc.work_center_id);
        wcMap.set(id, {
            id,
            name: String(wc.work_center_name || `Work Center #${id}`),
            actualQty: 0,
            scrapQty: 0,
            joCount: 0,
            capPerHour: safeNumber(wc.capacity_per_hour, 100)
        });
    }

    for (const jo of jobOrders) {
        if (!jo.workCenterName) continue;
        const matching = Array.from(wcMap.values()).find((w) => w.name === jo.workCenterName);
        if (matching) {
            matching.actualQty += jo.actualQtyProduced || jo.completedQty || 0;
            matching.joCount += 1;
            const yInfo = joYieldMap.get(jo.jobOrderId);
            if (yInfo) matching.scrapQty += yInfo.scrapQty;
        }
    }

    const workCenterThroughput: PPRWorkCenterRow[] = Array.from(wcMap.values())
        .filter((w) => w.actualQty > 0 || w.joCount > 0)
        .map((w) => {
            const estimatedCap = w.capPerHour * 8 * Math.max(1, w.joCount);
            const util =
                estimatedCap > 0
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

    // Route Heatmap
    const routeMap = new Map<
        string,
        {
            routeName: string;
            operationName: string;
            scrapQty: number;
            yieldQty: number;
            joCount: number;
        }
    >();
    for (const yr of yieldRows) {
        const opName = yr.jo_route_id?.operation_id?.operation_name || "Standard Step";
        const seq = yr.jo_route_id?.sequence_order ?? 1;
        const key = `Step ${seq}: ${opName}`;
        const cur = routeMap.get(key) || {
            routeName: `Sequence ${seq}`,
            operationName: opName,
            scrapQty: 0,
            yieldQty: 0,
            joCount: 0
        };
        cur.scrapQty += safeNumber(yr.scrap_quantity);
        cur.yieldQty += safeNumber(yr.yield_quantity);
        cur.joCount += 1;
        routeMap.set(key, cur);
    }

    const routeHeatmap: PPRRouteHeatmapCell[] = Array.from(routeMap.entries()).map(([k, v], idx) => {
        const total = v.yieldQty + v.scrapQty;
        const scrapRate = total > 0 ? Number(((v.scrapQty / total) * 100).toFixed(1)) : 0;
        return {
            routeId: idx + 1,
            routeName: v.routeName,
            operationName: v.operationName,
            scrapRatePct: scrapRate,
            yieldQty: Number(v.yieldQty.toFixed(1)),
            jobOrderCount: v.joCount
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
            isCrit: Boolean(p.is_critical),
            total: 0,
            passed: 0,
            failed: 0
        });
    }

    for (const qr of qaRecords) {
        const pObj = typeof qr.parameter_id === "object" && qr.parameter_id ? qr.parameter_id : null;
        const pid = pObj ? Number(pObj.parameter_id) : Number(qr.parameter_id);
        if (!pid) continue;

        const cur = paramStatsMap.get(pid) || {
            id: pid,
            name: pObj?.test_name || `Param #${pid}`,
            isCrit: Boolean(pObj?.is_critical),
            total: 0,
            passed: 0,
            failed: 0
        };

        cur.total += 1;
        if (qr.is_passed === true || qr.is_passed === 1 || qr.is_passed === "1" || qr.is_passed === "true") {
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

    // Defect Pareto from final QA releases
    const defectMap = new Map<string, number>();
    for (const f of finalQaRows) {
        const disp = String(f.overall_disposition || "Quarantined");
        const qty = safeNumber(f.defect_quantity);
        if (qty > 0) {
            defectMap.set(disp, (defectMap.get(disp) || 0) + qty);
        }
        if (f.packaging_seal_passed === 0 || f.packaging_seal_passed === false) {
            defectMap.set("Seal Compromise", (defectMap.get("Seal Compromise") || 0) + 1);
        }
        if (f.label_compliance_passed === 0 || f.label_compliance_passed === false) {
            defectMap.set("Label Non-Compliance", (defectMap.get("Label Non-Compliance") || 0) + 1);
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

    // Disposition breakdown
    const dispMap = new Map<string, { count: number; qty: number }>();
    let totalDispCount = 0;
    for (const f of finalQaRows) {
        const disp = String(f.overall_disposition || "Quarantined");
        const qty = safeNumber(f.inspected_quantity);
        const cur = dispMap.get(disp) || { count: 0, qty: 0 };
        cur.count += 1;
        cur.qty += qty;
        dispMap.set(disp, cur);
        totalDispCount += 1;
    }

    const dispositionBreakdown: PPRDispositionRow[] = Array.from(dispMap.entries()).map(([disp, v]) => ({
        disposition: disp,
        count: v.count,
        qty: Number(v.qty.toFixed(1)),
        percentage: totalDispCount > 0 ? Number(((v.count / totalDispCount) * 100).toFixed(1)) : 0
    }));

    // Metadata
    const productLabel =
        filters.productId && filters.productId !== "all"
            ? jobOrders.find((j) => String(j.productId) === filters.productId)?.productName || "Specific SKU"
            : "All Products";

    const workCenterLabel =
        filters.workCenterId && filters.workCenterId !== "all"
            ? allWorkCenters.find((w) => String(w.work_center_id) === filters.workCenterId)?.work_center_name || "Specific Station"
            : "All Work Centers";

    const statusLabel = filters.status && filters.status !== "all" ? filters.status : "All Statuses";

    return {
        meta: {
            dateLabel: `${filters.dateFrom || "Start"} to ${filters.dateTo || "End"}`,
            productLabel,
            workCenterLabel,
            statusLabel,
            freshnessCutoff: new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
            totalRecordsEvaluated: jobOrders.length,
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
        dispositionBreakdown,
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

    const [joRes, yieldRes, matRes, qaRes, timelineRes] = await Promise.all([
        fetch(
            `${directusBase}/items/manufacturing_job_orders/${jobOrderId}?fields=job_order_id,job_order_no,product_id.product_name,status,target_quantity,actual_quantity_produced,completed_quantity`,
            { headers, signal, cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : { data: null })),

        fetch(
            `${directusBase}/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_eq]=${jobOrderId}&fields=ledger_id,shift_name,yield_quantity,scrap_quantity,rejected_quantity,qa_status,logged_at,lot_number,work_center_id.work_center_name&sort=-logged_at`,
            { headers, signal, cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : { data: [] })),

        fetch(
            `${directusBase}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_material_id,product_id.product_name,uom_id.unit_name,allocated_quantity,actual_consumed_quantity,scrap_quantity`,
            { headers, signal, cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : { data: [] })),

        fetch(
            `${directusBase}/items/manufacturing_job_order_qa_records?filter[job_order_id][_eq]=${jobOrderId}&fields=qa_record_id,parameter_id.test_name,parameter_id.test_type,parameter_id.is_critical,value_text,value_numeric,value_boolean,is_passed,inspected_at,remarks`,
            { headers, signal, cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : { data: [] })),

        fetch(
            `${directusBase}/items/manufacturing_job_order_status_history?filter[job_order_id][_eq]=${jobOrderId}&fields=history_id,old_status,new_status,changed_at,changed_by.user_fname,changed_by.user_lname,remarks&sort=changed_at`,
            { headers, signal, cache: "no-store" }
        ).then((r) => (r.ok ? r.json() : { data: [] }))
    ]);

    const jo = joRes.data || {};
    const yieldRows: DirectusRecord[] = Array.isArray(yieldRes.data) ? yieldRes.data : [];
    const matRows: DirectusRecord[] = Array.isArray(matRes.data) ? matRes.data : [];
    const qaRows: DirectusRecord[] = Array.isArray(qaRes.data) ? qaRes.data : [];
    const timelineRows: DirectusRecord[] = Array.isArray(timelineRes.data) ? timelineRes.data : [];

    return {
        jobOrderId,
        jobOrderNo: String(jo.job_order_no || `JO-${jobOrderId}`),
        productName: String(jo.product_id?.product_name || "Finished Good"),
        status: String(jo.status || "Draft"),
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
            loggedAt: String(yr.logged_at || "-"),
            workCenterName: yr.work_center_id?.work_center_name ? String(yr.work_center_id.work_center_name) : null,
            lotNumber: yr.lot_number ? String(yr.lot_number) : null
        })),
        bomVariance: matRows.map((mr) => {
            const theo = safeNumberOrNull(mr.allocated_quantity);
            const act = safeNumber(mr.actual_consumed_quantity);
            const varQty = theo !== null ? Number((act - theo).toFixed(4)) : null;
            const varPct = theo !== null && theo > 0 ? Number(((varQty! / theo) * 100).toFixed(1)) : null;

            return {
                materialName: String(mr.product_id?.product_name || "Material"),
                theoreticalQty: theo,
                actualConsumedQty: act,
                varianceQty: varQty,
                variancePct: varPct,
                uomLabel: String(mr.uom_id?.unit_name || "units")
            };
        }),
        qaRecords: qaRows.map((qr) => {
            const p = qr.parameter_id || {};
            let valueLabel = "-";
            if (qr.value_numeric !== null && qr.value_numeric !== undefined) {
                valueLabel = String(qr.value_numeric);
            } else if (qr.value_text) {
                valueLabel = String(qr.value_text);
            } else if (qr.value_boolean !== null && qr.value_boolean !== undefined) {
                valueLabel = qr.value_boolean ? "Passed" : "Failed";
            }

            return {
                qaRecordId: Number(qr.qa_record_id),
                parameterName: String(p.test_name || "Parameter"),
                testType: String(p.test_type || "Numeric"),
                valueLabel,
                isPassed: qr.is_passed === true || qr.is_passed === 1 || qr.is_passed === "1" || qr.is_passed === "true",
                inspectedAt: String(qr.inspected_at || "-"),
                isCritical: Boolean(p.is_critical),
                remarks: qr.remarks ? String(qr.remarks) : null
            };
        }),
        statusTimeline: timelineRows.map((tr) => {
            const u = tr.changed_by || {};
            const name = [u.user_fname, u.user_lname].filter(Boolean).join(" ");
            return {
                historyId: Number(tr.history_id),
                oldStatus: tr.old_status ? String(tr.old_status) : null,
                newStatus: String(tr.new_status),
                changedAt: String(tr.changed_at || "-"),
                changedByLabel: name || null,
                remarks: tr.remarks ? String(tr.remarks) : null
            };
        })
    };
}
