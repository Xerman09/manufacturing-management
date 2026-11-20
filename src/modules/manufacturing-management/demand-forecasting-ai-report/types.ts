export type ForecastCadence = "weekly" | "monthly";

export type HistoricalPeriodPreset =
    | "last8Weeks"
    | "last12Weeks"
    | "last6Months"
    | "last12Months"
    | "thisYear"
    | "custom";

export type ForecastHorizonOption =
    | "4w"
    | "8w"
    | "12w"
    | "3m"
    | "6m"
    | "12m";

export type ConfidenceLevel = 80 | 90 | 95;

export type InventoryPolicyTag = "FEFO" | "FIFO" | "UNKNOWN";

export type DataSufficiency = "SUFFICIENT" | "LIMITED" | "INSUFFICIENT";

export type UncertaintySource = "series" | "pooled" | "none";

export type TrendDirection = "Rising" | "Stable" | "Cooling" | "Volatile" | "Insufficient Data";

export type TabKey =
    | "forecast"
    | "matrix"
    | "accuracy"
    | "planning";

export interface DemandForecastFilters {
    cadence: ForecastCadence;
    period: HistoricalPeriodPreset;
    dateFrom: string;
    dateTo: string;
    branchId: string; // "all" or numeric branch id
    productId: string; // "all" or numeric product id
    regionKey: string; // "all" or location key
    forecastHorizon: ForecastHorizonOption;
    includeUnmappedRegions: boolean;
}

export interface ScenarioAssumptions {
    demandAdjustmentPct: number; // -50 to +100 (supports decimals)
    confidenceLevel: ConfidenceLevel; // 80 | 90 | 95
    safetyStockDays: number; // 0 to 90
    leadTimeBufferDays: number; // 0 to 60
    plannerNote: string;
}

export interface FilterBranchOption {
    id: number;
    code: string;
    name: string;
}

export interface FilterProductOption {
    id: number;
    code: string;
    name: string;
    categoryName: string;
    unitLabel: string;
    inventoryPolicy: InventoryPolicyTag;
}

export interface FilterRegionOption {
    key: string;
    label: string;
    source: "cluster" | "province" | "unmapped";
    customerCount: number;
}

export interface FilterCatalogPayload {
    branches: FilterBranchOption[];
    products: FilterProductOption[];
    regions: FilterRegionOption[];
}

export interface AiTierInfo {
    assigned: boolean;
    tierLevel: number;
    tierName: string;
    tierSlug: "basic" | "pro" | "executive" | "unassigned";
    description: string;
}

export interface SourceHealthNotice {
    id: string;
    severity: "warning" | "error";
    message: string;
}

export interface EvidenceRecord {
    id: string;
    type: "sales_order" | "job_order" | "inventory_lot" | "bom_labor";
    reference: string;
    title: string;
    subtitle: string;
    date: string;
    quantityLabel: string;
    status: string;
    meta?: string;
}

export interface TimeSeriesBucketPoint {
    bucketKey: string; // e.g., "2026-W42" or "2026-10"
    label: string; // e.g., "W42 · Oct 12" or "Oct 2026"
    isForecast: boolean;
    actualUnits: number | null;
    backtestForecastUnits: number | null;
    forecastUnits: number | null;
    piLower80: number | null;
    piUpper80: number | null;
    piLower90: number | null;
    piUpper90: number | null;
    piLower95: number | null;
    piUpper95: number | null;
    absErrorUnits: number | null;
    wapePct: number | null;
    biasPct: number | null;
    orderCount: number;
}

export interface ProductRegionMatrixRow {
    rowKey: string;
    productId: number;
    productCode: string;
    productName: string;
    categoryName: string;
    unitLabel: string;
    inventoryPolicy: InventoryPolicyTag;
    dataSufficiency: DataSufficiency;
    uncertaintySource: UncertaintySource;
    observationCount: number;
    regionKey: string;
    regionLabel: string;
    regionSource: "cluster" | "province" | "unmapped";
    historicalActualUnits: number;
    evaluatedActualUnits: number;
    backtestForecastUnits: number;
    forecastUnits: number | null;
    piLower80: number | null;
    piUpper80: number | null;
    piLower90: number | null;
    piUpper90: number | null;
    piLower95: number | null;
    piUpper95: number | null;
    absErrorUnits: number;
    wapePct: number | null;
    biasPct: number | null;
    trendPct: number | null;
    trendDirection: TrendDirection;
    orderCount: number;
    evidenceIds: string[];
    totalEvidenceCount: number;
}

export interface RegionComparisonItem {
    regionKey: string;
    regionLabel: string;
    actualUnits: number;
    forecastUnits: number | null;
    wapePct: number | null;
    biasPct: number | null;
    sharePct: number;
}

export interface ProductComparisonItem {
    productId: number;
    productCode: string;
    productName: string;
    unitLabel: string;
    dataSufficiency: DataSufficiency;
    actualUnits: number;
    forecastUnits: number | null;
    wapePct: number | null;
    biasPct: number | null;
    trendPct: number | null;
    trendDirection: TrendDirection;
}

export interface LaborPositionEstimate {
    positionName: string;
    manpowerCount: number;
    hoursPerBatch: number;
    hourlyRate: number;
}

export interface PlanningQuantityRow {
    productId: number;
    productCode: string;
    productName: string;
    categoryName: string;
    unitLabel: string;
    inventoryPolicy: InventoryPolicyTag;
    dataSufficiency: DataSufficiency;
    uncertaintySource: UncertaintySource;
    observationCount: number;
    manufacturingLeadDays: number;
    maintainingQty: number;
    shelfLifeDays: number | null;
    baseForecastUnits: number | null;
    dailyDemandRate: number;
    demandStdDevDaily: number;
    liveOnhandUnits: number | null; // null if live inventory unavailable -> UI shows "-"
    expiringSoonUnits: number; // Base-unit quantity expiring within 30 days (FEFO risk)
    expiringSoonLotCount: number; // Count of active lots expiring within 30 days or flagged
    activeLotCount: number;
    openJobOrderUnits: number;
    openJobOrderCount: number;
    bomBaseQty: number | null;
    bomYieldPct: number | null;
    laborHoursPerBatch: number | null;
    laborPositions: LaborPositionEstimate[];
    evidenceIds: string[];
    totalEvidenceCount: number;
}

export interface AdjustedPlanningRow extends PlanningQuantityRow {
    scenarioForecastUnits: number | null;
    safetyStockUnits: number;
    leadTimeDemandUnits: number;
    targetInventoryUnits: number;
    effectiveUsableOnhandUnits: number | null; // Live on-hand net of unburnable near-expiry FEFO stock
    atRiskExpiringUnits: number;
    effectiveSupplyUnits: number | null; // effectiveUsableOnhandUnits + openJobOrderUnits
    netSupplyGapUnits: number | null; // targetInventoryUnits - effectiveSupplyUnits
    suggestedProductionUnits: number | null;
    recommendedBatches: number | null;
    suggestedLaborHours: number | null;
    suggestedShifts: number | null;
    laborAuditStatus?: "Verified" | "Missing Routing" | "Standard Time Outlier";
    unitStandardLaborHours?: number | null;
    rawLaborHours?: number | null;
    planningRisk: "Stockout Risk" | "Balanced" | "Excess Buffer" | "Data Pending";
}

export interface KpiSummaryMetrics {
    forecastUnits: number | null;
    historicalActualUnits: number;
    evaluatedActualUnits: number; // Exact denominator used for WAPE & Bias
    backtestForecastUnits: number;
    sumAbsoluteErrorUnits: number;
    piLower80: number | null;
    piUpper80: number | null;
    piLower90: number | null;
    piUpper90: number | null;
    piLower95: number | null;
    piUpper95: number | null;
    wapePct: number | null;
    biasPct: number | null;
    trendPct: number | null;
    trendDirection: TrendDirection;
    dataSufficiency?: DataSufficiency;
    uncertaintySource?: UncertaintySource;
    modelName: string;
    horizonPeriods: number;
    historicalPeriodsWithData: number;
    evaluatedBacktestPeriods: number;
    activeUnits: string[]; // Distinct UOM labels included in aggregate (length > 1 => mixed UOMs)
    isMixedUnits: boolean;
    totalEvidenceCount: number;
}

export interface DemandForecastReportPayload {
    meta: {
        cadence: ForecastCadence;
        periodLabel: string;
        dateFrom: string;
        dateTo: string;
        branchLabel: string;
        productLabel: string;
        regionLabel: string;
        forecastHorizonLabel: string;
        actualDemandSourceLabel: string;
        generatedAt: string;
        freshnessCutoff: string;
        aiTier: AiTierInfo;
        notices: SourceHealthNotice[];
    };
    kpis: KpiSummaryMetrics;
    timeSeries: TimeSeriesBucketPoint[];
    matrixRows: ProductRegionMatrixRow[];
    regionComparison: RegionComparisonItem[];
    productComparison: ProductComparisonItem[];
    planningRows: PlanningQuantityRow[];
    evidenceRegistry: Record<string, EvidenceRecord>;
}

export interface AICommentaryItem {
    id: string;
    category: "demand" | "accuracy" | "inventory" | "production" | "labor" | "regional";
    severity: "info" | "warning" | "critical";
    title: string;
    analysis: string;
    recommendedAction: string;
    owner: string;
    evidenceIds: string[];
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    modelUsed?: string;
}

export interface DemandAICommentaryPayload {
    executiveSummary: string;
    keyHighlights: string[];
    accuracyDiagnosis: string;
    scenarioRiskAssessment: string;
    commentaryItems: AICommentaryItem[];
    planningPriorities: string[];
    meta: {
        aiTier: AiTierInfo;
        governance: {
            isAdvisoryOnly: boolean;
            requiresHumanReview: boolean;
            disclaimer: string;
            modelUsed: string;
            isFallback: boolean;
            generatedAt: string;
        };
        dataFreshnessCutoff: string;
    };
}
