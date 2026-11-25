import type { CanonicalJobOrderStatus } from "../job-order-status";

export type QualityTabKey = "overview" | "traceability" | "root-cause";

export interface QualityFilters {
    dateFrom: string;
    dateTo: string;
    productId: string;
    workCenterId: string;
    shiftName: string;
    status: "all" | CanonicalJobOrderStatus;
}

export interface QualityFilterProductOption {
    id: number;
    code: string;
    name: string;
}

export interface QualityFilterWorkCenterOption {
    id: number;
    name: string;
}

export interface QualityFilterCatalogPayload {
    products: QualityFilterProductOption[];
    workCenters: QualityFilterWorkCenterOption[];
    shifts: string[];
}

export interface QualityKpiMetrics {
    defectRatePct: number | null;
    scrapRatePct: number | null;
    fpyPct: number | null;
    repeatDefectCount: number;
    qaHoldBatchCount: number;
    totalInspectedUnits: number;
    totalDefectiveUnits: number;
    totalScrapUnits: number;
    totalJobOrders: number;
}

export interface QualityDefectParetoRow {
    defectLabel: string;
    defectQuantity: number;
    defectiveUnits: number;
    cumulativePct: number;
    isCritical: boolean;
}

export interface QualityTrendPoint {
    periodLabel: string;
    date: string;
    defectRatePct: number | null;
    scrapRatePct: number | null;
    fpyPct: number | null;
    inspectedQty: number;
    defectiveQty: number;
    scrapQty: number;
}

export interface ComponentGenealogyItem {
    componentProductId: number;
    componentProductName: string;
    componentBatchNo: string;
    componentLotName: string | null;
    consumedQty: number;
    componentLotId?: number | null;
    componentMmLotId?: number | null;
}

export interface QualityLotTraceRow {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    productCode: string;
    productName: string;
    finishedLotNumber: string;
    finishedBatchNo: string | null;
    startDate: string | null;
    endDate: string | null;
    workCenterId: number | null;
    workCenterName: string | null;
    shiftName: string | null;
    operatorName: string | null;
    targetQty: number;
    producedQty: number | null;
    completedQty: number | null;
    rejectedQty: number | null;
    scrapQty: number | null;
    defectRatePct: number | null;
    qaStatus: string; // Passed | QA Hold | Rejected | Quarantined
    componentBatches: ComponentGenealogyItem[];
}

export interface QualityRootCauseRow {
    dimensionType: "work_center" | "shift" | "operator";
    dimensionLabel: string;
    defectCount: number;
    defectiveQty: number;
    primaryDefectLabel: string;
    correlationScore: number; // 0 to 100 percentage
}

export interface AiTierInfo {
    assigned: boolean;
    tierLevel: number;
    tierName: string;
    tierSlug: "basic" | "pro" | "executive" | "unassigned";
    description: string;
}

export interface QualityReportPayload {
    meta: {
        dateLabel: string;
        productLabel: string;
        workCenterLabel: string;
        shiftLabel: string;
        statusLabel: string;
        freshnessCutoff: string;
        totalRecordsEvaluated: number;
        aiTier: AiTierInfo;
        notices: string[];
    };
    kpis: QualityKpiMetrics;
    defectPareto: QualityDefectParetoRow[];
    trendSeries: QualityTrendPoint[];
    lotTrace: QualityLotTraceRow[];
    rootCauseCorrelations: QualityRootCauseRow[];
}

export interface QualityJobOrderDetail {
    jobOrderId: number;
    jobOrderNo: string;
    productName: string;
    status: string;
    targetQty: number;
    actualQtyProduced: number | null;
    completedQty: number | null;
    outputLotNo?: string | null;
    outputBatchNo?: string | null;
    workCenterName?: string | null;
    yieldLedger: Array<{
        ledgerId: number;
        shiftName: string;
        yieldQty: number;
        scrapQty: number;
        rejectedQty: number;
        qaStatus: string;
        loggedAt: string;
        lotNumber: string | null;
        workCenterName: string | null;
    }>;
    genealogy: ComponentGenealogyItem[];
    qaRecords: Array<{
        qaRecordId: number;
        parameterName: string;
        testType: string;
        valueLabel: string;
        isPassed: boolean;
        isCritical: boolean;
        inspectedAt: string;
        remarks: string | null;
    }>;
    dispositions: Array<{
        id: string;
        taskName: string;
        stationName: string | null;
        expectedQty: number;
        actualQty: number;
        failedParameters: Array<{ test_name?: string }>;
        decision: string | null;
    }>;
}

export interface QualityAIHypothesisItem {
    id: string;
    title: string;
    observation: string;
    hypothesis: string;
    confidence: "high" | "medium" | "low";
    evidence: string;
    proposedAction: string;
}

export interface QualityAICommentaryPayload {
    executiveSummary: string;
    verifiedFacts: string[];
    hypotheses: QualityAIHypothesisItem[];
    containmentPriorities: string[];
    meta: {
        aiTier: AiTierInfo;
        modelUsed: string;
        generatedAt: string;
        isFallback?: boolean;
    };
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    modelUsed?: string;
}
