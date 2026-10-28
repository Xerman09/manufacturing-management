// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/types/index.ts

export type AllocationStatus = "Not Started" | "Partial" | "Complete" | "Excess";
export type ConsolidationStatus = "Not Started" | "Partial" | "Complete" | "Excess";

export type OrderStage =
    | "All"
    | "Awaiting Allocation"
    | "Ready for Picking"
    | "In Picking"
    | "Fully Picked";

export interface LotReservationRef {
    reservation_id: number;
    sales_order_detail_id: number;
    inventory_lot_id: number;
    lot_number: string;
    batch_no: string;
    expiry_date?: string | null;
    reserved_quantity: number;
    picked_quantity: number;
    effective_allocated_quantity: number;
    status: "Reserved" | "Picked" | "Consumed" | "Released" | "Returned";
    is_pick_exceeds_reserve: boolean;
    is_substituted_lot?: boolean;
    is_added_lot?: boolean;
    created_at?: string | null;
}

export interface ConsolidationBatchRef {
    id: number;
    consolidator_id: number;
    consolidator_no: string;
    sales_order_detail_id?: number | null;
    batch_status: string;
    applied_quantity: number;
    picked_quantity: number;
    picked_at?: string | null;
    picked_by_name?: string | null;
}

export interface OrderTrackingLineItem {
    detail_id: number;
    order_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    uom: string;
    ordered_quantity: number;
    allocated_quantity: number;
    derived_allocated_quantity: number;
    stored_allocated_quantity: number;
    remaining_to_allocate: number;
    allocation_status: AllocationStatus;
    is_excess_allocation: boolean;
    excess_allocation_quantity: number;
    applied_consolidation_quantity: number;
    picked_consolidation_quantity: number;
    approved_consolidation_quantity: number;
    remaining_to_consolidate_physical: number;
    remaining_to_plan_gap: number;
    consolidation_status: ConsolidationStatus;
    stage: OrderStage;
    is_excess_consolidation: boolean;
    excess_consolidation_quantity: number;
    is_discrepancy: boolean;
    is_pick_exceeds_reserve: boolean;
    is_missing_reservations: boolean;
    is_zero_quantity: boolean;
    is_cancelled: boolean;
    reservations: LotReservationRef[];
    consolidation_batches: ConsolidationBatchRef[];
}

export interface OrderTrackingItem {
    order_id: number;
    order_no: string;
    po_no: string;
    customer_code: string;
    customer_name: string;
    branch_id: number;
    branch_name: string;
    branch_code?: string;
    order_date?: string | null;
    delivery_date?: string | null;
    order_status: string;
    stage: OrderStage;
    is_cancelled: boolean;
    line_count: number;
    uom_summary: string;
    total_ordered_quantity: number;
    total_allocated_quantity: number;
    total_stored_allocated_quantity: number;
    total_physical_picked_quantity: number;
    total_approved_consolidation_quantity: number;
    total_planned_applied_quantity: number;
    total_remaining_to_allocate: number;
    total_remaining_to_consolidate: number;
    allocation_rate: number;
    physical_consolidation_rate: number;
    planned_consolidation_rate: number;
    overall_allocation_status: AllocationStatus;
    overall_consolidation_status: ConsolidationStatus;
    exceptions: {
        has_discrepancy: boolean;
        has_inconsistent_pick: boolean;
        has_substituted_lot?: boolean;
        has_added_lot?: boolean;
        has_excess_allocation: boolean;
        has_excess_consolidation: boolean;
        has_missing_reservations: boolean;
        has_zero_quantity: boolean;
        is_mixed_uom: boolean;
        is_cancelled: boolean;
    };
    lines: OrderTrackingLineItem[];
}

export interface TrackingMetrics {
    total_orders: number;
    overall_allocation_rate: number;
    overall_physical_consolidation_rate: number;
    overall_planned_consolidation_rate: number;
    stage_awaiting_allocation_count: number;
    stage_ready_for_picking_count: number;
    stage_in_picking_count: number;
    stage_fully_picked_count: number;
    fully_allocated_count: number;
    partially_allocated_count: number;
    not_started_allocation_count: number;
    fully_consolidated_count: number;
    partially_consolidated_count: number;
    not_started_consolidation_count: number;
    total_discrepancies: number;
    total_inconsistent_picks: number;
    total_excess_allocations: number;
    total_excess_consolidations: number;
    total_missing_reservations: number;
    total_zero_quantity_lines: number;
    total_mixed_uom_orders: number;
    total_exceptions_count: number;
    delivered_orders_count: number;
    dispatched_orders_count: number;
    overall_delivery_rate: number;
}

export interface BranchOption {
    id: number;
    branch_name: string;
    branch_code: string;
}

export interface TrackingFilterParams {
    branchId?: number | string;
    search?: string;
    stage?: string;
    allocationStatus?: string;
    consolidationStatus?: string;
    exceptionsOnly?: boolean;
    page?: number;
    pageSize?: number;
}

export interface TrackingApiResponse {
    success: boolean;
    data: OrderTrackingItem[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    metrics: TrackingMetrics;
    branches: BranchOption[];
    message?: string;
}
