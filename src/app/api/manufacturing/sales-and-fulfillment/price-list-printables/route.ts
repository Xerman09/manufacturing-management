import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth-utils";
import type { PriceListItem } from "@/modules/manufacturing-management/sales-and-fulfillment/price-list-printables/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINISHED_GOODS_PRODUCT_TYPE_ID = 388;
const DIRECTUS_ID_CHUNK_SIZE = 100;

type RelationIdInput =
    | number
    | string
    | { id?: number | string | null; product_id?: number | string | null; price_type_id?: number | string | null }
    | null
    | undefined;

interface DirectusProductTypeRow {
    id: number | string;
    name?: string | null;
    default_purchase_price_type_id?: number | null;
}

interface DirectusSalesmanRow {
    id: number | string;
    salesman_name?: string | null;
    salesman_code?: string | null;
    price_type?: string | null;
    price_type_id?: RelationIdInput;
}

interface DirectusProductRow {
    product_id: number | string;
    parent_id?: RelationIdInput;
    product_code?: string | null;
    product_name?: string | null;
    barcode?: string | null;
    product_category?: RelationIdInput;
    unit_of_measurement?: RelationIdInput;
    unit_of_measurement_count?: number | string | null;
    price_per_unit?: number | string | null;
    priceA?: number | string | null;
    priceB?: number | string | null;
    priceC?: number | string | null;
    priceD?: number | string | null;
    priceE?: number | string | null;
    has_bom?: boolean | number | string | null;
}

interface DirectusProductFilterMatchRow {
    product_code?: string | null;
    product_name?: string | null;
}

interface DirectusPriceTypeRow {
    price_type_id: number | string;
    price_type_name?: string | null;
}

interface DirectusProductPriceRow {
    product_id?: RelationIdInput;
    price?: number | string | null;
}

interface DirectusUnitRow {
    unit_id: number | string;
    unit_name?: string | null;
    unit_shortcut?: string | null;
}

function getDirectusConfig() {
    const directusUrl = (
        process.env.DIRECTUS_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        ""
    ).replace(/\/+$/, "");
    const directusToken = process.env.DIRECTUS_STATIC_TOKEN || "";

    if (!directusUrl) {
        throw new Error("DIRECTUS_URL / NEXT_PUBLIC_API_BASE_URL is not configured.");
    }
    if (!directusToken) {
        throw new Error("DIRECTUS_STATIC_TOKEN is not configured.");
    }

    return {
        directusUrl,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${directusToken}`,
        },
    };
}

function isFinishedGoodsProductTypeRow(pt: DirectusProductTypeRow): boolean {
    return (
        Number(pt.id) === FINISHED_GOODS_PRODUCT_TYPE_ID ||
        String(pt.name || "").toLowerCase().includes("finished")
    );
}

function extractRelationId(val: RelationIdInput): number | null {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "object") {
        const candidate = val.product_id ?? val.price_type_id ?? val.id;
        const n = Number(candidate);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function toNullablePrice(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

function normalizePriceTierCode(raw?: string | null): string {
    return String(raw ?? "")
        .trim()
        .toUpperCase()
        .replace(/^PRICE[\s_-]+/, "");
}

function resolveLegacyTierPrice(product: DirectusProductRow, tierLabel: string): number | null {
    const code = normalizePriceTierCode(tierLabel);
    if (code === "A") return toNullablePrice(product.priceA);
    if (code === "B") return toNullablePrice(product.priceB);
    if (code === "C") return toNullablePrice(product.priceC);
    if (code === "D") return toNullablePrice(product.priceD);
    if (code === "E") return toNullablePrice(product.priceE);
    if (code === "LIST" || code === "DEFAULT") return toNullablePrice(product.price_per_unit);
    return null;
}

function parseCsvPositiveIds(raw: string | null): number[] {
    if (!raw) return [];
    return Array.from(
        new Set(
            raw
                .split(",")
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n > 0)
        )
    );
}

function chunkIds(ids: number[], size: number): number[][] {
    const out: number[][] = [];
    for (let i = 0; i < ids.length; i += size) {
        out.push(ids.slice(i, i + size));
    }
    return out;
}

async function fetchDirectusJson<T>(url: string, headers: Record<string, string>, label: string): Promise<T> {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${label} from Directus (HTTP ${res.status})`);
    }
    const json = (await res.json()) as { data?: T };
    if (json.data === undefined) {
        throw new Error(`Unexpected Directus response for ${label}`);
    }
    return json.data;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action");
        const salesmanId = searchParams.get("salesmanId");
        const supplierId = searchParams.get("supplierId");
        const productTypeIds = parseCsvPositiveIds(
            searchParams.get("productTypeIds") || searchParams.get("productTypeId")
        );
        const springBaseUrl = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");

        if (action === "salesmen") {
            const { directusUrl, headers } = getDirectusConfig();
            const data = await fetchDirectusJson<DirectusSalesmanRow[]>(
                `${directusUrl}/items/salesman?filter[isActive][_eq]=1&limit=-1&fields=id,salesman_name,salesman_code,price_type,price_type_id`,
                headers,
                "salesmen"
            );
            return NextResponse.json(data || []);
        }

        if (action === "product-types") {
            const { directusUrl, headers } = getDirectusConfig();
            const rows = await fetchDirectusJson<DirectusProductTypeRow[]>(
                `${directusUrl}/items/product_type?limit=-1&fields=id,name,default_purchase_price_type_id&sort=name`,
                headers,
                "product types"
            );
            return NextResponse.json(rows || []);
        }

        if (action === "suppliers") {
            const { directusUrl, headers } = getDirectusConfig();
            const data = await fetchDirectusJson<Array<Record<string, unknown>>>(
                `${directusUrl}/items/suppliers?filter[supplier_type][_in]=TRADE,Trade&limit=-1&fields=id,supplier_name,supplier_shortcut`,
                headers,
                "suppliers"
            );
            return NextResponse.json(data || []);
        }

        if (action === "category") {
            const categoryCode = searchParams.get("categoryCode");
            if (!categoryCode) {
                return NextResponse.json({ error: "categoryCode is required" }, { status: 400 });
            }
            const { directusUrl, headers } = getDirectusConfig();
            const data = await fetchDirectusJson<Record<string, unknown>>(
                `${directusUrl}/items/categories/${encodeURIComponent(categoryCode)}`,
                headers,
                `category ${categoryCode}`
            );
            return NextResponse.json(data || {});
        }

        if (!salesmanId) {
            return NextResponse.json(
                { error: "salesmanId is required" },
                { status: 400 }
            );
        }

        // Branch 1: Supplier-based pricelist via Spring Boot (optionally filtered by selected productTypeIds)
        if (supplierId) {
            if (!springBaseUrl) {
                return NextResponse.json(
                    { error: "SPRING_API_BASE_URL is not configured" },
                    { status: 500 }
                );
            }

            const cookieStore = await cookies();
            const token = cookieStore.get(COOKIE_NAME)?.value;
            if (!token) {
                return NextResponse.json(
                    { error: "Authentication required" },
                    { status: 401 }
                );
            }

            const url = `${springBaseUrl}/api/product-pricing?salesmanId=${encodeURIComponent(salesmanId)}&supplierId=${encodeURIComponent(supplierId)}`;

            const response = await fetch(url, {
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                return NextResponse.json(
                    { error: "Failed to fetch from Spring Boot", details: errorText },
                    { status: response.status }
                );
            }

            const data = (await response.json()) as PriceListItem[];

            if (productTypeIds.length === 0) {
                return NextResponse.json(data);
            }

            const { directusUrl, headers } = getDirectusConfig();
            const matchedProducts = await fetchDirectusJson<DirectusProductFilterMatchRow[]>(
                `${directusUrl}/items/products?filter[product_type][_in]=${productTypeIds.join(",")}&limit=-1&fields=product_code,product_name`,
                headers,
                "product type scope"
            );

            const allowedCodes = new Set<string>();
            const allowedNames = new Set<string>();
            for (const p of matchedProducts || []) {
                const code = String(p.product_code ?? "").trim().toLowerCase();
                const name = String(p.product_name ?? "").trim().toLowerCase();
                if (code) allowedCodes.add(code);
                if (name) allowedNames.add(name);
            }

            const filteredData = (data || []).filter((item) => {
                const code = String(item.productCode ?? "").trim().toLowerCase();
                if (code) return allowedCodes.has(code);
                const name = String(item.productName ?? "").trim().toLowerCase();
                return Boolean(name && allowedNames.has(name));
            });

            return NextResponse.json(filteredData);
        }

        // Branch 2: In-house Finished Goods without Supplier (selected Finished Goods productTypeIds + has_bom=1 + all parent/child unit variants)
        if (productTypeIds.length === 0) {
            return NextResponse.json(
                { error: "Supplier is required unless selecting Finished Goods" },
                { status: 400 }
            );
        }

        const { directusUrl, headers } = getDirectusConfig();
        const selectedTypeRows = await fetchDirectusJson<DirectusProductTypeRow[]>(
            `${directusUrl}/items/product_type?filter[id][_in]=${productTypeIds.join(",")}&limit=-1&fields=id,name`,
            headers,
            "selected product types"
        );

        const isFinishedGoodsOnly =
            selectedTypeRows.length > 0 && selectedTypeRows.every(isFinishedGoodsProductTypeRow);

        if (!isFinishedGoodsOnly) {
            return NextResponse.json(
                { error: "Supplier is required for non-Finished Goods product types" },
                { status: 400 }
            );
        }

        const productFields =
            "product_id,parent_id,product_code,product_name,barcode,product_category,unit_of_measurement,unit_of_measurement_count,price_per_unit,priceA,priceB,priceC,priceD,priceE,has_bom";

        const [salesman, seedProducts, priceTypes, units] = await Promise.all([
            fetchDirectusJson<DirectusSalesmanRow>(
                `${directusUrl}/items/salesman/${encodeURIComponent(salesmanId)}?fields=id,salesman_name,salesman_code,price_type,price_type_id`,
                headers,
                "salesman"
            ),
            fetchDirectusJson<DirectusProductRow[]>(
                `${directusUrl}/items/products?filter[isActive][_eq]=1&filter[product_type][_in]=${productTypeIds.join(",")}&filter[has_bom][_eq]=1&limit=-1&fields=${productFields}&sort=product_name`,
                headers,
                "finished goods products"
            ),
            fetchDirectusJson<DirectusPriceTypeRow[]>(
                `${directusUrl}/items/price_types?filter[is_active][_eq]=1&limit=-1&fields=price_type_id,price_type_name`,
                headers,
                "price types"
            ),
            fetchDirectusJson<DirectusUnitRow[]>(
                `${directusUrl}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut`,
                headers,
                "units"
            ),
        ]);

        const productsById = new Map<number, DirectusProductRow>();
        const groupIdSet = new Set<number>();

        for (const p of seedProducts || []) {
            const prodId = Number(p.product_id);
            const hasBom = p.has_bom === 1 || p.has_bom === true || String(p.has_bom) === "1";
            if (!Number.isFinite(prodId) || prodId <= 0 || !hasBom) continue;
            productsById.set(prodId, p);
            const parentId = extractRelationId(p.parent_id);
            groupIdSet.add(parentId ?? prodId);
        }

        // Fetch all active parent & child variant products belonging to those product groups
        const groupIds = Array.from(groupIdSet);
        if (groupIds.length > 0) {
            const idChunks = chunkIds(groupIds, DIRECTUS_ID_CHUNK_SIZE);
            const familyPages = await Promise.all(
                idChunks.map((chunk) => {
                    const csv = chunk.join(",");
                    const url = `${directusUrl}/items/products?filter[isActive][_eq]=1&filter[_or][0][product_id][_in]=${csv}&filter[_or][1][parent_id][_in]=${csv}&limit=-1&fields=${productFields}`;
                    return fetchDirectusJson<DirectusProductRow[]>(url, headers, "child product variants");
                })
            );
            for (const rows of familyPages) {
                for (const row of rows || []) {
                    const prodId = Number(row.product_id);
                    if (Number.isFinite(prodId) && prodId > 0) {
                        productsById.set(prodId, row);
                    }
                }
            }
        }

        const salesmanPriceTypeId = extractRelationId(salesman?.price_type_id);
        const salesmanPriceCode = normalizePriceTierCode(salesman?.price_type);

        const matchedPriceType = (priceTypes || []).find((pt) => {
            if (salesmanPriceTypeId !== null && Number(pt.price_type_id) === salesmanPriceTypeId) {
                return true;
            }
            if (salesmanPriceCode && normalizePriceTierCode(pt.price_type_name) === salesmanPriceCode) {
                return true;
            }
            return false;
        });

        const resolvedPriceTypeId =
            salesmanPriceTypeId ??
            (matchedPriceType ? Number(matchedPriceType.price_type_id) : null);
        const resolvedPriceTypeLabel =
            matchedPriceType?.price_type_name || salesman?.price_type || "-";

        const priceByProductId = new Map<number, number>();
        if (resolvedPriceTypeId !== null) {
            const priceRows = await fetchDirectusJson<DirectusProductPriceRow[]>(
                `${directusUrl}/items/product_per_price_type?filter[price_type_id][_eq]=${resolvedPriceTypeId}&limit=-1&fields=product_id,price`,
                headers,
                "product price rules"
            );
            for (const row of priceRows || []) {
                const prodId = extractRelationId(row.product_id);
                const price = toNullablePrice(row.price);
                if (prodId !== null && price !== null) {
                    priceByProductId.set(prodId, price);
                }
            }
        }

        const unitMap = new Map<number, DirectusUnitRow>();
        for (const u of units || []) {
            const uid = Number(u.unit_id);
            if (Number.isFinite(uid) && uid > 0) {
                unitMap.set(uid, u);
            }
        }

        const items: PriceListItem[] = [];
        for (const product of productsById.values()) {
            const prodId = Number(product.product_id);
            if (!Number.isFinite(prodId) || prodId <= 0) continue;

            const parentId = extractRelationId(product.parent_id);
            const parentRow = parentId !== null ? productsById.get(parentId) : undefined;

            const categoryId =
                extractRelationId(product.product_category) ??
                extractRelationId(parentRow?.product_category);
            const unitId = extractRelationId(product.unit_of_measurement);
            const unitRow = unitId !== null ? unitMap.get(unitId) : undefined;
            const unitLabel = String(unitRow?.unit_name || unitRow?.unit_shortcut || "").trim() || "-";

            const matrixPrice = priceByProductId.get(prodId) ?? null;
            const resolvedPrice =
                matrixPrice !== null
                    ? matrixPrice
                    : resolveLegacyTierPrice(product, resolvedPriceTypeLabel);

            const pckgRaw = Number(product.unit_of_measurement_count);
            const pckg = Number.isFinite(pckgRaw) && pckgRaw > 0 ? pckgRaw : 1;

            items.push({
                productId: prodId,
                parentId,
                groupName: String(parentRow?.product_name || product.product_name || "-"),
                categoryCode: categoryId !== null ? String(categoryId) : "",
                productCode: product.product_code ? String(product.product_code) : "",
                productName: String(product.product_name || "-"),
                pckg,
                unit: unitLabel,
                price: resolvedPrice,
                priceType: resolvedPriceTypeLabel,
                barcodeNo: product.barcode ? String(product.barcode) : "",
            });
        }

        items.sort((a, b) => {
            const catCmp = a.categoryCode.localeCompare(b.categoryCode);
            if (catCmp !== 0) return catCmp;
            const groupCmp = (a.groupName || a.productName).localeCompare(b.groupName || b.productName);
            if (groupCmp !== 0) return groupCmp;
            const isChildA = a.parentId ? 1 : 0;
            const isChildB = b.parentId ? 1 : 0;
            if (isChildA !== isChildB) return isChildA - isChildB;
            if (a.pckg !== b.pckg) return a.pckg - b.pckg;
            return a.unit.localeCompare(b.unit);
        });

        return NextResponse.json(items);
    } catch (err: unknown) {
        return NextResponse.json(
            {
                error: err instanceof Error ? err.message : "Internal Server Error",
                details: err instanceof Error ? err.message : String(err),
            },
            { status: 500 }
        );
    }
}
