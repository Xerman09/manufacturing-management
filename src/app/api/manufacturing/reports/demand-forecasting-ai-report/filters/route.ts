import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizeDemandForecastingReport } from "../auth";
import { classifyInventoryPolicy, resolveCustomerRegion } from "../_forecast-engine";
import type {
    FilterBranchOption,
    FilterCatalogPayload,
    FilterProductOption,
    FilterRegionOption
} from "@/modules/manufacturing-management/demand-forecasting-ai-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusRow = Record<string, unknown>;

function parseParentId(val: unknown): number | null {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "object" && val !== null) {
        const inner = (val as Record<string, unknown>).product_id;
        const n = Number(inner);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    }
    const n = Number(val);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function parsePositiveMultiplier(val: unknown): number {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

async function fetchDirectusStrict(
    collection: string,
    params: URLSearchParams,
    signal?: AbortSignal
): Promise<DirectusRow[]> {
    const url = `${DIRECTUS_URL}/items/${collection}?${params.toString()}`;
    const res = await fetch(url, { headers, cache: "no-store", signal });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Directus ${collection} failed (HTTP ${res.status}): ${text.slice(0, 160)}`);
    }
    const json = await res.json();
    return Array.isArray(json?.data) ? (json.data as DirectusRow[]) : [];
}

export async function GET(request: Request) {
    const access = await authorizeDemandForecastingReport(request.signal);
    if (!access.ok) {
        return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
        const [branchRows, productRows, categoryRows, unitRows, customerRows] =
            await Promise.all([
                fetchDirectusStrict(
                    "branches",
                    new URLSearchParams({
                        "filter[isActive][_eq]": "1",
                        fields: "id,branch_code,branch_name,isActive,isBadStock",
                        limit: "-1",
                        sort: "branch_name"
                    }),
                    request.signal
                ),
                fetchDirectusStrict(
                    "products",
                    new URLSearchParams({
                        "filter[isActive][_eq]": "1",
                        fields: "product_id,parent_id,product_code,product_name,product_category,unit_of_measurement,unit_of_measurement_count,inventory_type,product_shelf_life",
                        limit: "-1",
                        sort: "product_name"
                    }),
                    request.signal
                ),
                fetchDirectusStrict(
                    "categories",
                    new URLSearchParams({
                        fields: "category_id,category_name",
                        limit: "-1"
                    }),
                    request.signal
                ),
                fetchDirectusStrict(
                    "units",
                    new URLSearchParams({
                        fields: "unit_id,unit_shortcut,unit_name",
                        limit: "-1"
                    }),
                    request.signal
                ),
                fetchDirectusStrict(
                    "customer",
                    new URLSearchParams({
                        fields: "customer_code,province,city",
                        limit: "-1"
                    }),
                    request.signal
                )
            ]);

        const categoryMap = new Map<number, string>();
        for (const c of categoryRows) {
            categoryMap.set(Number(c.category_id), String(c.category_name || "Uncategorized"));
        }

        const unitMap = new Map<number, string>();
        for (const u of unitRows) {
            unitMap.set(
                Number(u.unit_id),
                String(u.unit_shortcut || u.unit_name || "PCS").trim()
            );
        }

        const branches: FilterBranchOption[] = branchRows
            .filter((b) => {
                const active = b.isActive === 1 || b.isActive === "1" || b.isActive === true;
                const badStock = b.isBadStock === 1 || b.isBadStock === "1" || b.isBadStock === true;
                return active && !badStock;
            })
            .map((b) => ({
                id: Number(b.id),
                code: String(b.branch_code || `B-${b.id}`),
                name: String(b.branch_name || `Branch ${b.id}`)
            }));

        // Resolve base unit label per family solely for UOM conversion hints, while listing every parent & child product individually
        const baseUnitByFamily = new Map<number, string>();
        const nameCounts = new Map<string, number>();

        for (const p of productRows) {
            const pid = Number(p.product_id);
            if (!pid) continue;
            const parentId = parseParentId(p.parent_id);
            const familyId = parentId && parentId !== pid ? parentId : pid;
            const mult = parsePositiveMultiplier(p.unit_of_measurement_count);
            const uLabel = unitMap.get(Number(p.unit_of_measurement)) || "PCS";
            if (mult === 1 || !baseUnitByFamily.has(familyId)) {
                baseUnitByFamily.set(familyId, uLabel);
            }
            const rawName = String(p.product_name || `Product #${pid}`).trim();
            nameCounts.set(rawName.toLowerCase(), (nameCounts.get(rawName.toLowerCase()) || 0) + 1);
        }

        const products: FilterProductOption[] = productRows
            .map((p): FilterProductOption | null => {
                const pid = Number(p.product_id);
                if (!pid) return null;
                const parentId = parseParentId(p.parent_id);
                const isChild = Boolean(parentId && parentId !== pid);
                const familyId = isChild ? parentId! : pid;
                const mult = parsePositiveMultiplier(p.unit_of_measurement_count);
                const unitLabel = unitMap.get(Number(p.unit_of_measurement)) || "PCS";
                const baseUnitLabel = baseUnitByFamily.get(familyId) || "PCS";
                const catName = categoryMap.get(Number(p.product_category)) || "General";
                const rawName = String(p.product_name || `Product #${pid}`).trim();
                const code = String(p.product_code || `SKU-${pid}`);

                const hasDuplicateName = (nameCounts.get(rawName.toLowerCase()) || 0) > 1;
                const displayName = hasDuplicateName
                    ? `${rawName} (${unitLabel}${mult > 1 ? ` ×${mult}` : ""})`
                    : rawName;

                const uomDetail =
                    mult > 1
                        ? `${unitLabel} (1=${mult} ${baseUnitLabel})`
                        : unitLabel;

                return {
                    id: pid,
                    code,
                    name: displayName,
                    categoryName: `${catName} · ${isChild ? "Child" : "Parent"} · ${uomDetail}`,
                    unitLabel: mult > 1 ? baseUnitLabel : unitLabel,
                    inventoryPolicy: classifyInventoryPolicy(
                        p.product_shelf_life ? Number(p.product_shelf_life) : null
                    )
                };
            })
            .filter((item): item is FilterProductOption => item !== null)
            .sort((a, b) => a.name.localeCompare(b.name));

        const regionCounts = new Map<string, FilterRegionOption>();

        for (const cust of customerRows) {
            const reg = resolveCustomerRegion(cust.province, cust.city);
            const existing = regionCounts.get(reg.key);
            if (existing) {
                existing.customerCount += 1;
            } else {
                regionCounts.set(reg.key, {
                    key: reg.key,
                    label: reg.label,
                    source: reg.source,
                    customerCount: 1
                });
            }
        }

        const regions = Array.from(regionCounts.values())
            .filter((r) => r.customerCount > 0)
            .sort((a, b) => {
                if (a.source === "unmapped" && b.source !== "unmapped") return 1;
                if (a.source !== "unmapped" && b.source === "unmapped") return -1;
                return a.label.localeCompare(b.label);
            });

        const payload: FilterCatalogPayload = { branches, products, regions };
        return NextResponse.json(payload);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Failed to load demand forecast filter catalogs.";
        return NextResponse.json({ error: message }, { status: 503 });
    }
}
