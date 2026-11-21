// Dispatch Plan — Shared Types
// Used by both dispatch-plan-creation and dispatch-plan-approval sub-modules.

export type DispatchPlanStatus =
  | "Pending"
  | "For Approval"
  | "Approved"
  | "Rejected"
  | "Returned for Correction"
  | "Dispatched";

export type SalesOrderStatus =
  | "Draft"
  | "Pending"
  | "For Approval"
  | "For Consolidation"
  | "In Production"
  | "For Picking"
  | "For Invoicing"
  | "For Loading"
  | "For Shipping"
  | "En Route"
  | "Dispatched"
  | "Partially Delivered"
  | "Delivered"
  | "On Hold"
  | "For Cancellation"
  | "Cancelled"
  | "Not Fulfilled"
  | "For Production"
  | "For Revision";

export const SALES_ORDER_STATUS_VALUES: readonly SalesOrderStatus[] = [
  "Draft",
  "Pending",
  "For Approval",
  "For Consolidation",
  "In Production",
  "For Picking",
  "For Invoicing",
  "For Loading",
  "For Shipping",
  "En Route",
  "Dispatched",
  "Partially Delivered",
  "Delivered",
  "On Hold",
  "For Cancellation",
  "Cancelled",
  "Not Fulfilled",
  "For Production",
  "For Revision",
] as const;

export interface DispatchPlanListItem {
  dispatch_id: number;
  dispatch_no: string;
  branch_id: number | null;
  branch_name: string;
  driver_id: number | null;
  driver_name: string;
  helper_id: number | null;
  helper_name: string;
  vehicle_id?: number | null;
  vehicle_name: string;
  departure_date: string | null;
  arrival_date: string | null;
  total_amount: number | null;
  total_weight: number | null;
  status: DispatchPlanStatus;
  order_statuses?: (SalesOrderStatus | string)[];
  created_at: string | null;
  created_by: number | null;
  created_by_name?: string;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  rejected_by?: number | null;
  rejected_by_name?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  remarks: string | null;
  stop_count?: number;
  invoice_count?: number;
}

export interface DispatchPlanSalesOrderRef {
  detail_id: number;
  sales_order_id: number;
  order_no: string;
  order_status: SalesOrderStatus | string;
  customer_code: string;
  customer_name: string;
  store_name?: string;
  city: string;
  invoice_id: number | null;
  invoice_no: string | null;
  invoices: EligibleInvoice[];
  amount: number;
  weight?: number | null;
  created_date?: string | null;
}

export interface DispatchPlanBudgetRow {
  id?: number;
  coa_id: number;
  account_title: string;
  gl_code?: string;
  amount: number;
  remarks: string | null;
}

export interface DispatchPlanProductSummary {
  product_id?: number;
  product_name: string;
  total_quantity: number;
}

export interface DispatchPlanDetail extends DispatchPlanListItem {
  vehicle_id?: number | null;
  rejection_reason: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  sales_orders: DispatchPlanSalesOrderRef[];
  budget_rows: DispatchPlanBudgetRow[];
  stops?: UnifiedRouteStop[];
  products?: DispatchPlanProductSummary[];
}

export interface EligibleInvoice {
  invoice_id: number;
  invoice_no: string;
  total_amount: number;
  transaction_status: string | null;
  invoice_date?: string | null;
}

export interface EligibleSalesOrder {
  order_id: number;
  order_no: string;
  order_status: SalesOrderStatus | string;
  customer_code: string;
  customer_name: string;
  store_name: string;
  city: string;
  branch_id: number;
  branch_name: string;
  total_amount: number;
  created_date: string | null;
  invoices: EligibleInvoice[];
}

// Master-data lookups
export interface BranchOption {
  id: number;
  branch_name: string;
  branch_code?: string;
}

export interface UserOption {
  user_id: number;
  user_fname: string;
  user_lname: string;
  full_name: string;
  user_department?: number | null;
  user_position?: string | null;
}

export interface CoaOption {
  coa_id: number;
  account_title: string;
  gl_code: string;
}

export interface VehicleOption {
  vehicle_id: number;
  vehicle_plate: string;
  name?: string | null;
  maximum_weight?: number | null;
  capacity_cbm?: number | null;
  category_id?: number | null;
  category_name?: string | null;
  engine_type_id?: number | null;
  engine_type_name?: string | null;
  vehicle_type_id?: number | null;
  vehicle_type_name?: string | null;
  custodian_id?: number | null;
  custodian_name?: string | null;
  is_third_party?: boolean;
}

export interface PurchaseOrderOption {
  purchase_order_id: number;
  purchase_order_no: string;
  date?: string | null;
  supplier_name?: string | number | null;
  total_amount?: number | null;
  inventory_status?: string | number | null;
}

export type RouteStopType = "DELIVERY" | "MANUAL" | "PO";

export interface UnifiedRouteStop {
  id: string; // Unique stop key (e.g. `so-${sales_order_id}`, `manual-${ts}`, `po-${po_id}`)
  type: RouteStopType;
  sequence: number;
  // Delivery stop fields
  sales_order_id?: number;
  order_no?: string;
  order_status?: string;
  customer_name?: string;
  store_name?: string;
  city?: string;
  invoices?: EligibleInvoice[];
  amount?: number;
  weight?: number | null;
  // Manual stop fields
  remarks?: string;
  distance?: number;
  latitude?: number | null;
  longitude?: number | null;
  // PO stop fields
  po_id?: number;
  po_no?: string;
  supplier_name?: string;
  // Common
  status?: string;
}

export interface DispatchMasterData {
  branches: BranchOption[];
  drivers: UserOption[];
  helpers: UserOption[];
  vehicles: VehicleOption[];
  coa: CoaOption[];
  locked_vehicle?: {
    id: number;
    name: string;
  };
}

// Create / Edit payloads sent to the API route
export interface CreateDispatchPlanPayload {
  branch_id: number;
  vehicle_id?: number | null;
  driver_id?: number | null;
  helper_id?: number | null;
  departure_date: string;
  arrival_date: string;
  remarks: string;
  total_amount: number;
  sales_order_ids: number[];
  budget_rows: { coa_id: number; amount: number; remarks: string }[];
  stops?: UnifiedRouteStop[];
}

export interface UpdateDispatchPlanPayload {
  branch_id?: number;
  vehicle_id?: number | null;
  driver_id?: number | null;
  helper_id?: number | null;
  departure_date?: string;
  arrival_date?: string;
  remarks?: string;
  total_amount?: number;
  sales_order_ids?: number[];
  budget_rows?: { id?: number; coa_id: number; amount: number; remarks: string }[];
  stops?: UnifiedRouteStop[];
  resubmit?: boolean;
}

// Approval action payload
export interface ApprovalActionPayload {
  action: "approve" | "reject";
  reason?: string;
}

export interface FetchDispatchPlansParams {
  search?: string;
  branchId?: number | null;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedDispatchPlansResponse {
  data: DispatchPlanListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts?: {
    all: number;
    Pending: number;
    Approved: number;
    Rejected: number;
  };
}
