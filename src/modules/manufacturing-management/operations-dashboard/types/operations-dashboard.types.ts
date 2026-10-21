export interface DashboardBranch {
    id: number;
    branch_name: string;
}

export interface KpiTotals {
    ordersAwaitingApproval: number;
    materialShortages: number;
    activeJobOrders: number;
    activeWipJobs?: number;
    remainingWipQuantity: number;
    pendingQaInspections: number;
    readyForFulfillment: number;
}

export interface OrderAwaitingApprovalItem {
    id: string | number;
    orderNumber: string;
    customerName: string;
    totalAmount: number;
    submittedDate: string;
    approvalStatus: string;
    branchId?: number;
    actionUrl: string;
}

export interface MaterialShortageItem {
    joId: string | number;
    joNumber: string;
    productName: string;
    componentName: string;
    componentCode: string;
    requiredQty: number;
    onHandQty: number;
    shortageQty: number;
    uom: string;
    actionUrl: string;
}

export interface ActiveJobOrderItem {
    joId: string | number;
    joNumber: string;
    productName: string;
    quantity: number;
    completedQuantity: number;
    progressPercentage: number;
    currentStation?: string;
    targetDueDate: string | null;
    status: string;
    actionUrl: string;
}

export interface RemainingWipItem {
    taskId: string | number;
    joNumber: string;
    productName: string;
    stationName: string;
    wipQuantity: number;
    lastMovement: string;
    status: string;
    actionUrl: string;
}

export interface PendingQaItem {
    inspectionId: string | number;
    lotNumber: string;
    productName: string;
    inspectionType: string;
    quantity: number;
    submissionDate: string;
    status: string;
    actionUrl: string;
}

export interface FulfillmentQueueItem {
    fulfillmentId: string | number;
    soNumber: string;
    customerName: string;
    quantity: number;
    readySince: string;
    shippingStatus: string;
    actionUrl: string;
}

export type ExceptionSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface ExceptionItem {
    id: string;
    title: string;
    description: string;
    sourceModule: string;
    referenceNumber: string;
    severity: ExceptionSeverity;
    occurredAt: string;
    actionUrl: string;
    actionLabel: string;
}

export interface OperationsDashboardData {
    refreshTime: string;
    totals: KpiTotals;
    branches: DashboardBranch[];
    queues: {
        ordersAwaitingApproval: OrderAwaitingApprovalItem[];
        materialShortages: MaterialShortageItem[];
        activeJobOrders: ActiveJobOrderItem[];
        remainingWip: RemainingWipItem[];
        pendingQa: PendingQaItem[];
        fulfillmentQueue: FulfillmentQueueItem[];
    };
    exceptions: ExceptionItem[];
}

export type QueueTabKey =
    | "approvals"
    | "shortages"
    | "active_jos"
    | "wip"
    | "qa"
    | "fulfillment";

export type PeriodFilter = "today" | "this_week" | "this_month" | "custom" | "all";
