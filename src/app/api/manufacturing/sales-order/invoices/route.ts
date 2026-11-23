import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

interface SalesInvoiceRecord {
    invoice_id: number;
    invoice_no: string;
    order_id: string;
    customer_code: string;
    salesman_id: number | null;
    branch_id: number | null;
    invoice_date: string | null;
    dispatch_date: string | null;
    due_date: string | null;
    payment_terms: number | null;
    transaction_status: string | null;
    payment_status: string | null;
    total_amount: number | null;
    gross_amount: number | null;
    discount_amount: number | null;
    net_amount: number | null;
    vat_amount: number | null;
    ewt_amount: number | null;
    remarks: string | null;
}

interface SalesInvoiceDetailRecord {
    invoice_detail_id?: number;
    detail_id?: number;
    invoice_no: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    gross_amount: number | null;
    discount_amount: number | null;
    discount?: number | null;
    discount_type: number | string | null;
    total_amount: number | null;
    net_amount: number | null;
    unit: number | null;
}

interface ProductRecord {
    product_id: number;
    product_code: string;
    product_name: string;
    description?: string;
    item_code?: string;
    unit_of_measurement?: number | { unit_id: number; unit_name: string; unit_shortcut?: string };
}

interface UnitRecord {
    unit_id?: number;
    id?: number;
    name?: string;
    unit_name?: string;
    unit_shortcut?: string;
    abbreviation?: string;
}

interface DiscountTypeRecord {
    id: number;
    discount_type?: string;
    name?: string;
    total_percent?: number;
    discount_rate?: number;
}

interface SalesInvoicePdfRecord {
    id: number;
    sales_invoice_id: number;
    pdf_file: string;
    filename_download?: string;
    uploaded_at?: string;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get("orderId");
        const orderNo = searchParams.get("orderNo");

        if (!orderId && !orderNo) {
            return NextResponse.json(
                { error: "orderId or orderNo is required" },
                { status: 400 }
            );
        }

        const cookieStore = await cookies();
        const cookieToken = cookieStore.get("directus_token")?.value;
        const token = cookieToken || DIRECTUS_STATIC_TOKEN;

        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const readDirectus = async <T>(collection: string, queryParams: Record<string, string>): Promise<T[]> => {
            const params = new URLSearchParams(queryParams);
            const url = `${DIRECTUS_URL}/items/${collection}?${params.toString()}`;
            const res = await fetch(url, { headers, cache: "no-store" });
            if (!res.ok) {
                // If query fails or returns 403/404, gracefully return empty array to prevent 500 error
                console.warn(`Directus query failed for ${collection}: ${res.status}`);
                return [];
            }
            const json = await res.json();
            return (json.data || []) as T[];
        };

        // 1. Fetch sales_invoice matching order_id
        const orderFilters: string[] = [];
        if (orderId) orderFilters.push(orderId);
        if (orderNo) orderFilters.push(orderNo);

        const invoices = await readDirectus<SalesInvoiceRecord>("sales_invoice", {
            "filter[order_id][_in]": orderFilters.join(","),
            "sort": "-invoice_date,-invoice_id",
            "limit": "100"
        });

        if (invoices.length === 0) {
            return NextResponse.json({
                success: true,
                invoices: []
            });
        }

        const invoiceIds = invoices.map(inv => inv.invoice_id);

        // 2. Fetch sales_invoice_details
        const invoiceDetails = await readDirectus<SalesInvoiceDetailRecord>("sales_invoice_details", {
            "filter[invoice_no][_in]": invoiceIds.join(",")
        });

        // 3. Collect specific product IDs, unit IDs, and discount type IDs
        const productIds = Array.from(new Set(invoiceDetails.map(d => Number(d.product_id)).filter(Boolean)));
        const unitIds = Array.from(new Set(invoiceDetails.map(d => Number(d.unit)).filter(Boolean)));
        const discountTypeIds = Array.from(new Set(invoiceDetails.map(d => Number(d.discount_type)).filter(Boolean)));

        // 4. Batch query targeted lookups in parallel without unbound -1 limits
        const [products, units, discountTypes, invoicePdfs] = await Promise.all([
            productIds.length > 0
                ? readDirectus<ProductRecord>("products", {
                    "filter[product_id][_in]": productIds.join(","),
                    "fields": "product_id,product_code,product_name,description,item_code,unit_of_measurement,parent_id",
                    "limit": String(productIds.length)
                })
                : Promise.resolve([]),
            unitIds.length > 0
                ? readDirectus<UnitRecord>("units", {
                    "filter[unit_id][_in]": unitIds.join(","),
                    "fields": "unit_id,id,unit_name,name,unit_shortcut,abbreviation",
                    "limit": String(unitIds.length)
                })
                : Promise.resolve([]),
            discountTypeIds.length > 0
                ? readDirectus<DiscountTypeRecord>("discount_type", {
                    "filter[id][_in]": discountTypeIds.join(","),
                    "fields": "id,discount_type,total_percent",
                    "limit": String(discountTypeIds.length)
                })
                : Promise.resolve([]),
            invoiceIds.length > 0
                ? readDirectus<SalesInvoicePdfRecord>("sales_invoice_pdf", {
                    "filter[sales_invoice_id][_in]": invoiceIds.join(","),
                    "fields": "id,sales_invoice_id,pdf_file,filename_download,uploaded_at",
                    "limit": String(invoiceIds.length)
                })
                : Promise.resolve([])
        ]);

        const productMap = new Map<number, ProductRecord>();
        products.forEach(p => productMap.set(Number(p.product_id), p));

        const unitMap = new Map<number, string>();
        units.forEach(u => {
            const uid = Number(u.unit_id ?? u.id);
            const label = u.unit_shortcut || u.abbreviation || u.unit_name || u.name || "PCS";
            if (uid) unitMap.set(uid, label);
        });

        const discountTypeMap = new Map<number, string>();
        discountTypes.forEach(dt => {
            const dtId = Number(dt.id);
            const name = dt.discount_type || dt.name || "";
            if (dtId && name) discountTypeMap.set(dtId, name);
        });

        const pdfMap = new Map<number, SalesInvoicePdfRecord>();
        invoicePdfs.forEach(pdf => pdfMap.set(Number(pdf.sales_invoice_id), pdf));

        // Group details by invoice_no
        const detailsByInvoice = new Map<number, SalesInvoiceDetailRecord[]>();
        invoiceDetails.forEach(detail => {
            const invNo = Number(detail.invoice_no);
            const list = detailsByInvoice.get(invNo) || [];
            list.push(detail);
            detailsByInvoice.set(invNo, list);
        });

        // 5. Structure response
        const formattedInvoices = invoices.map(inv => {
            const details = detailsByInvoice.get(Number(inv.invoice_id)) || [];
            const pdf = pdfMap.get(Number(inv.invoice_id));

            const items = details.map(item => {
                const prod = productMap.get(Number(item.product_id));
                const itemUnitId = Number(item.unit) || (typeof prod?.unit_of_measurement === "number" ? prod.unit_of_measurement : (typeof prod?.unit_of_measurement === "object" ? prod.unit_of_measurement?.unit_id : null));
                const uomLabel = itemUnitId ? (unitMap.get(itemUnitId) || "BOX") : "BOX";

                const dtId = item.discount_type ? Number(item.discount_type) : null;
                const dtName = dtId ? (discountTypeMap.get(dtId) || (typeof item.discount_type === "string" ? item.discount_type : "")) : "";

                const qty = Number(item.quantity) || 0;
                const price = Number(item.unit_price) || 0;
                const gross = Number(item.gross_amount) || (qty * price);
                const discount = Number(item.discount_amount ?? item.discount ?? 0);
                const net = Number(item.net_amount ?? item.total_amount ?? (gross - discount));

                return {
                    detail_id: Number(item.detail_id ?? item.invoice_detail_id ?? 0),
                    product_id: Number(item.product_id),
                    product_code: prod?.product_code || prod?.item_code || `PRD-${item.product_id}`,
                    product_name: prod?.description || prod?.product_name || "Unknown Product",
                    quantity: qty,
                    unit_price: price,
                    uom: uomLabel,
                    gross_amount: gross,
                    discount: discount,
                    discount_type_id: dtId,
                    discount_type_name: dtName || (discount > 0 ? "Discount" : "—"),
                    net_amount: net
                };
            });

            // Calculate or fallback totals
            const calcTotalAmount = items.reduce((sum, item) => sum + item.gross_amount, 0);
            const calcTotalDiscount = items.reduce((sum, item) => sum + item.discount, 0);

            const totalAmount = inv.gross_amount ?? (inv.total_amount ?? calcTotalAmount);
            const totalDiscount = inv.discount_amount ?? calcTotalDiscount;
            const netAmount = inv.net_amount ?? (totalAmount - totalDiscount);
            const vatAmount = inv.vat_amount ?? (netAmount * (12 / 112));

            return {
                invoice_id: inv.invoice_id,
                invoice_no: inv.invoice_no,
                order_id: inv.order_id,
                customer_code: inv.customer_code,
                invoice_date: inv.invoice_date,
                dispatch_date: inv.dispatch_date,
                due_date: inv.due_date,
                transaction_status: inv.transaction_status || "Prepared",
                payment_status: inv.payment_status || "Unpaid",
                total_amount: totalAmount,
                discount_amount: totalDiscount,
                net_amount: netAmount,
                vat_amount: vatAmount,
                remarks: inv.remarks,
                pdf: pdf ? {
                    id: pdf.id,
                    pdf_file: pdf.pdf_file,
                    filename_download: pdf.filename_download,
                    uploaded_at: pdf.uploaded_at,
                    url: `${DIRECTUS_URL}/assets/${pdf.pdf_file}`
                } : null,
                items
            };
        });

        return NextResponse.json({
            success: true,
            invoices: formattedInvoices
        });
    } catch (error) {
        console.error("API Error in sales-order invoices GET:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
