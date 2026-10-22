export type ProjectionStatus =
    | "CRITICAL_SUPPLY"
    | "LOW_SUPPLY"
    | "ESTIMATED_SUPPLY"
    | "INSUFFICIENT_HISTORY"
    | "NO_RECORDED_CONSUMPTION";

export interface StockProjectionItem {
    product_id: number;
    product_code: string;
    product_name: string;
    product_type_id?: number | null;
    product_type_name?: string | null;
    category_name?: string | null;
    unit_id?: number | null;
    unit_name?: string | null;
    unit_shortcut?: string | null;
    branch_id: number;
    branch_name: string;
    
    // Inventory metrics
    available_stock: number;
    total_on_hand_stock: number;
    quarantined_stock: number;
    active_batches_count: number;

    // Consumption metrics (from verified v_mm_inventory_movements)
    total_consumed_quantity: number;
    assessed_months: number;
    assessed_calendar_days: number;
    actual_working_days_covered: number;
    working_days_per_month: number;
    
    m_avg: number; // Monthly Average Consumption
    d_avg: number; // Daily Average Consumption (working day)
    days_to_last: number | null; // null if zero consumption or insufficient history

    // Data Readiness & Audit flags
    status: ProjectionStatus;
    has_sufficient_history: boolean;
    history_record_count: number;
    earliest_recorded_date: string | null;
    latest_recorded_date: string | null;
    notes?: string | null;
    
    // Low stock threshold in days
    low_stock_threshold_days: number;
}

export interface VerifiedConsumptionDetail {
    movement_key: string;
    reference_no: string; // Job Order No
    reference_id: number; // Job Order ID
    transaction_date: string;
    posted_at: string;
    branch_id: number;
    product_id: number;
    product_name: string;
    batch_no: string | null;
    quantity_out: number;
    unit_shortcut?: string | null;
    remarks: string | null;
}

export interface StockProjectionKpis {
    critical_supply_count: number;
    low_supply_count: number;
    adequate_supply_count: number;
    insufficient_history_count: number;
    no_consumption_count: number;
    total_materials_assessed: number;
    total_available_stock_units: number;
}

export interface StockProjectionFilters {
    search: string;
    branch_id: number | "ALL";
    status: ProjectionStatus | "ALL";
    product_type: string | "ALL";
    assessment_window_months: number; // 1, 3, 6, 12 months
    working_days_per_month: number; // default 26
    only_with_available_stock: boolean;
}

export interface StockProjectionApiResponse {
    success: boolean;
    data: StockProjectionItem[];
    kpis: StockProjectionKpis;
    branches: Array<{ id: number; branch_name: string; branch_code: string }>;
    product_types: Array<{ id: number; name: string }>;
    timestamp: string;
    error?: string;
}
