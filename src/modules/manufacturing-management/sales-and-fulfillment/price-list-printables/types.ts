export interface Salesman {
    id: number;
    salesman_code: string;
    salesman_name: string;
    price_type?: string | null;
    price_type_id?: number | null;
}

export interface ProductType {
    id: number;
    name: string;
}

export interface Supplier {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string;
}

export interface PriceListItem {
    productId?: number;
    parentId?: number | null;
    groupName?: string;
    categoryCode: string;
    productCode?: string;
    productName: string;
    pckg: number;
    unit: string;
    price: number | null;
    priceType: string;
    barcode?: string;
    barcodeNo?: string;
}

export interface PriceListPrintablesState {
    salesmanId: string | null;
    productTypeIds: string[];
    supplierId: string | null;
    isGenerating: boolean;
    data: PriceListItem[];
}
