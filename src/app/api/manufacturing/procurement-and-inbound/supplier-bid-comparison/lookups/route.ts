import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (DIRECTUS_STATIC_TOKEN) {
        headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
    }
    return headers;
}

export async function GET() {
    try {
        const headers = getHeaders();

        // 1. Fetch Suppliers
        const suppliersPromise = fetch(
            `${DIRECTUS_URL}/items/suppliers?limit=-1&filter[isActive][_eq]=1&fields=id,supplier_name,contact_person,email_address,phone_number,country,supplier_type,is_foreign,currency,payment_terms,delivery_terms`,
            { headers, cache: "no-store" }
        )
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .catch(() => ({ data: [] }));

        // 2. Fetch Products
        const productsPromise = fetch(
            `${DIRECTUS_URL}/items/products?limit=-1&filter[isActive][_eq]=1&fields=product_id,product_name,product_code,unit_of_measurement,weight,net_weight,cbm_length,cbm_width,cbm_height,cbm_unit_id,weight_unit_id,estimated_unit_cost,cost_per_unit`,
            { headers, cache: "no-store" }
        )
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .catch(() => ({ data: [] }));

        // 3. Fetch Units (UOM)
        const unitsPromise = fetch(
            `${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut`,
            { headers, cache: "no-store" }
        )
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .catch(() => ({ data: [] }));

        // 4. Fetch Forex Configurations
        const forexPromise = fetch(
            `${DIRECTUS_URL}/items/forex_configurations?limit=-1&filter[is_active][_eq]=1&fields=forex_id,currency_code,currency_name,symbol,exchange_rate,effective_date`,
            { headers, cache: "no-store" }
        )
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .catch(() => ({ data: [] }));

        // 5. Fetch Supplier Evaluations
        const evaluationsPromise = fetch(
            `${DIRECTUS_URL}/items/supplier_evaluations?limit=-1&sort=-evaluated_at&fields=id,supplier_id,delivery_rating,quality_rating,price_rating,compliance_rating,overall_score,grade`,
            { headers, cache: "no-store" }
        )
            .then((r) => (r.ok ? r.json() : { data: [] }))
            .catch(() => ({ data: [] }));

        const [suppliersRes, productsRes, unitsRes, forexRes, evalsRes] = await Promise.all([
            suppliersPromise,
            productsPromise,
            unitsPromise,
            forexPromise,
            evaluationsPromise,
        ]);

        const unitsList = unitsRes.data || [];
        const unitsMap = new Map<number, string>(
            unitsList.map((u: any) => [u.unit_id, u.unit_shortcut || u.unit_name || "pcs"])
        );

        const mappedProducts = (productsRes.data || []).map((p: any) => ({
            productId: p.product_id,
            productName: p.product_name || "Unnamed Product",
            productCode: p.product_code || "",
            uom: unitsMap.get(p.unit_of_measurement) || "pcs",
            targetUnitPrice: p.cost_per_unit || p.estimated_unit_cost || 0,
            weightKg: p.net_weight || p.weight || 0,
            cbmLength: p.cbm_length || 0,
            cbmWidth: p.cbm_width || 0,
            cbmHeight: p.cbm_height || 0,
        }));

        const mappedSuppliers = (suppliersRes.data || []).map((s: any) => ({
            id: s.id,
            supplierName: s.supplier_name,
            contactPerson: s.contact_person || "",
            emailAddress: s.email_address || "",
            phoneNumber: s.phone_number || "",
            country: s.country || (s.is_foreign ? "China" : "Philippines"),
            isForeign: Boolean(s.is_foreign),
            supplierType: s.is_foreign ? "INTERNATIONAL" : "LOCAL",
            currency: s.currency || (s.is_foreign ? "USD" : "PHP"),
            paymentTerms: s.payment_terms || "",
            deliveryTerms: s.delivery_terms || "",
        }));

        const mappedUnits = (unitsRes.data || []).map((u: any) => ({
            unitId: u.unit_id,
            unitName: u.unit_name || "",
            unitShortcut: u.unit_shortcut || u.unit_name || "pcs",
        }));

        const mappedForex = (forexRes.data || []).map((f: any) => ({
            currencyCode: f.currency_code,
            currencyName: f.currency_name,
            exchangeRate: Number(f.exchange_rate) || 1.0,
            effectiveDate: f.effective_date,
        }));

        return NextResponse.json({
            success: true,
            suppliers: mappedSuppliers,
            products: mappedProducts,
            units: mappedUnits,
            forex: mappedForex,
            evaluations: evalsRes.data || [],
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: (error as Error).message || "Failed to fetch master lookup data",
                suppliers: [],
                products: [],
                forex: [],
                evaluations: [],
            },
            { status: 500 }
        );
    }
}
