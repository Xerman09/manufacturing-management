export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";
import { DIRECTUS_URL, headers } from "../../services/core-api.service";
import {
    getAvailableInventoryLots,
    type AvailableInventoryLot,
    MmInventoryMovementError
} from "./inventory-helper";

import { calculateProductionFeasibility } from "@/modules/manufacturing-management/overview-and-planning/raw-materials-to-finished-goods-projection/utils/feasibility-calculator";

import type {
    BOMDefinition,
    BOMComponentDefinition,
    StockInventoryItem,
    DensityFactorItem,
    CapacityCalculationMode,
    MaterialClassification
} from "@/modules/manufacturing-management/overview-and-planning/raw-materials-to-finished-goods-projection/types";

interface DirectusProduct {
    product_id: number;
    product_name?: string | null;
    description?: string | null;
    product_code?: string | null;
    unit_of_measurement?: number | { id?: number; unit_id?: number; name?: string; unit_name?: string } | null;
    product_type?: number | { id?: number; type_id?: number; name?: string } | null;
}

interface DirectusVersion {
    version_id: number;
    product_id: number;
    version_name: string;
    base_quantity: number | string;
    uom_id: number | { id?: number; unit_id?: number; name?: string; unit_name?: string };
    expected_yield_percentage?: number | string | null;
    status: string;
    is_primary?: boolean | number;
    valid_from?: string | null;
    valid_to?: string | null;
}

interface DirectusRoute {
    route_id: number;
    version_id: number;
    sequence_order?: number;
    step_batch_size?: number | string | null;
}

interface DirectusRouteBOM {
    id: number;
    route_id: number;
    product_id: number;
    quantity_required: number | string;
    unit_of_measurement: number | { id?: number; unit_id?: number; name?: string; unit_name?: string };
    wastage_factor_percentage?: number | string | null;
    cost_per_unit?: number | string | null;
}

interface UnitInfo {
    id: number;
    name: string;
    code?: string;
}

/**
 * Extracts and validates user session from cookies or Bearer token header.
 */
async function authenticateRequest(request: Request): Promise<{ ok: boolean; userId?: number; error?: string }> {
    try {
        let cookieToken: string | undefined;
        try {
            const cookieStore = await cookies();
            cookieToken = cookieStore.get("vos_access_token")?.value ||
                cookieStore.get("springboot_token")?.value ||
                cookieStore.get("token")?.value;
        } catch {
            // Outside Next.js AsyncLocalStorage context (e.g. integration tests), parse Cookie header
            const cookieHeader = request.headers.get("cookie");
            if (cookieHeader) {
                const match = cookieHeader.match(/(?:vos_access_token|springboot_token|token)=([^;]+)/);
                if (match) cookieToken = match[1].trim();
            }
        }

        const authHeader = request.headers.get("authorization")?.trim();
        const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
        const token = cookieToken || bearerToken;

        if (!token) {
            return { ok: false, error: "Unauthorized: Missing authentication session." };
        }

        const payload = decodeJwtPayload(token);
        if (!payload) {
            return { ok: false, error: "Unauthorized: Invalid session token." };
        }

        if (payload.exp && payload.exp < Date.now() / 1000) {
            return { ok: false, error: "Unauthorized: Session token has expired." };
        }

        const rawId = payload.id || payload.user_id || payload.userId || payload.sub;
        const userId = Number(rawId);
        return { ok: true, userId: Number.isSafeInteger(userId) ? userId : undefined };
    } catch {
        return { ok: false, error: "Unauthorized: Failed to authenticate session." };
    }
}

interface DirectusUnitRow {
    id?: number | string;
    unit_id?: number | string;
    name?: string | null;
    unit_name?: string | null;
    code?: string | null;
    unit_code?: string | null;
}

interface DirectusDensityRow {
    id: number | string;
    name?: string | null;
    density?: number | string | null;
    description?: string | null;
}

/**
 * Fetch and map units dictionary from Directus.
 */
async function fetchUnitsMap(): Promise<Map<number, UnitInfo>> {
    const unitsMap = new Map<number, UnitInfo>();
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" });
        if (res.ok) {
            const body = await res.json();
            const rows: DirectusUnitRow[] = Array.isArray(body?.data) ? body.data : [];
            rows.forEach((row) => {
                const id = Number(row.id || row.unit_id);
                if (id > 0) {
                    const name = String(row.name || row.unit_name || row.code || row.unit_code || `Unit #${id}`).trim();
                    const code = String(row.code || row.unit_code || name).trim();
                    unitsMap.set(id, { id, name, code });
                }
            });
        }
    } catch (e) {
        console.warn("Failed to load units dictionary:", e);
    }
    return unitsMap;
}

/**
 * Fetch active density factors for volumetric-to-mass conversions.
 */
async function fetchDensityFactors(): Promise<DensityFactorItem[]> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/density_factors?filter[isActive][_eq]=true&limit=-1`, {
            headers,
            cache: "no-store"
        });
        if (res.ok) {
            const body = await res.json();
            const rows: DirectusDensityRow[] = Array.isArray(body?.data) ? body.data : [];
            return rows.map((r) => ({
                id: r.id,
                name: String(r.name || "").trim(),
                density: Number(r.density || 0),
                description: r.description ? String(r.description) : null
            })).filter((df: DensityFactorItem) => df.density > 0 && Boolean(df.name));
        }
    } catch (e) {
        console.warn("Failed to load density factors:", e);
    }
    return [];
}

interface PackagingProductInfo {
    productId: number;
    productName: string;
    productCode: string;
    multiplier: number;
    uomName: string;
}

/**
 * Discovers child packaging products (e.g. Cases containing Bags)
 * and computes the normalization multiplier into the base product's recipe unit.
 */
async function fetchPackagingProducts(
    baseProductId: number,
    unitsMap: Map<number, UnitInfo>
): Promise<PackagingProductInfo[]> {
    const packagingList: PackagingProductInfo[] = [];
    try {
        const baseRes = await fetch(
            `${DIRECTUS_URL}/items/products/${baseProductId}?fields=product_id,product_code,product_name,description,unit_of_measurement,unit_of_measurement_count,weight,parent_id`,
            { headers, cache: "no-store" }
        );
        if (!baseRes.ok) return packagingList;
        const baseData = (await baseRes.json())?.data;
        if (!baseData) return packagingList;

        const baseCount = Number(baseData.unit_of_measurement_count) || 1;
        const baseWeight = Number(baseData.weight) || 0;

        // Query active child products where parent_id = baseProductId
        const childrenRes = await fetch(
            `${DIRECTUS_URL}/items/products?filter[parent_id][_eq]=${baseProductId}&filter[isActive][_eq]=1&fields=product_id,product_code,product_name,description,unit_of_measurement,unit_of_measurement_count,weight&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (childrenRes.ok) {
            const body = await childrenRes.json();
            const children: Record<string, unknown>[] = Array.isArray(body?.data) ? body.data : [];
            for (const child of children) {
                const childId = Number(child.product_id);
                if (childId > 0 && childId !== baseProductId) {
                    const childCount = Number(child.unit_of_measurement_count) || 0;
                    const childWeight = Number(child.weight) || 0;
                    let multiplier = 1;
                    if (childCount > 0 && baseCount > 0) {
                        multiplier = childCount / baseCount;
                    } else if (childWeight > 0 && baseWeight > 0) {
                        multiplier = childWeight / baseWeight;
                    }

                    const uomId = typeof child.unit_of_measurement === "object"
                        ? Number((child.unit_of_measurement as { id?: number; unit_id?: number })?.unit_id || (child.unit_of_measurement as { id?: number })?.id)
                        : Number(child.unit_of_measurement);
                    const uomInfo = unitsMap.get(uomId);
                    const uomName = uomInfo?.name || "units";

                    packagingList.push({
                        productId: childId,
                        productName: String(child.description || child.product_name || `Product #${childId}`).trim(),
                        productCode: child.product_code ? String(child.product_code).trim() : "",
                        multiplier,
                        uomName
                    });
                }
            }
        }
    } catch (e) {
        console.warn(`Failed to fetch packaging products for product #${baseProductId}:`, e);
    }
    return packagingList;
}

/**
 * Loads both direct lots and convertible packaging lots for a component,
 * normalizing all quantities to the component's required recipe unit.
 */
async function loadNormalizedComponentLots(
    productId: number,
    branchId: number,
    unitsMap: Map<number, UnitInfo>,
    baseUomName: string
): Promise<{
    lots: AvailableInventoryLot[];
    totalOnHand: number;
    totalAvailable: number;
    convertiblePackagingSummary?: string;
}> {
    const directLots: AvailableInventoryLot[] = await getAvailableInventoryLots(productId, branchId);
    const packagingProducts = await fetchPackagingProducts(productId, unitsMap);

    const packagingLots: AvailableInventoryLot[] = [];

    await Promise.all(
        packagingProducts.map(async (pkg) => {
            try {
                const childLots = await getAvailableInventoryLots(pkg.productId, branchId);
                for (const lot of childLots) {
                    const rawAvailable = Number(lot.available) || 0;
                    const rawPhysical = Number(lot.physicalQuantity ?? lot.available) || 0;
                    const normalizedAvailable = rawAvailable * pkg.multiplier;
                    const normalizedPhysical = rawPhysical * pkg.multiplier;

                    packagingLots.push({
                        ...lot,
                        available: normalizedAvailable,
                        physicalQuantity: normalizedPhysical,
                        isConvertiblePackaging: true,
                        packagingProductName: pkg.productName,
                        packagingProductCode: pkg.productCode,
                        originalQuantity: rawAvailable,
                        originalUomName: pkg.uomName,
                        conversionRatio: pkg.multiplier,
                        packagingNote: `${rawAvailable.toLocaleString()} ${pkg.uomName} (1 ${pkg.uomName} = ${pkg.multiplier} ${baseUomName})`
                    });
                }
            } catch (err) {
                console.warn(`Failed loading lots for packaging product #${pkg.productId}:`, err);
            }
        })
    );

    const allLots = [...directLots, ...packagingLots];
    allLots.sort((left, right) => {
        const leftExpiry = left.expiryDate ? Date.parse(left.expiryDate) : Number.MAX_SAFE_INTEGER;
        const rightExpiry = right.expiryDate ? Date.parse(right.expiryDate) : Number.MAX_SAFE_INTEGER;
        const safeLeftExpiry = Number.isFinite(leftExpiry) ? leftExpiry : Number.MAX_SAFE_INTEGER;
        const safeRightExpiry = Number.isFinite(rightExpiry) ? rightExpiry : Number.MAX_SAFE_INTEGER;
        if (safeLeftExpiry !== safeRightExpiry) return safeLeftExpiry - safeRightExpiry;

        const leftMfg = left.manufacturingDate ? Date.parse(left.manufacturingDate) : Number.MAX_SAFE_INTEGER;
        const rightMfg = right.manufacturingDate ? Date.parse(right.manufacturingDate) : Number.MAX_SAFE_INTEGER;
        const safeLeftMfg = Number.isFinite(leftMfg) ? leftMfg : Number.MAX_SAFE_INTEGER;
        const safeRightMfg = Number.isFinite(rightMfg) ? rightMfg : Number.MAX_SAFE_INTEGER;
        return safeLeftMfg - safeRightMfg;
    });

    const totalOnHand = allLots.reduce((sum, l) => sum + (Number(l.physicalQuantity ?? l.available) || 0), 0);
    const totalAvailable = allLots.reduce((sum, l) => sum + (Number(l.available) || 0), 0);
    const totalPackagingNormalized = packagingLots.reduce((sum, l) => sum + (Number(l.available) || 0), 0);
    const convertiblePackagingSummary = totalPackagingNormalized > 0
        ? `+${totalPackagingNormalized.toLocaleString()} ${baseUomName} from convertible packaging`
        : undefined;

    return {
        lots: allLots,
        totalOnHand,
        totalAvailable,
        convertiblePackagingSummary
    };
}

/**
 * Recursively assemble a full BOMDefinition from Directus.
 */
async function loadBOMDefinition(
    productId: number,
    preferredVersionId: number | null,
    unitsMap: Map<number, UnitInfo>,
    visitedProducts = new Set<number>()
): Promise<{ bom: BOMDefinition | null; diagnostic?: string }> {
    if (visitedProducts.has(productId)) {
        return {
            bom: null,
            diagnostic: `Cyclic BOM relationship detected involving product ID ${productId}.`
        };
    }
    visitedProducts.add(productId);

    // 1. Fetch Product header
    const prodRes = await fetch(
        `${DIRECTUS_URL}/items/products/${productId}?fields=product_id,product_name,description,product_code,unit_of_measurement,product_type`,
        { headers, cache: "no-store" }
    );
    if (!prodRes.ok) {
        return { bom: null, diagnostic: `Product #${productId} could not be loaded.` };
    }
    const prodData: DirectusProduct = (await prodRes.json())?.data;
    if (!prodData) {
        return { bom: null, diagnostic: `Product #${productId} does not exist.` };
    }

    // 2. Fetch Version
    let targetVersion: DirectusVersion | null = null;
    if (preferredVersionId && preferredVersionId > 0) {
        const verRes = await fetch(
            `${DIRECTUS_URL}/items/product_manufacturing_version/${preferredVersionId}?fields=*`,
            { headers, cache: "no-store" }
        );
        if (verRes.ok) {
            targetVersion = (await verRes.json())?.data || null;
        }
    }

    if (!targetVersion) {
        // Query active versions for this product
        const filter = encodeURIComponent(JSON.stringify({
            _and: [
                { product_id: { _eq: productId } },
                { status: { _eq: "Active" } }
            ]
        }));
        const versRes = await fetch(
            `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${filter}&sort=-is_primary,-version_id&limit=5`,
            { headers, cache: "no-store" }
        );
        if (versRes.ok) {
            const list: DirectusVersion[] = (await versRes.json())?.data || [];
            targetVersion = list.find((v) => Number(v.is_primary) === 1 || v.is_primary === true) || list[0] || null;
        }
    }

    if (!targetVersion) {
        return {
            bom: null,
            diagnostic: `No active approved BOM version found for "${prodData.description || prodData.product_name || `Product #${productId}`}".`
        };
    }

    if (String(targetVersion.status || "").toLowerCase() !== "active") {
        return {
            bom: null,
            diagnostic: `BOM version "${targetVersion.version_name}" is not approved or active (status: ${targetVersion.status}).`
        };
    }

    // Date validity check (valid_from / valid_to)
    const today = new Date().toISOString().slice(0, 10);
    if (targetVersion.valid_from && targetVersion.valid_from > today) {
        return {
            bom: null,
            diagnostic: `BOM version "${targetVersion.version_name}" is not yet effective (effective from ${targetVersion.valid_from}).`
        };
    }
    if (targetVersion.valid_to && targetVersion.valid_to < today) {
        return {
            bom: null,
            diagnostic: `BOM version "${targetVersion.version_name}" has expired (expired on ${targetVersion.valid_to}).`
        };
    }

    // Resolve Version UOM
    const versionUomId = typeof targetVersion.uom_id === "object"
        ? Number(targetVersion.uom_id?.unit_id || targetVersion.uom_id?.id)
        : Number(targetVersion.uom_id);
    const resolvedUom = unitsMap.get(versionUomId) || { id: versionUomId, name: "units" };

    // 3. Fetch Routes
    const routesRes = await fetch(
        `${DIRECTUS_URL}/items/manufacturing_routes?filter[version_id][_eq]=${targetVersion.version_id}&sort=sequence_order&limit=-1`,
        { headers, cache: "no-store" }
    );
    const routes: DirectusRoute[] = routesRes.ok ? (await routesRes.json())?.data || [] : [];
    const routeIds = routes.map((r) => r.route_id).filter((id) => Number(id) > 0);

    if (routeIds.length === 0) {
        return {
            bom: null,
            diagnostic: `BOM version "${targetVersion.version_name}" has no defined manufacturing routing steps.`
        };
    }

    // Step batch size from bottleneck or primary route step
    const stepBatchSize = Number(routes[0]?.step_batch_size) || Number(targetVersion.base_quantity) || 1;

    // 4. Fetch BOM Items
    const bomFilter = encodeURIComponent(JSON.stringify({ route_id: { _in: routeIds } }));
    const bomRes = await fetch(
        `${DIRECTUS_URL}/items/manufacturing_routes_bom?filter=${bomFilter}&limit=-1`,
        { headers, cache: "no-store" }
    );
    const bomRows: DirectusRouteBOM[] = bomRes.ok ? (await bomRes.json())?.data || [] : [];

    if (bomRows.length === 0) {
        return {
            bom: null,
            diagnostic: `BOM version "${targetVersion.version_name}" has no required material component items.`
        };
    }

    // Fetch product details for all child components
    const childProdIds = Array.from(new Set(bomRows.map((r) => Number(r.product_id)).filter((id) => id > 0)));
    const childProdsMap = new Map<number, DirectusProduct>();
    if (childProdIds.length > 0) {
        const cpFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: childProdIds } }));
        const cpRes = await fetch(
            `${DIRECTUS_URL}/items/products?filter=${cpFilter}&fields=product_id,product_name,description,product_code,unit_of_measurement,product_type&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (cpRes.ok) {
            const list: DirectusProduct[] = (await cpRes.json())?.data || [];
            list.forEach((p) => childProdsMap.set(Number(p.product_id), p));
        }
    }

    // Check which components have active manufacturing versions (sub-assemblies)
    const subVerFilter = encodeURIComponent(JSON.stringify({
        _and: [
            { product_id: { _in: childProdIds } },
            { status: { _eq: "Active" } }
        ]
    }));
    const subVersRes = await fetch(
        `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${subVerFilter}&fields=version_id,product_id,is_primary&limit=-1`,
        { headers, cache: "no-store" }
    );
    const subVersList: Array<{ version_id: number; product_id: number; is_primary?: boolean | number }> =
        subVersRes.ok ? (await subVersRes.json())?.data || [] : [];

    const subVerByProdId = new Map<number, number>();
    subVersList.forEach((v) => {
        const pid = Number(v.product_id);
        const vid = Number(v.version_id);
        if (!subVerByProdId.has(pid) || Number(v.is_primary) === 1) {
            subVerByProdId.set(pid, vid);
        }
    });

    // 5. Assemble BOM components
    const components: BOMComponentDefinition[] = [];

    for (const row of bomRows) {
        const compProdId = Number(row.product_id);
        const compProd = childProdsMap.get(compProdId);
        const compUomId = typeof row.unit_of_measurement === "object"
            ? Number(row.unit_of_measurement?.unit_id || row.unit_of_measurement?.id)
            : Number(row.unit_of_measurement);
        const compUom = unitsMap.get(compUomId) || { id: compUomId, name: "units" };

        const hasSubVersion = subVerByProdId.has(compProdId);
        const isSubAssembly = hasSubVersion;
        const descOrName = String(compProd?.description || compProd?.product_name || "").toLowerCase();
        const classification: MaterialClassification = isSubAssembly
            ? "SUB_ASSEMBLY"
            : (descOrName.includes("box") ||
               descOrName.includes("bottle") ||
               descOrName.includes("cap") ||
               descOrName.includes("label") ||
               descOrName.includes("carton") ||
               descOrName.includes("pouch") ||
               descOrName.includes("wrapper") ||
               descOrName.includes("packaging"))
                ? "PACKAGING"
                : "RAW_MATERIAL";

        let subAssemblyBOM: BOMDefinition | null = null;
        if (isSubAssembly) {
            const subVerId = subVerByProdId.get(compProdId)!;
            const subRes = await loadBOMDefinition(compProdId, subVerId, unitsMap, new Set(visitedProducts));
            if (subRes.bom) {
                subAssemblyBOM = subRes.bom;
            } else if (subRes.diagnostic) {
                return { bom: null, diagnostic: subRes.diagnostic };
            }
        }

        components.push({
            id: row.id,
            productId: compProdId,
            productName: compProd?.description || compProd?.product_name || `Product #${compProdId}`,
            productCode: compProd?.product_code || undefined,
            classification,
            quantityRequired: Number(row.quantity_required) || 0,
            unitOfMeasurement: compUom,
            wastageFactorPercentage: Number(row.wastage_factor_percentage) || 0,
            costPerUnit: Number(row.cost_per_unit) || undefined,
            subAssemblyBOM
        });
    }

    return {
        bom: {
            versionId: Number(targetVersion.version_id),
            versionName: targetVersion.version_name,
            productId,
            productName: prodData.description || prodData.product_name || `Product #${productId}`,
            productCode: prodData.product_code || undefined,
            baseQuantity: Number(targetVersion.base_quantity) || 1,
            expectedYieldPercentage: Number(targetVersion.expected_yield_percentage) || 100,
            stepBatchSize,
            uom: resolvedUom,
            status: targetVersion.status,
            components
        }
    };
}

/**
 * Collect all touched product IDs in a BOM tree.
 */
function collectAllComponentProductIds(bom: BOMDefinition, ids = new Set<number>()): Set<number> {
    for (const comp of bom.components) {
        ids.add(comp.productId);
        if (comp.subAssemblyBOM) {
            collectAllComponentProductIds(comp.subAssemblyBOM, ids);
        }
    }
    return ids;
}

/**
 * GET Handler for Production Feasibility API
 * Strictly read-only; calculates feasibility without DB mutations.
 */
export async function GET(request: Request) {
    // 1. Authenticate Request
    const auth = await authenticateRequest(request);
    if (!auth.ok) {
        return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action")?.trim().toLowerCase();

    // 2. Action: Lot Breakdown for a specific component at a branch
    if (action === "lot-breakdown") {
        const branchId = Number(searchParams.get("branchId"));
        const productId = Number(searchParams.get("productId"));

        if (!branchId || !productId || branchId <= 0 || productId <= 0) {
            return NextResponse.json(
                { ok: false, error: "Missing or invalid branchId or productId for lot breakdown." },
                { status: 400 }
            );
        }

        try {
            const unitsMap = await fetchUnitsMap();
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products/${productId}?fields=product_id,unit_of_measurement`,
                { headers, cache: "no-store" }
            );
            let baseUomName = "units";
            if (prodRes.ok) {
                const prodData = (await prodRes.json())?.data;
                const uomId = typeof prodData?.unit_of_measurement === "object"
                    ? Number(prodData?.unit_of_measurement?.unit_id || prodData?.unit_of_measurement?.id)
                    : Number(prodData?.unit_of_measurement);
                baseUomName = unitsMap.get(uomId)?.name || "units";
            }

            const { lots, convertiblePackagingSummary } = await loadNormalizedComponentLots(
                productId,
                branchId,
                unitsMap,
                baseUomName
            );
            return NextResponse.json({ ok: true, lots, convertiblePackagingSummary });
        } catch (error) {
            if (error instanceof MmInventoryMovementError) {
                return NextResponse.json(
                    { ok: false, error: `Live inventory movements service error: ${error.message}` },
                    { status: 503 }
                );
            }
            return NextResponse.json(
                { ok: false, error: `Failed to load lots: ${error instanceof Error ? error.message : String(error)}` },
                { status: 500 }
            );
        }
    }

    // 3. Action: Query Available Versions for a Finished Good
    if (action === "versions") {
        const productId = Number(searchParams.get("productId"));
        if (!productId || productId <= 0) {
            return NextResponse.json(
                { ok: false, error: "Missing or invalid productId." },
                { status: 400 }
            );
        }

        try {
            const filter = encodeURIComponent(JSON.stringify({
                _and: [
                    { product_id: { _eq: productId } },
                    { status: { _eq: "Active" } }
                ]
            }));
            const res = await fetch(
                `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${filter}&sort=-is_primary,-version_id&limit=20`,
                { headers, cache: "no-store" }
            );
            if (!res.ok) {
                return NextResponse.json({ ok: false, error: "Failed to fetch versions." }, { status: res.status });
            }
            const body = await res.json();
            const rawVersions: Record<string, unknown>[] = Array.isArray(body?.data) ? body.data : [];
            const today = new Date().toISOString().slice(0, 10);
            const seenVersionIds = new Set<number>();
            const eligibleVersions = rawVersions.filter((v) => {
                const vid = Number(v.version_id);
                if (!vid || seenVersionIds.has(vid)) return false;
                const validFrom = v.valid_from ? String(v.valid_from).slice(0, 10) : null;
                const validTo = v.valid_to ? String(v.valid_to).slice(0, 10) : null;
                if (validFrom && validFrom > today) return false;
                if (validTo && validTo < today) return false;
                seenVersionIds.add(vid);
                return true;
            });
            return NextResponse.json({ ok: true, versions: eligibleVersions });
        } catch (e) {
            return NextResponse.json(
                { ok: false, error: `Failed to load versions: ${e instanceof Error ? e.message : String(e)}` },
                { status: 500 }
            );
        }
    }

    // 4. Action: Query Branches List (Active & Good Stock Only)
    if (action === "branches") {
        try {
            const res = await fetch(
                `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&sort=branch_name&limit=-1&fields=id,branch_name,branch_code,isActive,isBadStock`,
                {
                    headers,
                    cache: "no-store"
                }
            );
            if (!res.ok) {
                return NextResponse.json({ ok: false, error: "Failed to fetch branches." }, { status: res.status });
            }
            const body = await res.json();
            const rawList: Record<string, unknown>[] = Array.isArray(body?.data) ? body.data : [];
            const seenBranchIds = new Set<number>();
            const branches = rawList
                .filter((b) => {
                    const isActive = Number(b.isActive ?? 1) === 1;
                    const isBad = Number(b.isBadStock) === 1 || b.isBadStock === true || b.isBadStock === "1";
                    const bName = String(b.branch_name || b.name || "").toLowerCase();
                    const isBadName =
                        bName.includes("bad stock") ||
                        bName.includes("bad branch") ||
                        bName.includes("bad order") ||
                        bName.includes("quarantine") ||
                        bName.includes("damaged") ||
                        bName.includes("reject") ||
                        bName.includes("scrap") ||
                        bName.includes("expired");
                    return isActive && !isBad && !isBadName;
                })
                .map((b) => ({
                    id: Number(b.id || b.branch_id),
                    branch_name: String(b.branch_name || b.name || `Branch #${b.id}`).trim(),
                    branch_code: b.branch_code ? String(b.branch_code).trim() : undefined
                }))
                .filter((b) => {
                    if (b.id > 0 && Boolean(b.branch_name) && !seenBranchIds.has(b.id)) {
                        seenBranchIds.add(b.id);
                        return true;
                    }
                    return false;
                });
            return NextResponse.json({ ok: true, branches });
        } catch (e) {
            return NextResponse.json(
                { ok: false, error: `Failed to load branches: ${e instanceof Error ? e.message : String(e)}` },
                { status: 500 }
            );
        }
    }

    // 5. Action: Query Finished Goods Products List
    if (action === "products") {
        try {
            // First fetch active version product_ids to only present products with recipes
            const versRes = await fetch(
                `${DIRECTUS_URL}/items/product_manufacturing_version?filter[status][_eq]=Active&fields=product_id&limit=-1`,
                { headers, cache: "no-store" }
            );
            const activeVers: Record<string, unknown>[] = versRes.ok ? (await versRes.json())?.data || [] : [];
            const productIds = Array.from(new Set(activeVers.map((v) => Number(v.product_id)).filter((id: number) => id > 0)));

            if (productIds.length === 0) {
                return NextResponse.json({ ok: true, products: [] });
            }

            const prodFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: productIds } }));
            const res = await fetch(
                `${DIRECTUS_URL}/items/products?filter=${prodFilter}&fields=product_id,product_name,description,product_code,unit_of_measurement&sort=description,product_name&limit=-1`,
                { headers, cache: "no-store" }
            );
            if (!res.ok) {
                return NextResponse.json({ ok: false, error: "Failed to fetch products." }, { status: res.status });
            }
            const body = await res.json();
            const rawProducts: Record<string, unknown>[] = Array.isArray(body?.data) ? body.data : [];
            const seenProdIds = new Set<number>();
            const products = [];
            for (const p of rawProducts) {
                const pid = Number(p.product_id);
                if (pid > 0 && !seenProdIds.has(pid)) {
                    seenProdIds.add(pid);
                    const desc = p.description ? String(p.description).trim() : "";
                    const name = p.product_name ? String(p.product_name).trim() : "";
                    const displayName = desc || name || `Product #${p.product_id}`;
                    products.push({
                        product_id: pid,
                        product_name: displayName,
                        description: desc || null,
                        product_code: p.product_code ? String(p.product_code).trim() : undefined
                    });
                }
            }
            return NextResponse.json({ ok: true, products });
        } catch (e) {
            return NextResponse.json(
                { ok: false, error: `Failed to load products: ${e instanceof Error ? e.message : String(e)}` },
                { status: 500 }
            );
        }
    }

    // 4. Primary Feasibility Calculation
    const branchId = Number(searchParams.get("branchId"));
    const productId = Number(searchParams.get("productId"));
    const rawVersionId = searchParams.get("versionId");
    const versionId = rawVersionId && Number(rawVersionId) > 0 ? Number(rawVersionId) : null;
    const mode: CapacityCalculationMode = searchParams.get("mode") === "FULL_BATCHES_ONLY"
        ? "FULL_BATCHES_ONLY"
        : "WHOLE_UNITS";

    if (!branchId || !productId || branchId <= 0 || productId <= 0) {
        return NextResponse.json(
            { ok: false, error: "Parameters 'branchId' and 'productId' are required and must be positive integers." },
            { status: 400 }
        );
    }

    try {
        // Load Units & Density Factors in parallel
        const [unitsMap, densityFactors] = await Promise.all([
            fetchUnitsMap(),
            fetchDensityFactors()
        ]);

        // Load Full BOM Tree recursively
        const bomResult = await loadBOMDefinition(productId, versionId, unitsMap);
        if (!bomResult.bom) {
            return NextResponse.json({
                ok: true,
                result: {
                    status: "INCOMPLETE_DATA",
                    mode,
                    maxFgUnits: 0,
                    fullBatches: 0,
                    batchRemainderUnits: 0,
                    batchSize: 0,
                    fgUomName: "units",
                    limitingComponent: null,
                    bottleneckReason: bomResult.diagnostic || "Unable to load approved BOM definition.",
                    components: [],
                    diagnostics: [bomResult.diagnostic || "Unable to load approved BOM definition."],
                    isFeasible: false
                }
            });
        }

        const bom = bomResult.bom;

        // Collect all touched components in the BOM tree
        const touchedProductIds = collectAllComponentProductIds(bom);

        // Fetch Canonical Inventory for all touched products
        const stockItems: StockInventoryItem[] = [];
        const inventoryErrors: string[] = [];

        // Concurrently query inventory for all touched materials
        await Promise.all(
            Array.from(touchedProductIds).map(async (compProdId) => {
                try {
                    // Find component product details to get UOM
                    const prodRes = await fetch(
                        `${DIRECTUS_URL}/items/products/${compProdId}?fields=product_id,product_name,description,unit_of_measurement`,
                        { headers, cache: "no-store" }
                    );
                    let compUom: UnitInfo = { id: 0, name: "units" };
                    let prodName = `Product #${compProdId}`;

                    if (prodRes.ok) {
                        const prodData = (await prodRes.json())?.data;
                        prodName = prodData?.description || prodData?.product_name || prodName;
                        const uomId = typeof prodData?.unit_of_measurement === "object"
                            ? Number(prodData?.unit_of_measurement?.unit_id || prodData?.unit_of_measurement?.id)
                            : Number(prodData?.unit_of_measurement);
                        compUom = unitsMap.get(uomId) || { id: uomId, name: "units" };
                    }

                    const { totalOnHand, totalAvailable, convertiblePackagingSummary } =
                        await loadNormalizedComponentLots(compProdId, branchId, unitsMap, compUom.name);

                    const reservedQty = Math.max(0, totalOnHand - totalAvailable);

                    stockItems.push({
                        productId: compProdId,
                        productName: prodName,
                        onHandQuantity: totalOnHand,
                        activeReservations: reservedQty,
                        availableQuantity: totalAvailable,
                        uom: compUom,
                        convertiblePackagingSummary
                    });
                } catch (error) {
                    if (error instanceof MmInventoryMovementError) {
                        inventoryErrors.push(`Live inventory service unavailable for product #${compProdId}: ${error.message}`);
                    } else {
                        inventoryErrors.push(`Failed querying stock for product #${compProdId}: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            })
        );

        // If the canonical inventory movement service failed for any component,
        // flag INCOMPLETE_DATA rather than misleading zero stock!
        if (inventoryErrors.length > 0) {
            return NextResponse.json({
                ok: true,
                result: {
                    status: "INCOMPLETE_DATA",
                    mode,
                    maxFgUnits: 0,
                    fullBatches: 0,
                    batchRemainderUnits: 0,
                    batchSize: bom.stepBatchSize || bom.baseQuantity,
                    fgUomName: bom.uom.name,
                    limitingComponent: null,
                    bottleneckReason: inventoryErrors[0],
                    components: [],
                    diagnostics: inventoryErrors,
                    isFeasible: false
                }
            });
        }

        // Execute Pure Feasibility Calculation Engine
        const feasibilityResult = calculateProductionFeasibility(bom, stockItems, {
            mode,
            conversionContext: { densityFactors },
            isBomQuantityPerUnit: true
        });

        return NextResponse.json({
            ok: true,
            result: feasibilityResult,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: `Production feasibility calculation failed: ${error instanceof Error ? error.message : String(error)}`
            },
            { status: 500 }
        );
    }
}
