import type { CanonicalJobOrderStatus } from "../job-order-status";

/** Restricted to the stored Job Order vocabulary — see job-order-status.ts. */
export type PPRStatusFilter = "all" | CanonicalJobOrderStatus;

export interface ProductionPerformanceFilters {
    dateFrom: string;
    dateTo: string;
    productId: string;
    workCenterId: string;
    status: PPRStatusFilter;
}

export interface PPRFilterProductOption {
    id: number;
    code: string;
    name: string;
    categoryName?: string;
}

export interface PPRFilterWorkCenterOption {
    id: number;
    name: string;
}

export interface PPRFilterCatalogPayload {
    products: PPRFilterProductOption[];
    workCenters: PPRFilterWorkCenterOption[];
}

export interface PPRKpiMetrics {
    oeePct: number | null;
    availabilityPct: number | null;
    performancePct: number | null;
    qualityPct: number | null;
    avgYieldRatePct: number | null;
    avgScrapRatePct: number | null;
    avgRejectionRatePct: number | null;
    qaPassRatePct: number | null;
    avgCycleTimeHrs: number | null;
    totalDowntimeHrs: number | null;
    totalJobOrders: number;
    completedJobOrders: number;
    completionRatePct: number | null;
}

export interface PPRTrendPoint {
    periodLabel: string;
    date: string;
    yieldRatePct: number | null;
    scrapRatePct: number | null;
    rejectedQty: number | null;
    jobOrderCount: number;
    targetQty?: number;
    actualQty?: number;
}

export interface PPRLossDriver {
    id: string;
    label: string;
    lossQty: number;
    lossType: "product" | "work_center" | "route" | "defect";
    percentageOfTotal: number | null;
}

export interface PPRWorkCenterRow {
    workCenterId: number;
    workCenterName: string;
    actualQty: number;
    capacityQty: number | null;
    utilizationPct: number | null;
    avgScrapRatePct: number | null;
    jobOrderCount: number;
}

export interface PPRRouteHeatmapCell {
    operationId: number | null;
    sequenceOrder: number | null;
    operationName: string;
    scrapRatePct: number | null;
    yieldQty: number | null;
    ledgerRowCount: number;
}

export interface PPRDowntimeEvent {
    id: number;
    assetName: string;
    durationHrs: number;
    breakdownCategory: string | null;
    rootCause: string | null;
    startedAt: string;
    endedAt: string | null;
    technicianName: string | null;
    correctiveAction: string | null;
}

export interface PPRQaParameterRow {
    parameterId: number;
    parameterName: string;
    passRatePct: number | null;
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    isCritical: boolean;
}

export interface PPRDefectParetoRow {
    defectLabel: string;
    quantity: number;
    cumulativePct: number;
}

export interface PPRJobOrderRow {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    productName: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    targetQty: number;
    actualQtyProduced: number | null;
    completedQty: number | null;
    rejectedQty: number | null;
    yieldRatePct: number | null;
    scrapRatePct: number | null;
    qaPassRatePct: number | null;
    cycleTimeHrs: number | null;
    workCenterId: number | null;
    workCenterName: string | null;
}

export interface PPRYieldLedgerRow {
    ledgerId: number;
    shiftName: string;
    yieldQty: number;
    scrapQty: number;
    rejectedQty: number;
    qaStatus: string;
    loggedAt: string;
    workCenterName: string | null;
    lotNumber: string | null;
}

export interface PPRBomVarianceRow {
    materialName: string;
    theoreticalQty: number | null;
    actualConsumedQty: number;
    varianceQty: number | null;
    variancePct: number | null;
    uomLabel: string;
}

export interface PPRQaRecordRow {
    qaRecordId: number;
    parameterName: string;
    testType: string;
    valueLabel: string;
    isPassed: boolean;
    inspectedAt: string;
    isCritical: boolean;
    remarks: string | null;
}

export interface PPRStatusTimelineRow {
    historyId: number;
    oldStatus: string | null;
    newStatus: string;
    changedAt: string;
    changedByLabel: string | null;
    remarks: string | null;
}

export interface PPRJobOrderDetail {
    jobOrderId: number;
    jobOrderNo: string;
    productName: string;
    status: string;
    targetQty: number;
    actualQtyProduced: number | null;
    completedQty: number | null;
    yieldLedger: PPRYieldLedgerRow[];
    bomVariance: PPRBomVarianceRow[];
    qaRecords: PPRQaRecordRow[];
    statusTimeline: PPRStatusTimelineRow[];
}

export interface PPRBottleneckItem {
    id: string;
    area: string;
    impact: string;
    severity: "critical" | "high" | "medium" | "low";
    evidence: string;
}

export interface PPRCorrectiveActionItem {
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    targetMetric: string;
}

export interface PPRRiskFlagItem {
    id: string;
    flag: string;
    detail: string;
    severity: "high" | "medium" | "low";
}

export interface AiTierInfo {
    assigned: boolean;
    tierLevel: number;
    tierName: string;
    tierSlug: "basic" | "pro" | "executive" | "unassigned";
    description: string;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    modelUsed?: string;
}

export interface ProductionAIAnalysisPayload {
    executiveSummary: string;
    keyObservations: string[];
    bottlenecks: PPRBottleneckItem[];
    correctiveActions: PPRCorrectiveActionItem[];
    riskFlags: PPRRiskFlagItem[];
    meta: {
        modelUsed: string;
        isFallback: boolean;
        generatedAt: string;
        freshnessCutoff: string;
        aiTier?: AiTierInfo;
    };
}

export interface ProductionPerformanceReportPayload {
    meta: {
        dateLabel: string;
        productLabel: string;
        workCenterLabel: string;
        statusLabel: string;
        freshnessCutoff: string;
        totalRecordsEvaluated: number;
        aiTier?: AiTierInfo;
        notices: Array<{ id: string; severity: "warning" | "error"; message: string }>;
    };
    kpis: PPRKpiMetrics;
    trendSeries: PPRTrendPoint[];
    topLossDrivers: PPRLossDriver[];
    workCenterThroughput: PPRWorkCenterRow[];
    routeHeatmap: PPRRouteHeatmapCell[];
    downtimeEvents: PPRDowntimeEvent[];
    qaParameterSummary: PPRQaParameterRow[];
    defectPareto: PPRDefectParetoRow[];
    jobOrders: PPRJobOrderRow[];
}

export type PPRTabKey = "overview" | "bottlenecks" | "quality" | "job-orders";

// Backward Compatibility Aliases so existing component code transitions seamlessly
export type QIStatusFilter = PPRStatusFilter;
export type QualityIntelligenceFilters = ProductionPerformanceFilters;
export type QIFilterProductOption = PPRFilterProductOption;
export type QIFilterWorkCenterOption = PPRFilterWorkCenterOption;
export type QIFilterCatalogPayload = PPRFilterCatalogPayload;
export type QIKpiMetrics = PPRKpiMetrics;
export type QITrendPoint = PPRTrendPoint;
export type QILossDriver = PPRLossDriver;
export type QIWorkCenterRow = PPRWorkCenterRow;
export type QIRouteHeatmapCell = PPRRouteHeatmapCell;
export type QIDowntimeEvent = PPRDowntimeEvent;
export type QIQaParameterRow = PPRQaParameterRow;
export type QIDefectParetoRow = PPRDefectParetoRow;
export type QIJobOrderRow = PPRJobOrderRow;
export type QIYieldLedgerRow = PPRYieldLedgerRow;
export type QIBomVarianceRow = PPRBomVarianceRow;
export type QIQaRecordRow = PPRQaRecordRow;
export type QIStatusTimelineRow = PPRStatusTimelineRow;
export type QIJobOrderDetail = PPRJobOrderDetail;
export type QIBottleneckItem = PPRBottleneckItem;
export type QICorrectiveActionItem = PPRCorrectiveActionItem;
export type QIRiskFlagItem = PPRRiskFlagItem;
export type QualityAIAnalysisPayload = ProductionAIAnalysisPayload;
export type QualityIntelligenceReportPayload = ProductionPerformanceReportPayload;
export type QITabKey = PPRTabKey;
