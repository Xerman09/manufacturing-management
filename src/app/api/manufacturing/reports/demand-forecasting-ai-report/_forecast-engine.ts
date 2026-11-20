import type {
    DataSufficiency,
    EvidenceRecord,
    ForecastCadence,
    ForecastHorizonOption,
    InventoryPolicyTag,
    KpiSummaryMetrics,
    LaborPositionEstimate,
    PlanningQuantityRow,
    ProductComparisonItem,
    ProductRegionMatrixRow,
    RegionComparisonItem,
    TimeSeriesBucketPoint,
    TrendDirection,
    UncertaintySource
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/types";

export interface NormalizedDemandLine {
    orderId: number;
    orderNo: string;
    orderDate: string; // YYYY-MM-DD
    orderStatus: string;
    branchId: number;
    customerCode: string;
    customerName: string;
    regionKey: string;
    regionLabel: string;
    regionSource: "cluster" | "province" | "unmapped";
    productId: number;
    productCode: string;
    productName: string;
    categoryName: string;
    unitLabel: string; // Base unit label (e.g., PCS)
    inventoryPolicy: InventoryPolicyTag;
    orderedQuantity: number; // Normalized to base units (rawOrderedQuantity * uomMultiplier)
    servedQuantity: number; // Normalized to base units
    rawOrderedQuantity: number;
    rawUnitLabel: string;
    uomMultiplier: number;
    manufacturingLeadDays: number;
    maintainingQty: number;
    shelfLifeDays: number | null;
}

export interface ProductSupplyContext {
    productId: number;
    liveOnhandUnits: number | null;
    expiringSoonUnits: number; // Base units expiring within 30 days
    expiringSoonLotCount: number; // Count of active lots expiring within 30 days or flagged
    activeLotCount: number;
    openJobOrderUnits: number;
    openJobOrderCount: number;
    bomBaseQty: number | null;
    bomYieldPct: number | null;
    laborHoursPerBatch: number | null;
    laborPositions: LaborPositionEstimate[];
    supplyEvidenceIds: string[];
    totalSupplyEvidenceCount: number;
}

function normStr(val: unknown): string {
    return String(val ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

/**
 * Resolves customer geography directly from customer province and city.
 * Brgy is excluded per planning requirements.
 */
export function resolveCustomerRegion(
    province: unknown,
    city: unknown
): { key: string; label: string; source: "cluster" | "province" | "unmapped" } {
    const rawP = String(province ?? "").trim();
    const rawC = String(city ?? "").trim();

    if (rawP && rawC) {
        return {
            key: `geo:${normStr(rawP)}:${normStr(rawC)}`,
            label: `${rawP}, ${rawC}`,
            source: "province"
        };
    }
    if (rawP) {
        return {
            key: `geo:${normStr(rawP)}`,
            label: rawP,
            source: "province"
        };
    }
    if (rawC) {
        return {
            key: `geo:city:${normStr(rawC)}`,
            label: rawC,
            source: "province"
        };
    }

    return {
        key: "unmapped",
        label: "Unmapped Region",
        source: "unmapped"
    };
}

/**
 * Derives FEFO vs FIFO strictly from real product shelf-life:
 * product_shelf_life > 0 -> FEFO
 * product_shelf_life === 0 -> FIFO (confirmed non-perishable)
 * NULL / undefined / invalid -> UNKNOWN
 * Zero keyword guessing from product or category names.
 */
export function classifyInventoryPolicy(
    shelfLifeOrParams?:
        | number
        | null
        | { shelfLifeDays?: number | null; [key: string]: unknown }
): InventoryPolicyTag {
    const rawVal =
        typeof shelfLifeOrParams === "object" && shelfLifeOrParams !== null
            ? shelfLifeOrParams.shelfLifeDays
            : shelfLifeOrParams;

    if (rawVal === undefined || rawVal === null) return "UNKNOWN";
    const days = Number(rawVal);
    if (Number.isNaN(days)) return "UNKNOWN";
    if (days > 0) return "FEFO";
    if (days === 0) return "FIFO";
    return "UNKNOWN";
}

export function parseHorizonSteps(
    horizon: ForecastHorizonOption,
    cadence: ForecastCadence
): { steps: number; label: string } {
    if (cadence === "weekly") {
        switch (horizon) {
            case "4w":
                return { steps: 4, label: "Next 4 Weeks" };
            case "12w":
                return { steps: 12, label: "Next 12 Weeks" };
            case "3m":
                return { steps: 12, label: "Next 12 Weeks (~3M)" };
            case "6m":
                return { steps: 24, label: "Next 24 Weeks (~6M)" };
            case "12m":
                return { steps: 26, label: "Next 26 Weeks (~6M Cap)" };
            case "8w":
            default:
                return { steps: 8, label: "Next 8 Weeks" };
        }
    }

    switch (horizon) {
        case "4w":
            return { steps: 1, label: "Next 1 Month" };
        case "8w":
            return { steps: 2, label: "Next 2 Months" };
        case "12w":
        case "3m":
            return { steps: 3, label: "Next 3 Months" };
        case "12m":
            return { steps: 12, label: "Next 12 Months" };
        case "6m":
        default:
            return { steps: 6, label: "Next 6 Months" };
    }
}

interface BucketMeta {
    key: string;
    label: string;
    startDate: string; // YYYY-MM-DD
}

function getMondayUtc(date: Date): Date {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d;
}

function getIsoWeekInfo(date: Date): { year: number; week: number; monday: Date } {
    const monday = getMondayUtc(date);
    const thursday = new Date(monday.getTime());
    thursday.setUTCDate(thursday.getUTCDate() + 3);
    const isoYear = thursday.getUTCFullYear();
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const week1Monday = getMondayUtc(jan4);
    const week = Math.floor((monday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
    return { year: isoYear, week, monday };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dateToBucketMeta(dateStr: string, cadence: ForecastCadence): BucketMeta {
    const parsed = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
        return { key: dateStr.slice(0, 7), label: dateStr.slice(0, 7), startDate: dateStr.slice(0, 10) };
    }

    if (cadence === "weekly") {
        const { year, week, monday } = getIsoWeekInfo(parsed);
        const weekPad = String(week).padStart(2, "0");
        const monMonth = MONTH_SHORT[monday.getUTCMonth()];
        const monDay = monday.getUTCDate();
        return {
            key: `${year}-W${weekPad}`,
            label: `W${weekPad} · ${monMonth} ${monDay}`,
            startDate: monday.toISOString().slice(0, 10)
        };
    }

    const y = parsed.getUTCFullYear();
    const m = parsed.getUTCMonth();
    const mPad = String(m + 1).padStart(2, "0");
    return {
        key: `${y}-${mPad}`,
        label: `${MONTH_SHORT[m]} ${y}`,
        startDate: `${y}-${mPad}-01`
    };
}

export function buildContiguousBuckets(
    dateFrom: string,
    dateTo: string,
    cadence: ForecastCadence,
    horizonSteps: number
): { historical: BucketMeta[]; future: BucketMeta[] } {
    const start = new Date(`${dateFrom.slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(`${dateTo.slice(0, 10)}T00:00:00.000Z`);
    const historical: BucketMeta[] = [];
    const seen = new Set<string>();

    if (cadence === "weekly") {
        const cursor = getMondayUtc(start);
        const endMonday = getMondayUtc(end);
        let guard = 0;
        while (cursor.getTime() <= endMonday.getTime() && guard < 120) {
            const meta = dateToBucketMeta(cursor.toISOString().slice(0, 10), "weekly");
            if (!seen.has(meta.key)) {
                seen.add(meta.key);
                historical.push(meta);
            }
            cursor.setUTCDate(cursor.getUTCDate() + 7);
            guard++;
        }

        const future: BucketMeta[] = [];
        const fCursor = new Date(endMonday.getTime());
        for (let i = 1; i <= horizonSteps; i++) {
            fCursor.setUTCDate(fCursor.getUTCDate() + 7);
            future.push(dateToBucketMeta(fCursor.toISOString().slice(0, 10), "weekly"));
        }
        return { historical, future };
    }

    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    let guard = 0;
    while (cursor.getTime() <= endMonth.getTime() && guard < 60) {
        const meta = dateToBucketMeta(cursor.toISOString().slice(0, 10), "monthly");
        if (!seen.has(meta.key)) {
            seen.add(meta.key);
            historical.push(meta);
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        guard++;
    }

    const future: BucketMeta[] = [];
    const fCursor = new Date(endMonth.getTime());
    for (let i = 1; i <= horizonSteps; i++) {
        fCursor.setUTCMonth(fCursor.getUTCMonth() + 1);
        future.push(dateToBucketMeta(fCursor.toISOString().slice(0, 10), "monthly"));
    }
    return { historical, future };
}

interface HoltFit {
    alpha: number;
    beta: number;
    phi: number;
    level: number;
    trend: number;
    oneStepNext: number;
}

const ALPHA_GRID = [0.25, 0.4, 0.55];
const BETA_GRID = [0.05, 0.15, 0.25];
const PHI_GRID = [0.8, 0.9];

function fitHoltOnPrefix(prefix: number[]): HoltFit {
    const m = prefix.length;
    if (m === 0) {
        return { alpha: 0.35, beta: 0.1, phi: 0.85, level: 0, trend: 0, oneStepNext: 0 };
    }
    if (m === 1) {
        return {
            alpha: 0.35,
            beta: 0.1,
            phi: 0.85,
            level: prefix[0],
            trend: 0,
            oneStepNext: Math.max(0, prefix[0])
        };
    }

    const evaluate = (alpha: number, beta: number, phi: number) => {
        let level = prefix[0];
        let trend = (prefix[1] - prefix[0]) * 0.5;
        let absErrSum = 0;

        for (let t = 1; t < m; t++) {
            const pred = Math.max(0, level + phi * trend);
            absErrSum += Math.abs(prefix[t] - pred);
            const prevLevel = level;
            level = alpha * prefix[t] + (1 - alpha) * (level + phi * trend);
            trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
        }
        return {
            alpha,
            beta,
            phi,
            level,
            trend,
            oneStepNext: Math.max(0, level + phi * trend),
            absErrSum
        };
    };

    if (m < 3) {
        const base = evaluate(0.35, 0.1, 0.85);
        return {
            alpha: base.alpha,
            beta: base.beta,
            phi: base.phi,
            level: base.level,
            trend: base.trend,
            oneStepNext: base.oneStepNext
        };
    }

    let best = evaluate(0.35, 0.1, 0.85);
    for (const a of ALPHA_GRID) {
        for (const b of BETA_GRID) {
            for (const p of PHI_GRID) {
                const candidate = evaluate(a, b, p);
                if (candidate.absErrSum < best.absErrSum) {
                    best = candidate;
                }
            }
        }
    }

    return {
        alpha: best.alpha,
        beta: best.beta,
        phi: best.phi,
        level: best.level,
        trend: best.trend,
        oneStepNext: best.oneStepNext
    };
}

function computeTrendStats(series: number[]): {
    trendPct: number | null;
    trendDirection: TrendDirection;
} {
    const firstActiveIdx = series.findIndex((v) => v > 0);
    if (firstActiveIdx < 0) {
        return { trendPct: null, trendDirection: "Insufficient Data" };
    }
    const active = series.slice(firstActiveIdx);
    const trendWindow = active.slice(-Math.min(8, active.length));
    if (trendWindow.length < 2) {
        return { trendPct: null, trendDirection: "Insufficient Data" };
    }

    const k = trendWindow.length;
    const meanX = (k - 1) / 2;
    const meanY = trendWindow.reduce((a, b) => a + b, 0) / k;
    if (meanY <= 0) {
        return { trendPct: null, trendDirection: "Insufficient Data" };
    }

    let num = 0;
    let den = 0;
    for (let i = 0; i < k; i++) {
        num += (i - meanX) * (trendWindow[i] - meanY);
        den += Math.pow(i - meanX, 2);
    }
    const slope = den > 0 ? num / den : 0;
    const trendPct = Number(((slope / meanY) * 100).toFixed(1));
    const stdY = Math.sqrt(
        trendWindow.reduce((acc, v) => acc + Math.pow(v - meanY, 2), 0) / k
    );
    const cv = stdY / meanY;

    if (cv > 0.65 && Math.abs(trendPct) < 12) {
        return { trendPct, trendDirection: "Volatile" };
    }
    if (trendPct >= 4) {
        return { trendPct, trendDirection: "Rising" };
    }
    if (trendPct <= -4) {
        return { trendPct, trendDirection: "Cooling" };
    }
    return { trendPct, trendDirection: "Stable" };
}

interface ForecastSeriesResult {
    dataSufficiency: DataSufficiency;
    uncertaintySource: UncertaintySource;
    observationCount: number;
    backtestForecasts: Array<number | null>; // True out-of-sample walk-forward 1-step predictions
    futureForecasts: Array<number | null>; // length = horizonSteps; null entries if INSUFFICIENT
    residualStd: number | null; // Out-of-sample 1-step residual std dev or pooled std dev; null if none
    bucketDemandStd: number; // Empirical active bucket demand std dev
    trendPct: number | null;
    trendDirection: TrendDirection;
    modelName: string;
}

/**
 * True expanding-window walk-forward out-of-sample Holt damped-trend forecaster.
 * Enforces explicit observation gating:
 * - INSUFFICIENT (< 2 active observations): forecast unavailable (null), no fabricated intervals
 * - LIMITED (2-3 active observations): forecast available; empirical interval withheld unless backed by pooled product variance
 * - SUFFICIENT (>= 4 active observations): walk-forward backtest produces empirical out-of-sample residual variance
 */
export function runWalkForwardHoltForecast(
    actuals: number[],
    horizonSteps: number,
    pooledCV?: number | null
): ForecastSeriesResult {
    const n = actuals.length;
    const observationCount = actuals.filter((v) => v > 0).length;
    const firstActiveIdx = actuals.findIndex((v) => v > 0);

    // Gate 1: Insufficient observations (< 2 active demand buckets)
    if (n === 0 || firstActiveIdx < 0 || observationCount < 2) {
        return {
            dataSufficiency: "INSUFFICIENT",
            uncertaintySource: "none",
            observationCount,
            backtestForecasts: actuals.map(() => null),
            futureForecasts: Array.from({ length: horizonSteps }, () => null),
            residualStd: null,
            bucketDemandStd: 0,
            trendPct: null,
            trendDirection: "Insufficient Data",
            modelName: "Insufficient Data (< 2 Historical Observations)"
        };
    }

    const activeSlice = actuals.slice(firstActiveIdx);
    const m = activeSlice.length;
    const backtestForecasts: Array<number | null> = Array.from({ length: n }, () => null);
    const outOfSampleResiduals: number[] = [];

    // Expanding-window out-of-sample walk-forward evaluation: fit strictly on [0..t-1], predict t
    for (let t = 1; t < m; t++) {
        const prefixFit = fitHoltOnPrefix(activeSlice.slice(0, t));
        const pred = Math.round(prefixFit.oneStepNext);
        backtestForecasts[firstActiveIdx + t] = pred;
        outOfSampleResiduals.push(activeSlice[t] - pred);
    }

    // Fit final model on full active history for future projections
    const fullFit = fitHoltOnPrefix(activeSlice);
    const futureForecasts: Array<number | null> = [];
    let phiSum = 0;
    for (let h = 1; h <= horizonSteps; h++) {
        phiSum += Math.pow(fullFit.phi, h);
        futureForecasts.push(Math.max(0, Math.round(fullFit.level + phiSum * fullFit.trend)));
    }

    // Calibrate active bucket demand dispersion
    const meanActive = activeSlice.reduce((a, b) => a + b, 0) / m;
    const bucketDemandStd =
        m >= 2
            ? Math.sqrt(
                  activeSlice.reduce((acc, v) => acc + Math.pow(v - meanActive, 2), 0) / (m - 1)
              )
            : meanActive * 0.25;

    const { trendPct, trendDirection } = computeTrendStats(actuals);

    // Gate 2: Limited observations (2 <= observationCount < 4)
    // Forecast is mathematically possible, but empirical error variance cannot be defended
    if (observationCount < 4) {
        if (pooledCV !== undefined && pooledCV !== null && pooledCV > 0) {
            const pooledResidualStd = Math.max(0, pooledCV * meanActive);
            return {
                dataSufficiency: "LIMITED",
                uncertaintySource: "pooled",
                observationCount,
                backtestForecasts,
                futureForecasts,
                residualStd: pooledResidualStd,
                bucketDemandStd,
                trendPct,
                trendDirection,
                modelName: `Baseline Damped Model (Pooled Uncertainty: ${observationCount} Obs)`
            };
        }

        return {
            dataSufficiency: "LIMITED",
            uncertaintySource: "none",
            observationCount,
            backtestForecasts,
            futureForecasts,
            residualStd: null,
            bucketDemandStd,
            trendPct,
            trendDirection,
            modelName: `Baseline Damped Model (Limited: ${observationCount} Obs, No PI)`
        };
    }

    // Gate 3: Sufficient observations (observationCount >= 4)
    let residualStd: number | null = null;
    if (outOfSampleResiduals.length >= 2) {
        const meanR =
            outOfSampleResiduals.reduce((a, b) => a + b, 0) / outOfSampleResiduals.length;
        const variance =
            outOfSampleResiduals.reduce((acc, r) => acc + Math.pow(r - meanR, 2), 0) /
            (outOfSampleResiduals.length - 1);
        residualStd = Math.sqrt(variance);
    }

    return {
        dataSufficiency: "SUFFICIENT",
        uncertaintySource: residualStd !== null ? "series" : "none",
        observationCount,
        backtestForecasts,
        futureForecasts,
        residualStd,
        bucketDemandStd,
        trendPct,
        trendDirection,
        modelName: "Trend-Adjusted Historical Demand Model (Walk-Forward Out-of-Sample)"
    };
}

export function buildForecastAnalytics(params: {
    lines: NormalizedDemandLine[];
    cadence: ForecastCadence;
    dateFrom: string;
    dateTo: string;
    horizonSteps: number;
    supplyByProduct: Map<number, ProductSupplyContext>;
    evidenceRegistry: Record<string, EvidenceRecord>;
}): {
    kpis: KpiSummaryMetrics;
    timeSeries: TimeSeriesBucketPoint[];
    matrixRows: ProductRegionMatrixRow[];
    regionComparison: RegionComparisonItem[];
    productComparison: ProductComparisonItem[];
    planningRows: PlanningQuantityRow[];
} {
    const { lines, cadence, dateFrom, dateTo, horizonSteps, supplyByProduct, evidenceRegistry } =
        params;
    const { historical, future } = buildContiguousBuckets(dateFrom, dateTo, cadence, horizonSteps);
    const histIdxMap = new Map<string, number>();
    historical.forEach((b, idx) => histIdxMap.set(b.key, idx));

    const avgBucketDays = cadence === "weekly" ? 7 : 30.4375;

    // 1. Aggregate raw historical demand strictly at the leaf grain (Product x Customer Region)
    interface LeafSeriesAcc {
        productId: number;
        productCode: string;
        productName: string;
        categoryName: string;
        unitLabel: string;
        inventoryPolicy: InventoryPolicyTag;
        regionKey: string;
        regionLabel: string;
        regionSource: "cluster" | "province" | "unmapped";
        manufacturingLeadDays: number;
        maintainingQty: number;
        shelfLifeDays: number | null;
        bucketActuals: number[];
        orderIds: Set<number>;
        evidenceIds: Set<string>;
        allEvidenceKeys: Set<string>;
    }

    const leafMap = new Map<string, LeafSeriesAcc>();
    const totalBucketActuals = Array.from({ length: historical.length }, () => 0);
    const totalBucketOrderSets = Array.from({ length: historical.length }, () => new Set<number>());
    const activeUnitSet = new Set<string>();
    const globalEvidenceKeys = new Set<string>();

    for (const line of lines) {
        const bMeta = dateToBucketMeta(line.orderDate, cadence);
        const bIdx = histIdxMap.get(bMeta.key);
        if (bIdx === undefined) continue;

        totalBucketActuals[bIdx] += line.orderedQuantity;
        totalBucketOrderSets[bIdx].add(line.orderId);
        activeUnitSet.add(line.unitLabel);

        const rowKey = `${line.productId}::${line.regionKey}`;
        let acc = leafMap.get(rowKey);
        if (!acc) {
            acc = {
                productId: line.productId,
                productCode: line.productCode,
                productName: line.productName,
                categoryName: line.categoryName,
                unitLabel: line.unitLabel,
                inventoryPolicy: line.inventoryPolicy,
                regionKey: line.regionKey,
                regionLabel: line.regionLabel,
                regionSource: line.regionSource,
                manufacturingLeadDays: line.manufacturingLeadDays,
                maintainingQty: line.maintainingQty,
                shelfLifeDays: line.shelfLifeDays,
                bucketActuals: Array.from({ length: historical.length }, () => 0),
                orderIds: new Set<number>(),
                evidenceIds: new Set<string>(),
                allEvidenceKeys: new Set<string>()
            };
            leafMap.set(rowKey, acc);
        }

        acc.bucketActuals[bIdx] += line.orderedQuantity;
        acc.orderIds.add(line.orderId);

        const evId = `so-${line.orderId}-${line.productId}-${line.rawUnitLabel}-${line.uomMultiplier}`;
        acc.allEvidenceKeys.add(evId);
        globalEvidenceKeys.add(evId);

        if (!evidenceRegistry[evId]) {
            const hasUnitConversion =
                line.uomMultiplier > 1 && line.rawUnitLabel !== line.unitLabel;
            const qtyLabel = hasUnitConversion
                ? `${line.rawOrderedQuantity.toLocaleString()} ${line.rawUnitLabel} → ${line.orderedQuantity.toLocaleString()} ${line.unitLabel}`
                : `${line.orderedQuantity.toLocaleString()} ${line.unitLabel} ordered`;
            const convNote = hasUnitConversion
                ? `1 ${line.rawUnitLabel} = ${line.uomMultiplier.toLocaleString()} ${line.unitLabel} · `
                : "";
            evidenceRegistry[evId] = {
                id: evId,
                type: "sales_order",
                reference: line.orderNo,
                title: `${line.productName} (${line.productCode})`,
                subtitle: `${line.customerName} · ${line.regionLabel}`,
                date: line.orderDate,
                quantityLabel: qtyLabel,
                status: line.orderStatus,
                meta: `${convNote}Served: ${line.servedQuantity.toLocaleString()} ${line.unitLabel}`
            };
        }
        if (acc.evidenceIds.size < 40) {
            acc.evidenceIds.add(evId);
        }
    }

    // 2. Run walk-forward forecast ONCE per leaf (Product x Region) and reconcile bottom-up across all tables, charts & KPIs!
    const matrixRows: ProductRegionMatrixRow[] = [];

    // Pre-pass: Compute product-level aggregate actuals across regions to derive pooled CV for LIMITED series
    const productAggregateBuckets = new Map<number, number[]>();
    for (const line of lines) {
        const bMeta = dateToBucketMeta(line.orderDate, cadence);
        const bIdx = histIdxMap.get(bMeta.key);
        if (bIdx === undefined) continue;
        let pBuckets = productAggregateBuckets.get(line.productId);
        if (!pBuckets) {
            pBuckets = Array.from({ length: historical.length }, () => 0);
            productAggregateBuckets.set(line.productId, pBuckets);
        }
        pBuckets[bIdx] += line.orderedQuantity;
    }

    const productPooledCVMap = new Map<number, number>();
    for (const [pid, pBuckets] of productAggregateBuckets.entries()) {
        const pObs = pBuckets.filter((v) => v > 0).length;
        if (pObs >= 4) {
            const pModel = runWalkForwardHoltForecast(pBuckets, horizonSteps);
            const pFirstAct = pBuckets.findIndex((v) => v > 0);
            if (pFirstAct >= 0 && pModel.residualStd !== null && pModel.residualStd > 0) {
                const activeSlice = pBuckets.slice(pFirstAct);
                const meanAct = activeSlice.reduce((a, b) => a + b, 0) / activeSlice.length;
                if (meanAct > 0) {
                    productPooledCVMap.set(pid, pModel.residualStd / meanAct);
                }
            }
        }
    }

    // Reconciled bottom-up accumulators for aggregate TimeSeries
    const aggBacktestBucketSum = Array.from({ length: historical.length }, () => 0);
    const aggBacktestBucketHasAny = Array.from({ length: historical.length }, () => false);
    const aggBacktestEvalActualBucketSum = Array.from({ length: historical.length }, () => 0);
    const aggBacktestAbsErrBucketSum = Array.from({ length: historical.length }, () => 0);
    const aggFutureBucketForecast = Array.from({ length: horizonSteps }, () => 0);
    // Combine per-step error variances in quadrature across leaf series (unclipped!)
    const aggFutureBucketVar = Array.from({ length: horizonSteps }, () => 0);

    // Horizon cumulative variance accumulator (sum_{h=1..H}(h) * residualStd^2 per leaf)
    const horizonStepWeightSum = (horizonSteps * (horizonSteps + 1)) / 2;
    let totalHorizonVar = 0;
    let hasAnyHorizonUncertainty = false;

    // Rollups per Region & per Product (strictly summed from leaf models -> 100% reconciled!)
    const regionRollup = new Map<
        string,
        {
            regionKey: string;
            regionLabel: string;
            actual: number;
            evalActual: number;
            evalForecast: number;
            evalAbsError: number;
            forecast: number;
            hasAnyForecast: boolean;
        }
    >();

    const productRollup = new Map<
        number,
        {
            productId: number;
            productCode: string;
            productName: string;
            categoryName: string;
            unitLabel: string;
            inventoryPolicy: InventoryPolicyTag;
            manufacturingLeadDays: number;
            maintainingQty: number;
            shelfLifeDays: number | null;
            bucketActuals: number[];
            actual: number;
            evalActual: number;
            evalForecast: number;
            evalAbsError: number;
            forecast: number;
            hasValidForecast: boolean;
            leafResidualVarSum: number;
            evidenceIds: Set<string>;
            allEvidenceKeys: Set<string>;
        }
    >();

    for (const [rowKey, acc] of leafMap.entries()) {
        const pooledCV = productPooledCVMap.get(acc.productId) ?? null;
        const res = runWalkForwardHoltForecast(acc.bucketActuals, horizonSteps, pooledCV);
        const rowActual = Math.round(acc.bucketActuals.reduce((a, b) => a + b, 0));

        let rowEvalActual = 0;
        let rowEvalForecast = 0;
        let rowAbsError = 0;

        acc.bucketActuals.forEach((act, idx) => {
            const bt = res.backtestForecasts[idx];
            if (bt !== null) {
                rowEvalActual += act;
                rowEvalForecast += bt;
                const absErr = Math.abs(act - bt);
                rowAbsError += absErr;

                aggBacktestBucketSum[idx] += bt;
                aggBacktestBucketHasAny[idx] = true;
                aggBacktestEvalActualBucketSum[idx] += act;
                aggBacktestAbsErrBucketSum[idx] += absErr;
            }
        });

        // Reconcile future buckets bottom-up
        let rowFc: number | null = null;
        if (res.dataSufficiency !== "INSUFFICIENT") {
            let fcSum = 0;
            res.futureForecasts.forEach((fc, idx) => {
                const val = fc ?? 0;
                fcSum += val;
                aggFutureBucketForecast[idx] += val;
                if (res.residualStd !== null) {
                    const h = idx + 1;
                    aggFutureBucketVar[idx] += res.residualStd * res.residualStd * h;
                }
            });
            rowFc = fcSum;
        }

        // Compute aggregate horizon prediction interval BEFORE clamping to 0 (prevents inflated lower floor)
        let l80: number | null = null;
        let u80: number | null = null;
        let l90: number | null = null;
        let u90: number | null = null;
        let l95: number | null = null;
        let u95: number | null = null;

        if (rowFc !== null && res.residualStd !== null) {
            const leafHorizonVar = res.residualStd * res.residualStd * horizonStepWeightSum;
            const leafHorizonSigma = Math.sqrt(leafHorizonVar);
            totalHorizonVar += leafHorizonVar;
            hasAnyHorizonUncertainty = true;

            l80 = Math.max(0, Math.round(rowFc - 1.2816 * leafHorizonSigma));
            u80 = Math.round(rowFc + 1.2816 * leafHorizonSigma);
            l90 = Math.max(0, Math.round(rowFc - 1.6449 * leafHorizonSigma));
            u90 = Math.round(rowFc + 1.6449 * leafHorizonSigma);
            l95 = Math.max(0, Math.round(rowFc - 1.96 * leafHorizonSigma));
            u95 = Math.round(rowFc + 1.96 * leafHorizonSigma);
        }

        const rowWape =
            rowEvalActual > 0 ? Number(((rowAbsError / rowEvalActual) * 100).toFixed(1)) : null;
        const rowBias =
            rowEvalActual > 0
                ? Number((((rowEvalForecast - rowEvalActual) / rowEvalActual) * 100).toFixed(1))
                : null;

        matrixRows.push({
            rowKey,
            productId: acc.productId,
            productCode: acc.productCode,
            productName: acc.productName,
            categoryName: acc.categoryName,
            unitLabel: acc.unitLabel,
            inventoryPolicy: acc.inventoryPolicy,
            dataSufficiency: res.dataSufficiency,
            uncertaintySource: res.uncertaintySource,
            observationCount: res.observationCount,
            regionKey: acc.regionKey,
            regionLabel: acc.regionLabel,
            regionSource: acc.regionSource,
            historicalActualUnits: rowActual,
            evaluatedActualUnits: Math.round(rowEvalActual),
            backtestForecastUnits: Math.round(rowEvalForecast),
            forecastUnits: rowFc,
            piLower80: l80,
            piUpper80: u80,
            piLower90: l90,
            piUpper90: u90,
            piLower95: l95,
            piUpper95: u95,
            absErrorUnits: Math.round(rowAbsError),
            wapePct: rowWape,
            biasPct: rowBias,
            trendPct: res.trendPct,
            trendDirection: res.trendDirection,
            orderCount: acc.orderIds.size,
            evidenceIds: Array.from(acc.evidenceIds),
            totalEvidenceCount: acc.allEvidenceKeys.size
        });

        // Region Rollup (exact sum of leaves)
        const reg = regionRollup.get(acc.regionKey) || {
            regionKey: acc.regionKey,
            regionLabel: acc.regionLabel,
            actual: 0,
            evalActual: 0,
            evalForecast: 0,
            evalAbsError: 0,
            forecast: 0,
            hasAnyForecast: false
        };
        reg.actual += rowActual;
        reg.evalActual += rowEvalActual;
        reg.evalForecast += rowEvalForecast;
        reg.evalAbsError += rowAbsError;
        if (rowFc !== null) {
            reg.forecast += rowFc;
            reg.hasAnyForecast = true;
        }
        regionRollup.set(acc.regionKey, reg);

        // Product Rollup (exact sum of leaves)
        let prod = productRollup.get(acc.productId);
        if (!prod) {
            prod = {
                productId: acc.productId,
                productCode: acc.productCode,
                productName: acc.productName,
                categoryName: acc.categoryName,
                unitLabel: acc.unitLabel,
                inventoryPolicy: acc.inventoryPolicy,
                manufacturingLeadDays: acc.manufacturingLeadDays,
                maintainingQty: acc.maintainingQty,
                shelfLifeDays: acc.shelfLifeDays,
                bucketActuals: Array.from({ length: historical.length }, () => 0),
                actual: 0,
                evalActual: 0,
                evalForecast: 0,
                evalAbsError: 0,
                forecast: 0,
                hasValidForecast: false,
                leafResidualVarSum: 0,
                evidenceIds: new Set<string>(),
                allEvidenceKeys: new Set<string>()
            };
            productRollup.set(acc.productId, prod);
        }
        acc.bucketActuals.forEach((v, i) => {
            prod!.bucketActuals[i] += v;
        });
        prod.actual += rowActual;
        prod.evalActual += rowEvalActual;
        prod.evalForecast += rowEvalForecast;
        prod.evalAbsError += rowAbsError;
        if (rowFc !== null) {
            prod.forecast += rowFc;
            prod.hasValidForecast = true;
        }
        if (res.residualStd !== null) {
            prod.leafResidualVarSum += res.residualStd * res.residualStd;
        }
        acc.evidenceIds.forEach((eid) => {
            if (prod!.evidenceIds.size < 40) prod!.evidenceIds.add(eid);
        });
        acc.allEvidenceKeys.forEach((eid) => prod!.allEvidenceKeys.add(eid));
    }

    matrixRows.sort(
        (a, b) =>
            (b.forecastUnits ?? -1) - (a.forecastUnits ?? -1) ||
            b.historicalActualUnits - a.historicalActualUnits
    );

    // 3. Build Reconciled Aggregate TimeSeries & KPI Totals (exact sum of leaf forecasts!)
    const timeSeries: TimeSeriesBucketPoint[] = [];
    let evalActualSum = 0;
    let evalForecastSum = 0;
    let evalAbsErrorSum = 0;
    let evaluatedBacktestPeriods = 0;

    historical.forEach((b, idx) => {
        const actual = Math.round(totalBucketActuals[idx]);
        const hasBt = aggBacktestBucketHasAny[idx];
        const btForecast = hasBt ? Math.round(aggBacktestBucketSum[idx]) : null;
        const bucketEvalActual = Math.round(aggBacktestEvalActualBucketSum[idx]);
        let absError: number | null = null;
        let wapePct: number | null = null;
        let biasPct: number | null = null;

        if (btForecast !== null) {
            // Reconcile bucket-level error consistently using aggregate backtest vs evaluated actual
            absError = Math.abs(bucketEvalActual - btForecast);
            evalActualSum += bucketEvalActual;
            evalForecastSum += btForecast;
            evalAbsErrorSum += absError;
            evaluatedBacktestPeriods++;

            if (bucketEvalActual > 0) {
                wapePct = Number(((absError / bucketEvalActual) * 100).toFixed(1));
                biasPct = Number(
                    (((btForecast - bucketEvalActual) / bucketEvalActual) * 100).toFixed(1)
                );
            }
        }

        timeSeries.push({
            bucketKey: b.key,
            label: b.label,
            isForecast: false,
            actualUnits: actual,
            backtestForecastUnits: btForecast,
            forecastUnits: null,
            piLower80: null,
            piUpper80: null,
            piLower90: null,
            piUpper90: null,
            piLower95: null,
            piUpper95: null,
            absErrorUnits: absError,
            wapePct,
            biasPct,
            orderCount: totalBucketOrderSets[idx].size
        });
    });

    let totalForecastUnits = 0;
    let hasAnyFutureForecast = false;
    future.forEach((b, idx) => {
        const fc = Math.round(aggFutureBucketForecast[idx]);
        if (fc > 0) hasAnyFutureForecast = true;
        const stepSigma = hasAnyHorizonUncertainty ? Math.sqrt(aggFutureBucketVar[idx]) : 0;

        const piLower80 =
            hasAnyHorizonUncertainty && fc > 0
                ? Math.max(0, Math.round(fc - 1.2816 * stepSigma))
                : null;
        const piUpper80 =
            hasAnyHorizonUncertainty && fc > 0 ? Math.round(fc + 1.2816 * stepSigma) : null;
        const piLower90 =
            hasAnyHorizonUncertainty && fc > 0
                ? Math.max(0, Math.round(fc - 1.6449 * stepSigma))
                : null;
        const piUpper90 =
            hasAnyHorizonUncertainty && fc > 0 ? Math.round(fc + 1.6449 * stepSigma) : null;
        const piLower95 =
            hasAnyHorizonUncertainty && fc > 0
                ? Math.max(0, Math.round(fc - 1.96 * stepSigma))
                : null;
        const piUpper95 =
            hasAnyHorizonUncertainty && fc > 0 ? Math.round(fc + 1.96 * stepSigma) : null;

        totalForecastUnits += fc;

        timeSeries.push({
            bucketKey: b.key,
            label: b.label,
            isForecast: true,
            actualUnits: null,
            backtestForecastUnits: null,
            forecastUnits: hasAnyFutureForecast || fc > 0 ? fc : null,
            piLower80,
            piUpper80,
            piLower90,
            piUpper90,
            piLower95,
            piUpper95,
            absErrorUnits: null,
            wapePct: null,
            biasPct: null,
            orderCount: 0
        });
    });

    const historicalActualTotal = Math.round(totalBucketActuals.reduce((a, b) => a + b, 0));
    const historicalPeriodsWithData = totalBucketActuals.filter((v) => v > 0).length;
    const totalHorizonSigma = hasAnyHorizonUncertainty ? Math.sqrt(totalHorizonVar) : 0;
    const hasAnyValidForecast = matrixRows.some((r) => r.forecastUnits !== null);

    // WAPE = sum of absolute forecast errors ÷ sum of evaluated actual demand × 100
    const overallWapePct =
        evalActualSum > 0 ? Number(((evalAbsErrorSum / evalActualSum) * 100).toFixed(1)) : null;
    const overallBiasPct =
        evalActualSum > 0
            ? Number((((evalForecastSum - evalActualSum) / evalActualSum) * 100).toFixed(1))
            : null;

    const { trendPct: aggTrendPct, trendDirection: aggTrendDirection } =
        computeTrendStats(totalBucketActuals);

    const activeUnits = Array.from(activeUnitSet).sort();
    const overallSufficiency: DataSufficiency =
        historicalPeriodsWithData >= 4
            ? "SUFFICIENT"
            : historicalPeriodsWithData >= 2
            ? "LIMITED"
            : "INSUFFICIENT";
    const overallUncertainty: UncertaintySource = hasAnyHorizonUncertainty ? "series" : "none";

    const kpis: KpiSummaryMetrics = {
        forecastUnits: hasAnyValidForecast ? totalForecastUnits : null,
        historicalActualUnits: historicalActualTotal,
        evaluatedActualUnits: Math.round(evalActualSum),
        backtestForecastUnits: Math.round(evalForecastSum),
        sumAbsoluteErrorUnits: Math.round(evalAbsErrorSum),
        piLower80:
            hasAnyValidForecast && hasAnyHorizonUncertainty
                ? Math.max(0, Math.round(totalForecastUnits - 1.2816 * totalHorizonSigma))
                : null,
        piUpper80:
            hasAnyValidForecast && hasAnyHorizonUncertainty
                ? Math.round(totalForecastUnits + 1.2816 * totalHorizonSigma)
                : null,
        piLower90:
            hasAnyValidForecast && hasAnyHorizonUncertainty
                ? Math.max(0, Math.round(totalForecastUnits - 1.6449 * totalHorizonSigma))
                : null,
        piUpper90:
            hasAnyValidForecast && hasAnyHorizonUncertainty
                ? Math.round(totalForecastUnits + 1.6449 * totalHorizonSigma)
                : null,
        piLower95:
            hasAnyValidForecast && hasAnyHorizonUncertainty
                ? Math.max(0, Math.round(totalForecastUnits - 1.96 * totalHorizonSigma))
                : null,
        piUpper95:
            hasAnyValidForecast && hasAnyHorizonUncertainty
                ? Math.round(totalForecastUnits + 1.96 * totalHorizonSigma)
                : null,
        wapePct: overallWapePct,
        biasPct: overallBiasPct,
        trendPct: aggTrendPct,
        trendDirection: aggTrendDirection,
        dataSufficiency: overallSufficiency,
        uncertaintySource: overallUncertainty,
        modelName: "Trend-Adjusted Historical Demand Model (Bottom-Up Reconciled)",
        horizonPeriods: horizonSteps,
        historicalPeriodsWithData,
        evaluatedBacktestPeriods,
        activeUnits,
        isMixedUnits: activeUnits.length > 1,
        totalEvidenceCount: globalEvidenceKeys.size
    };

    // 4. Region Comparison (reconciled exact sum of leaves)
    const totalRegionForecast = Array.from(regionRollup.values()).reduce(
        (s, r) => s + (r.hasAnyForecast ? r.forecast : 0),
        0
    );
    const regionComparison: RegionComparisonItem[] = Array.from(regionRollup.values())
        .map((r) => ({
            regionKey: r.regionKey,
            regionLabel: r.regionLabel,
            actualUnits: r.actual,
            forecastUnits: r.hasAnyForecast ? r.forecast : null,
            wapePct:
                r.evalActual > 0 ? Number(((r.evalAbsError / r.evalActual) * 100).toFixed(1)) : null,
            biasPct:
                r.evalActual > 0
                    ? Number((((r.evalForecast - r.evalActual) / r.evalActual) * 100).toFixed(1))
                    : null,
            sharePct:
                totalRegionForecast > 0 && r.hasAnyForecast
                    ? Number(((r.forecast / totalRegionForecast) * 100).toFixed(1))
                    : 0
        }))
        .sort((a, b) => (b.forecastUnits ?? -1) - (a.forecastUnits ?? -1));

    // 5. Product Comparison & Planning Rows (reconciled exact sum of leaves!)
    const productComparison: ProductComparisonItem[] = [];
    const planningRows: PlanningQuantityRow[] = [];
    const horizonDays = Math.max(1, horizonSteps * avgBucketDays);

    for (const prod of productRollup.values()) {
        const { trendPct: pTrendPct, trendDirection: pTrendDir } = computeTrendStats(
            prod.bucketActuals
        );
        const pWape =
            prod.evalActual > 0
                ? Number(((prod.evalAbsError / prod.evalActual) * 100).toFixed(1))
                : null;
        const pBias =
            prod.evalActual > 0
                ? Number((((prod.evalForecast - prod.evalActual) / prod.evalActual) * 100).toFixed(1))
                : null;

        const prodObs = prod.bucketActuals.filter((v) => v > 0).length;
        const prodSufficiency: DataSufficiency =
            prodObs >= 4 ? "SUFFICIENT" : prodObs >= 2 ? "LIMITED" : "INSUFFICIENT";
        const prodUncertainty: UncertaintySource =
            prodObs >= 4 ? "series" : productPooledCVMap.has(prod.productId) ? "pooled" : "none";

        const baseForecastUnits = prod.hasValidForecast ? prod.forecast : null;

        productComparison.push({
            productId: prod.productId,
            productCode: prod.productCode,
            productName: prod.productName,
            unitLabel: prod.unitLabel,
            dataSufficiency: prodSufficiency,
            actualUnits: prod.actual,
            forecastUnits: baseForecastUnits,
            wapePct: pWape,
            biasPct: pBias,
            trendPct: pTrendPct,
            trendDirection: pTrendDir
        });

        const supply = supplyByProduct.get(prod.productId);
        const dailyDemandRate =
            baseForecastUnits !== null ? baseForecastUnits / horizonDays : 0;

        // Calibrated daily demand standard deviation from actual per-bucket demand dispersion + residual variance
        const firstAct = prod.bucketActuals.findIndex((v) => v > 0);
        const activeBuckets = firstAct >= 0 ? prod.bucketActuals.slice(firstAct) : [];
        let empiricalBucketStd = 0;
        if (activeBuckets.length >= 2) {
            const meanB = activeBuckets.reduce((a, b) => a + b, 0) / activeBuckets.length;
            empiricalBucketStd = Math.sqrt(
                activeBuckets.reduce((acc, v) => acc + Math.pow(v - meanB, 2), 0) /
                    (activeBuckets.length - 1)
            );
        } else if (activeBuckets.length === 1) {
            empiricalBucketStd = activeBuckets[0] * 0.25;
        }
        const combinedBucketStd = Math.max(
            empiricalBucketStd,
            Math.sqrt(prod.leafResidualVarSum)
        );
        // Scale bucket total std dev to daily demand std dev using exact avgBucketDays (7 or 30.4375)
        const demandStdDevDaily = combinedBucketStd / Math.sqrt(avgBucketDays);

        const combinedEvidence = new Set<string>();
        // Add supply evidence (Batch Lots, Job Orders, BOM) first so inventory audit is never starved
        supply?.supplyEvidenceIds.forEach((eid) => {
            if (combinedEvidence.size < 60) combinedEvidence.add(eid);
        });
        // Then add historical sales order evidence
        prod.evidenceIds.forEach((eid) => {
            if (combinedEvidence.size < 100) combinedEvidence.add(eid);
        });

        planningRows.push({
            productId: prod.productId,
            productCode: prod.productCode,
            productName: prod.productName,
            categoryName: prod.categoryName,
            unitLabel: prod.unitLabel,
            inventoryPolicy: prod.inventoryPolicy,
            dataSufficiency: prodSufficiency,
            uncertaintySource: prodUncertainty,
            observationCount: prodObs,
            manufacturingLeadDays: prod.manufacturingLeadDays,
            maintainingQty: prod.maintainingQty,
            shelfLifeDays: prod.shelfLifeDays,
            baseForecastUnits,
            dailyDemandRate: Number(dailyDemandRate.toFixed(2)),
            demandStdDevDaily: Number(demandStdDevDaily.toFixed(2)),
            liveOnhandUnits: supply ? supply.liveOnhandUnits : null,
            expiringSoonUnits: supply ? supply.expiringSoonUnits : 0,
            expiringSoonLotCount: supply ? supply.expiringSoonLotCount : 0,
            activeLotCount: supply ? supply.activeLotCount : 0,
            openJobOrderUnits: supply ? supply.openJobOrderUnits : 0,
            openJobOrderCount: supply ? supply.openJobOrderCount : 0,
            bomBaseQty: supply ? supply.bomBaseQty : null,
            bomYieldPct: supply ? supply.bomYieldPct : null,
            laborHoursPerBatch: supply ? supply.laborHoursPerBatch : null,
            laborPositions: supply ? supply.laborPositions : [],
            evidenceIds: Array.from(combinedEvidence),
            totalEvidenceCount:
                prod.allEvidenceKeys.size + (supply?.totalSupplyEvidenceCount || 0)
        });
    }

    productComparison.sort((a, b) => (b.forecastUnits ?? -1) - (a.forecastUnits ?? -1));
    planningRows.sort((a, b) => (b.baseForecastUnits ?? -1) - (a.baseForecastUnits ?? -1));

    return {
        kpis,
        timeSeries,
        matrixRows,
        regionComparison,
        productComparison,
        planningRows
    };
}
