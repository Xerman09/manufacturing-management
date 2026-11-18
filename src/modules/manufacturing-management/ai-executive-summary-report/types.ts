export interface AIExecutiveReportFilters {
    plantId: string; // branch id or 'all'
    period: "today" | "thisWeek" | "thisMonth" | "thisYear" | "custom";
    dateFrom: string;
    dateTo: string;
}

export interface PlantOption {
    id: number | string;
    code: string;
    name: string;
}

export interface MetricCardData {
    id: string;
    title: string;
    actual: number | null;
    target: number | null;
    variance: number | null;
    variancePercent: number | null;
    unit: string;
    status: "good" | "warning" | "critical" | "neutral";
    freshnessCutoff: string;
    targetBasis: string;
    dataCoverageNote?: string;
    explanation?: {
        formula: string;
        numeratorLabel: string;
        numeratorValue: number;
        denominatorLabel: string;
        denominatorValue: number;
        dataSource: string;
        description: string;
    };
}

export interface DrilldownRecord {
    id: string | number;
    col1: string; // e.g. JO Number / Asset Name / Order No
    col2: string; // e.g. Product / Breakdown Category / Customer
    col3: string; // e.g. Target Qty / Start Time / Due Date
    col4: string; // e.g. Good Yield / Duration Mins / Dispatch Date
    status: string;
    notes?: string;
}

export interface DetailedKPIRow {
    key: string;
    category: string;
    kpi: string;
    actual: string;
    target: string;
    targetBasis: string;
    variance: string;
    varianceType: "favorable" | "unfavorable" | "neutral";
    status: "good" | "warning" | "critical" | "neutral";
    operationalScope: string;
    calculationDetails: {
        formula: string;
        numeratorLabel: string;
        numeratorValue: number;
        denominatorLabel: string;
        denominatorValue: number;
        sourceRecordsCount: number;
        notes?: string;
    };
    records: DrilldownRecord[];
    recordColumns: { col1: string; col2: string; col3: string; col4: string };
}

export interface AIObservation {
    id: string;
    type: "fact" | "hypothesis" | "estimate";
    category: "output" | "oee" | "quality" | "downtime" | "delivery" | "cost";
    finding: string;
    supportingEvidence: string;
    impactLevel: "low" | "medium" | "high";
    recommendedAction?: string;
    suggestedOwner?: string;
    department?: string;
    targetModule?: string;
}

export interface AiTierInfo {
    assigned: boolean;
    tierLevel: number;
    tierName: string;
    tierSlug: "basic" | "pro" | "executive" | "unassigned";
    description?: string;
}

export interface StrategicPillars {
    throughputAndCapacity: {
        title: string;
        analysis: string;
        riskScore: "LOW" | "MEDIUM" | "HIGH";
    };
    qualityAndScrap: {
        title: string;
        analysis: string;
        riskScore: "LOW" | "MEDIUM" | "HIGH";
    };
    financialAndFulfillment: {
        title: string;
        analysis: string;
        riskScore: "LOW" | "MEDIUM" | "HIGH";
    };
}

export interface ExecutiveReportSectionData {
    reportTitle: string;
    preparedBy: string;
    focus: string;
    executiveSummary: string;
    metricsTable: Array<{
        category: string;
        actual: string;
        target: string;
        status: string;
    }>;
    bottleneckFindings: {
        highEfficiency: string[];
        primaryBottlenecks: string[];
        criticalDelays: string[];
    };
    keyTakeaways: string | string[]; // 1-2 punchy sentences or array of punchy bullet takeaways
    strategicRecommendations: Array<{
        title: string;
        description: string;
        owner?: string;
    }>;
}

export interface AIInsightsPayload {
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
    summary: string;
    keyHighlights?: string[]; // Used in Tier 1 Basic (2-4 bullets)
    detailedAnalysis?: string; // Used in Tier 2 Pro
    priorityDecisions?: string[]; // Used in Tier 3 Executive
    pillars?: StrategicPillars; // Used in Tier 3 Executive
    keyExposures: AIObservation[]; // Used in Tier 2 Pro and Tier 3 Executive
    strategicActions: AIObservation[]; // Used in Tier 2 Pro and Tier 3 Executive
    executiveReport?: ExecutiveReportSectionData; // Comprehensive 4-section report for Tier 3 Executive
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    evidenceCitations?: string[];
}

export interface AIExecutiveReportPayload {
    meta: {
        reportTitle: string;
        generatedAt: string;
        plantName: string;
        reportingPeriod: string;
        dateFrom: string;
        dateTo: string;
        aiTier: AiTierInfo;
        freshnessCutoff: string;
        dataGaps: string[];
    };
    kpiCards: {
        output: MetricCardData;
        plantOee: MetricCardData;
        scrapRate: MetricCardData;
        downtimeMinutes: MetricCardData;
        otif: MetricCardData;
        costVariance: MetricCardData;
    };
    detailedRows: DetailedKPIRow[];
}
