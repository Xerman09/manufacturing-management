/**
 * Predictive Maintenance Report Domain Types & Schemas
 * Strictly typed definitions for assets, maintenance history, predictions, KPIs, and AI commentary.
 */

import type { GlobalAiTierSlug } from "@/lib/ai";

export type ReportStatus =
    | "Queued"
    | "Generating"
    | "Draft"
    | "In Review"
    | "Published"
    | "Needs Data"
    | "Failed"
    | "Superseded";

export type RiskSeverity = "Low" | "Medium" | "High" | "Critical";

export type PredictionHorizonOption = "7d" | "14d" | "30d" | "60d" | "90d";

export interface PredictiveMaintenanceFilters {
    dateFrom: string;
    dateTo: string;
    horizon: PredictionHorizonOption;
    assetId: string; // "all" or numeric asset ID
    workCenterId: string; // "all" or numeric work_center_id
    branchId: string; // "all" or numeric branch_id
    status: string; // "all" | ReportStatus
}

export interface FilterCatalogOption {
    id: string;
    label: string;
    subLabel?: string;
}

export interface FilterCatalogPayload {
    assets: FilterCatalogOption[];
    workCenters: FilterCatalogOption[];
    branches: FilterCatalogOption[];
    horizons: Array<{ id: PredictionHorizonOption; label: string; days: number }>;
}

export interface AiTierInfo {
    assigned: boolean;
    tierLevel: number;
    tierName: string;
    tierSlug: GlobalAiTierSlug | "unassigned";
    description: string;
}

export interface FleetRiskKpis {
    fleetRiskScore: number; // 0 - 100
    fleetRiskLevel: RiskSeverity;
    highRiskAssetCount: number;
    totalAssetsEvaluated: number;
    fleetMtbfHours: number | null; // null if 0 breakdowns
    fleetMttrHours: number | null; // null if 0 breakdowns
    totalOperatingRunHours: number;
    totalBreakdownEpisodes: number;
    openRecommendationsCount: number;
    telemetryMode: "Absent / Rule-Based" | "Active";
    dataCoveragePct: number;
    dataFreshnessTimestamp: string;
}

export interface AssetRiskRow {
    assetId: number;
    assetName: string;
    serial: string;
    barcode: string;
    workCenterId: number | null;
    workCenterName: string;
    condition: "Good" | "Bad" | "Under Maintenance" | "Discontinued" | string;
    criticality: "Tier 1 (Bottleneck)" | "Tier 2 (Medium)" | "Tier 3 (Standard)";
    cumulativeRunHours: number;
    breakdownCount: number;
    totalDowntimeHours: number;
    mtbfHours: number | null;
    mttrHours: number | null;
    predictedBreakdownRiskPct: number; // 0 - 100
    riskLevel: RiskSeverity;
    primaryFailureMode: string;
    suggestedAction: string;
    dataGapWarning?: string | null;
    lastBreakdownDate?: string | null;
}

export interface BreakdownEpisodeDetail {
    id: number;
    assetId: number;
    startedAt: string | null;
    endedAt: string | null;
    downtimeDurationHours: number;
    startReason: string;
    rootCause: string;
    correctiveAction: string;
    breakdownCategory: string;
    technicianName: string;
    restoredCondition: string;
}

export interface DegradationTrendPoint {
    periodLabel: string; // e.g. "Week 1", "Oct 2026"
    runHours: number;
    breakdownEvents: number;
    downtimeHours: number;
    riskIndex: number;
}

export interface CategoryBreakdownDistribution {
    category: string;
    incidentCount: number;
    totalDowntimeHours: number;
    pctOfDowntime: number;
}

export interface MaintenanceAiFinding {
    id: string;
    title: string;
    type: "FACT" | "HYPOTHESIS";
    confidence?: "high" | "medium" | "low";
    assetId?: number;
    assetName?: string;
    observation: string;
    evidence: string;
    recommendedAction: string;
    priority: RiskSeverity;
}

export interface MaintenanceActionItem {
    id: string;
    findingId: string;
    assetId: number;
    assetName: string;
    title: string;
    owner: string;
    dueDate: string;
    status: "Open" | "Assigned" | "In Progress" | "Verified" | "Closed";
    linkedWorkOrderRef?: string;
}

export interface ReportMeta {
    reportId: string;
    version: number;
    status: ReportStatus;
    generatedAt: string;
    generatedBy: string;
    reviewedBy?: string | null;
    publishedAt?: string | null;
    cutoffDate: string;
    horizonDays: number;
    dateLabel: string;
    notes?: string;
}

export interface PredictiveMaintenanceReportPayload {
    kpis: FleetRiskKpis;
    assetRiskRows: AssetRiskRow[];
    degradationTrends: DegradationTrendPoint[];
    categoryDistribution: CategoryBreakdownDistribution[];
    breakdownEpisodes: BreakdownEpisodeDetail[];
    findings: MaintenanceAiFinding[];
    actions: MaintenanceActionItem[];
    meta: ReportMeta;
    aiTier: AiTierInfo;
    dataGaps: string[];
}

export interface PredictiveAiCommentaryPayload {
    executiveSummary: string;
    verifiedFacts: string[];
    hypotheses: MaintenanceAiFinding[];
    containmentPriorities: string[];
    aiTier: AiTierInfo;
}

export type PredictiveReportTabKey = "ranked-risk" | "degradation" | "findings" | "review";
