export interface SalesOrder {
    order_id: number;
    order_no: string;
    po_no?: string;
    quotation_id?: number;
    customer_code: string;
    customer_name?: string;
    order_date: string;
    order_status: string;
    total_amount: number;
    net_amount: number;
    remarks: string;
    created_date: string;
    discount_amount?: number;
    delivery_date?: string;
    due_date?: string;
    payment_terms?: number;
    payment_term_name?: string;
    payment_term_days?: number;
    salesman_id?: number;
    salesman_name?: string;
    salesman_account_name?: string;
    branch_id?: number;
    branch_name?: string;
    price_type_id?: number | null;
    price_type?: string | null;
}

export interface SalesOrderDetail {
    detail_id: number;
    order_id: number;
    product_id: {
        product_id: number;
        product_name: string;
        product_code: string;
        uom: string;
        uom_count: number;
        brand: string;
        category: string;
        has_bom?: boolean;
    };
    unit_price: number;
    ordered_quantity: number;
    gross_amount?: number;
    discount_amount?: number;
    discount_type?: number | null;
    net_amount: number;
    bom_version_id?: number | null;
    bom_version_name?: string | null;
}

export interface DirectOrderItemPayload {
    parent_product_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    discount_type?: number | null;
    discount_amount?: number;
    bom_version_id?: number | null;
}

export interface CreateSalesOrderPayload {
    customerId: number;
    poNo: string;
    branchId: number;
    paymentTerms: number;
    deliveryDate: string;
    dueDate: string;
    salesmanId?: number;
    quotationId?: number;
    remarks?: string;
    priceTypeId?: number | null;
    priceType?: string | null;
    items: DirectOrderItemPayload[];
    submitForApproval?: boolean;
}

export interface QuotationHeader {
    id: number;
    quote_number: string;
    customer_id: {
        customer_name: string;
        customer_code: string;
    } | null;
    total_selling_price: number;
    total_simulated_cost: number;
    quote_date: string;
    status: string;
    remarks: string;
}

export interface ProductLookupItem {
    product_id: number;
    parent_product_id: number;
    is_parent: boolean;
    product_name: string;
    product_code: string;
    product_type: number | string | { id: number; name: string };
    price_per_unit?: number;
    cost_per_unit?: number;
    unit_id?: number | null;
    unit_name?: string;
    unit_shortcut?: string;
    unit_count?: number;
    manufacturing_lead_days?: number;
    has_active_version?: boolean;
    has_active_uom_version?: boolean;
    has_bom?: boolean;
}

export interface SalesOrderLookups {
    customers: Array<{
        id: number;
        customer_name: string;
        customer_code: string;
        price_type?: string | null;
        price_type_id?: number | null;
        payment_term?: number | null;
        payment_term_id?: number | null;
    }>;
    products: ProductLookupItem[];
    branches: Array<{ id: number; branch_name: string }>;
    paymentTerms: Array<{ id: number; payment_name: string; payment_days: number }>;
    salesmen: Array<{ id: number; salesman_name: string; salesman_code?: string; employee_id?: number }>;
    users: Array<{ user_id: number; user_fname: string; user_lname: string }>;
    suppliers: Array<{ id: number; supplier_name: string }>;
    productTypes: Array<{ id: number; name: string }>;
    discountTypes: Array<{ id: number; discount_type: string; total_percent: number }>;
}
