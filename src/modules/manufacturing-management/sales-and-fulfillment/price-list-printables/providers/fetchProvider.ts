import { Salesman, ProductType, Supplier, PriceListItem } from "../types";

const BASE_URL = "/api/manufacturing/sales-and-fulfillment/price-list-printables";

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string; details?: string }
        | null;
    return body?.error || body?.message || body?.details || `${fallback} (HTTP ${res.status})`;
}

export const fetchProvider = {
    async getSalesmen(): Promise<Salesman[]> {
        const res = await fetch(`${BASE_URL}?action=salesmen`, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(await parseErrorMessage(res, "Failed to fetch salesmen"));
        }
        return await res.json();
    },

    async getProductTypes(): Promise<ProductType[]> {
        const res = await fetch(`${BASE_URL}?action=product-types`, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(await parseErrorMessage(res, "Failed to fetch product types"));
        }
        return await res.json();
    },

    async getSuppliers(): Promise<Supplier[]> {
        const res = await fetch(`${BASE_URL}?action=suppliers`, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(await parseErrorMessage(res, "Failed to fetch suppliers"));
        }
        return await res.json();
    },

    async getCategory(categoryCode: string): Promise<{ category_name?: string }> {
        const res = await fetch(
            `${BASE_URL}?action=category&categoryCode=${encodeURIComponent(categoryCode)}`,
            { cache: "no-store" }
        );
        if (!res.ok) {
            throw new Error(await parseErrorMessage(res, `Failed to fetch category ${categoryCode}`));
        }
        return await res.json();
    },

    async getPriceList(params: {
        salesmanId: number;
        productTypeIds?: number[];
        supplierId?: number;
    }): Promise<PriceListItem[]> {
        const searchParams = new URLSearchParams({
            salesmanId: String(params.salesmanId),
        });
        if (params.productTypeIds && params.productTypeIds.length > 0) {
            searchParams.set("productTypeIds", params.productTypeIds.join(","));
        }
        if (params.supplierId !== undefined) {
            searchParams.set("supplierId", String(params.supplierId));
        }

        const res = await fetch(`${BASE_URL}?${searchParams.toString()}`, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(await parseErrorMessage(res, "Failed to fetch price list"));
        }
        return await res.json();
    },
};
