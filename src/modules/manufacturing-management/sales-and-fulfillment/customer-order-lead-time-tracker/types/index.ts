export type OrderLifecycleStatus = "Open" | "Completed" | "Cancelled" | "Missing Milestone";

export type MilestoneStage =
    | "ORDER_CREATED"
    | "FOR_APPROVAL"
    | "APPROVED_FOR_CONSOLIDATION"
    | "CONSOLIDATION_PLANNED"
    | "PICKING_COMPLETED"
    | "INVOICED"
    | "DISPATCHED"
    | "FIRST_DELIVERY"
    | "FINAL_DELIVERY";

export interface LifecycleMilestone {
    id: string | number;
    stage: MilestoneStage;
    stageName: string;
    timestamp: string | null;
    recordedBy?: string | number | null;
    referenceDocumentNo?: string;
    referenceModule?: string;
    status: "Completed" | "Pending" | "Skipped" | "Reversed";
    remarks?: string;
}

export interface StageDuration {
    fromStage: MilestoneStage;
    toStage: MilestoneStage;
    stageLabel: string;
    durationHours: number;
    durationFormatted: string;
    isNegative: boolean;
    isDelayed: boolean;
}

export interface CustomerOrderLeadTimeItem {
    assessment: import("../utils/assessment").OrderAssessment;
    orderId: number;
    orderNo: string;
    poNo: string;
    customerCode: string;
    customerName: string;
    branchId: number;
    branchName: string;
    branchCode?: string;
    orderDate: string;
    promisedDate: string | null;
    transactionStatus: string;
    reportingStatus: OrderLifecycleStatus;

    // High-level milestone timestamps
    creationTimestamp: string;
    forApprovalTimestamp: string | null;
    approvalTimestamp: string | null;
    consolidationTimestamp: string | null;
    pickingTimestamp: string | null;
    invoicingTimestamp: string | null;
    dispatchTimestamp: string | null;
    firstDeliveryTimestamp: string | null;
    finalDeliveryTimestamp: string | null;

    // Computed durations
    totalLeadTimeHours: number | null;
    totalLeadTimeFormatted: string | null;
    ongoingAgeHours: number | null;
    ongoingAgeFormatted: string | null;

    currentStage: MilestoneStage;
    currentStageLabel: string;
    hasMissingMilestones: boolean;
    missingMilestonesList: string[];
    hasNegativeDurations: boolean;
    isPartialDelivery: boolean;

    stages: StageDuration[];
    milestones: LifecycleMilestone[];
}

export interface LeadTimeSummaryKPIs {
    totalTrackedOrders: number;
    averageLeadTimeDays: number;
    openOrdersCount: number;
    completedOrdersCount: number;
    flaggedMissingMilestonesCount: number;
    negativeDurationCount: number;
}

export interface BranchOption {
    id: number;
    branch_name: string;
    branch_code: string;
}

export interface CustomerOption {
    customer_code: string;
    customer_name: string;
}

export interface FetchLeadTimeParams {
    search?: string;
    branchId?: number | null;
    customerCode?: string;
    status?: OrderLifecycleStatus | "All";
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
}

export interface PaginatedLeadTimeResponse {
    data: CustomerOrderLeadTimeItem[];
    kpis: LeadTimeSummaryKPIs;
    branches: BranchOption[];
    customers: CustomerOption[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
