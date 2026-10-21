import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { DecimalValue } from "@/modules/manufacturing-management/decimal";
import type {
    CalculationRequestPayload,
    CalculationResult,
    ComponentRequirementRow,
    FeasibilityVerdict
} from "@/modules/manufacturing-management/overview-and-planning/raw-materials-requirement-calculator/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL;

interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    unit_of_measurement: number | { unit_id: number; unit_shortcut?: string };
    density_factor?: number | null;
    product_brand?: number | { brand_id: number; brand_name?: string } | null;
    product_category?: number | { category_id: number; category_name?: string } | null;
    has_bom?: boolean | number;
    status?: string;
    isActive?: boolean | number;
    product_type?: number | null;
}

interface DirectusVersion {
    version_id: number;
    product_id: number;
    version_name: string;
    base_quantity: number | string;
    uom_id: number;
    expected_yield_percentage?: number | string | null;
    status: string;
    is_primary?: boolean | number;
    remarks?: string | null;
}

interface DirectusRoute {
    route_id: number;
    version_id: number;
    sequence_order: number;
    operation_id: number;
}

interface DirectusOperation {
    id: number;
    operation_name: string;
}

interface DirectusBomItem {
    id: number;
    route_id: number;
    product_id: number;
    quantity_required: number | string;
    unit_of_measurement: number;
    wastage_factor_percentage?: number | string | null;
}

interface DirectusUnit {
    unit_id: number;
    unit_name: string;
    unit_shortcut: string;
}

interface DirectusDensity {
    id: number;
    name: string;
    density: number;
}

interface DirectusBranch {
    id: number;
    branch_name?: string;
    branchName?: string;
    branch_code?: string;
    branchCode?: string;
    isActive?: boolean;
}

interface SpringOnhandItem {
    branchId: number;
    productId: number;
    unitId?: number;
    onhandQuantity: number;
}

async function getSpringAuthToken(): Promise<string | undefined> {
    try {
        const cookieStore = await cookies();
        const token =
            cookieStore.get("springboot_token")?.value ||
            cookieStore.get("vos_access_token")?.value ||
            cookieStore.get("token")?.value;
        if (token) return token;
    } catch {
        // ignore
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require("fs");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const path = require("path");
        const tokenFile = path.resolve(process.cwd(), "node_modules/.cache/vos-tokens/latest_token.txt");
        if (fs.existsSync(tokenFile)) {
            return fs.readFileSync(tokenFile, "utf8").trim();
        }
    } catch {
        // ignore
    }
    return undefined;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action") || "bootstrap";

        if (action === "bootstrap") {
            const [productsRes, branchesRes, unitsRes, densitiesRes] = await Promise.all([
                fetch(
                    `${DIRECTUS_URL}/items/products?filter[isActive][_eq]=true&filter[has_bom][_eq]=true&fields=product_id,product_name,product_code,unit_of_measurement,density_factor,product_brand,product_category&limit=-1&sort=product_name`,
                    { headers, cache: "no-store" }
                ),
                fetch(`${DIRECTUS_URL}/items/branches?limit=-1&sort=branch_name`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/units?limit=-1&sort=unit_name`, { headers, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/density_factors?filter[isActive][_neq]=false&limit=-1&sort=name`, { headers, cache: "no-store" }),
            ]);

            const rawProducts: DirectusProduct[] = productsRes.ok ? (await productsRes.json()).data || [] : [];
            const rawBranches: DirectusBranch[] = branchesRes.ok ? (await branchesRes.json()).data || [] : [];
            const rawUnits: DirectusUnit[] = unitsRes.ok ? (await unitsRes.json()).data || [] : [];
            const rawDensities: DirectusDensity[] = densitiesRes.ok ? (await densitiesRes.json()).data || [] : [];

            const unitMap = new Map<number, string>(
                rawUnits.map(u => [Number(u.unit_id), u.unit_shortcut || u.unit_name])
            );

            const products = rawProducts.map(p => {
                const uomId = typeof p.unit_of_measurement === "object" && p.unit_of_measurement !== null
                    ? Number(p.unit_of_measurement.unit_id)
                    : Number(p.unit_of_measurement || 0);

                return {
                    productId: Number(p.product_id),
                    productName: String(p.product_name || "").trim(),
                    productCode: String(p.product_code || "").trim(),
                    unitId: uomId,
                    unitShortcut: unitMap.get(uomId) || "",
                    densityFactor: p.density_factor ? Number(p.density_factor) : null,
                };
            }).filter(p => p.productId > 0 && p.productName);

            const branches = rawBranches.map(b => ({
                id: Number(b.id),
                branchName: String(b.branch_name || b.branchName || `Branch #${b.id}`).trim(),
                branchCode: String(b.branch_code || b.branchCode || "").trim(),
            })).filter(b => b.id > 0);

            const units = rawUnits.map(u => ({
                unitId: Number(u.unit_id),
                unitName: String(u.unit_name || "").trim(),
                unitShortcut: String(u.unit_shortcut || u.unit_name || "").trim(),
            })).filter(u => u.unitId > 0);

            const densities = rawDensities.map(d => ({
                id: Number(d.id),
                name: String(d.name || "").trim(),
                density: Number(d.density || 1),
            })).filter(d => d.id > 0);

            return NextResponse.json({ products, branches, units, densities });
        }

        if (action === "versions") {
            const productIdStr = searchParams.get("productId");
            if (!productIdStr) {
                return NextResponse.json({ error: "Missing productId query parameter" }, { status: 400 });
            }
            const productId = parseInt(productIdStr, 10);

            const filter = encodeURIComponent(
                JSON.stringify({
                    product_id: { _eq: productId },
                    status: { _eq: "Active" }
                })
            );
            const versionsRes = await fetch(
                `${DIRECTUS_URL}/items/product_manufacturing_version?filter=${filter}&sort=-is_primary,-version_id&limit=-1`,
                { headers, cache: "no-store" }
            );

            const rawVersions: DirectusVersion[] = versionsRes.ok ? (await versionsRes.json()).data || [] : [];

            // Also load units for label shortcut
            const unitsRes = await fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" });
            const rawUnits: DirectusUnit[] = unitsRes.ok ? (await unitsRes.json()).data || [] : [];
            const unitMap = new Map<number, string>(
                rawUnits.map(u => [Number(u.unit_id), u.unit_shortcut || u.unit_name])
            );

            const versions = rawVersions.map(v => {
                const uomId = Number(v.uom_id || 0);
                return {
                    versionId: Number(v.version_id),
                    productId: Number(v.product_id),
                    versionName: String(v.version_name || "Version " + v.version_id),
                    baseQuantity: Number(v.base_quantity || 1),
                    uomId,
                    uomShortcut: unitMap.get(uomId) || "",
                    expectedYieldPercentage: Number(v.expected_yield_percentage || 100),
                    status: String(v.status || "Draft"),
                    isPrimary: Boolean(v.is_primary),
                    remarks: v.remarks ? String(v.remarks) : undefined,
                };
            });

            return NextResponse.json(versions);
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (e) {
        console.error("GET calculator error:", e);
        return NextResponse.json({ error: (e as Error).message || "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body: CalculationRequestPayload = await req.json();
        const { productId, versionId, branchId, targetQuantity, targetUomId } = body;

        // 1. Validation
        if (!productId || productId <= 0) {
            return NextResponse.json({ error: "Finished good selection is required." }, { status: 400 });
        }
        if (!versionId || versionId <= 0) {
            return NextResponse.json({ error: "BOM version selection is required." }, { status: 400 });
        }
        if (!branchId || branchId <= 0) {
            return NextResponse.json({ error: "Branch selection is required." }, { status: 400 });
        }
        const targetQtyNum = Number(targetQuantity);
        if (!Number.isFinite(targetQtyNum) || targetQtyNum <= 0) {
            return NextResponse.json({ error: "Target quantity must be greater than zero." }, { status: 400 });
        }

        // 2. Load Version, Product, Units, and Routes concurrently
        const [versionRes, prodRes, unitsRes, routesRes, opsRes, branchRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version/${versionId}`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/products/${productId}`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_routes?filter[version_id][_eq]=${versionId}&sort=sequence_order&limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/branches/${branchId}`, { headers, cache: "no-store" }),
        ]);

        if (!versionRes.ok) {
            return NextResponse.json({ error: "Specified BOM Version was not found." }, { status: 404 });
        }
        if (!prodRes.ok) {
            return NextResponse.json({ error: "Finished good product not found." }, { status: 404 });
        }

        const versionData: DirectusVersion = (await versionRes.json()).data;
        const prodData: DirectusProduct = (await prodRes.json()).data;
        const rawUnits: DirectusUnit[] = unitsRes.ok ? (await unitsRes.json()).data || [] : [];
        const rawRoutes: DirectusRoute[] = routesRes.ok ? (await routesRes.json()).data || [] : [];
        const rawOps: DirectusOperation[] = opsRes.ok ? (await opsRes.json()).data || [] : [];
        const branchData: DirectusBranch = branchRes.ok ? (await branchRes.json()).data || { id: branchId } : { id: branchId };

        const unitMap = new Map<number, DirectusUnit>(
            rawUnits.map(u => [Number(u.unit_id), u])
        );
        const opsMap = new Map<number, string>(
            rawOps.map(o => [Number(o.id), o.operation_name])
        );

        const routeIds = rawRoutes.map(r => r.route_id).filter(id => id > 0);
        if (routeIds.length === 0) {
            const emptyResult: CalculationResult = {
                verdict: "Incomplete Data",
                targetQuantity: targetQtyNum,
                targetUomId: targetUomId || Number(versionData.uom_id),
                targetUomShortcut: unitMap.get(targetUomId || Number(versionData.uom_id))?.unit_shortcut || "Units",
                finishedGood: {
                    productId: Number(prodData.product_id),
                    productName: prodData.product_name,
                    productCode: prodData.product_code,
                    baseQuantity: Number(versionData.base_quantity),
                    baseUomShortcut: unitMap.get(Number(versionData.uom_id))?.unit_shortcut || "",
                    expectedYieldPercentage: Number(versionData.expected_yield_percentage || 100),
                    versionName: versionData.version_name,
                    versionId: Number(versionData.version_id),
                },
                branch: {
                    id: branchId,
                    branchName: branchData.branch_name || branchData.branchName || `Branch #${branchId}`,
                },
                assumptions: {
                    scalingFactor: 0,
                    expectedYieldPercentage: Number(versionData.expected_yield_percentage || 100),
                    calculationTimestamp: new Date().toISOString(),
                    disclaimer: "No routing steps or BOM components found for this version.",
                },
                summary: {
                    totalComponents: 0,
                    rawMaterialsCount: 0,
                    packagingCount: 0,
                    shortageCount: 0,
                    sufficientCount: 0,
                    readinessPercentage: 0,
                },
                components: [],
            };
            return NextResponse.json(emptyResult);
        }

        // 3. Load BOM Items for these routes
        const filterStr = encodeURIComponent(JSON.stringify({ route_id: { _in: routeIds } }));
        const bomRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_routes_bom?filter=${filterStr}&limit=-1`, {
            headers,
            cache: "no-store",
        });
        const rawBoms: DirectusBomItem[] = bomRes.ok ? (await bomRes.json()).data || [] : [];

        if (rawBoms.length === 0) {
            const incompleteResult: CalculationResult = {
                verdict: "Incomplete Data",
                targetQuantity: targetQtyNum,
                targetUomId: targetUomId || Number(versionData.uom_id),
                targetUomShortcut: unitMap.get(targetUomId || Number(versionData.uom_id))?.unit_shortcut || "Units",
                finishedGood: {
                    productId: Number(prodData.product_id),
                    productName: prodData.product_name,
                    productCode: prodData.product_code,
                    baseQuantity: Number(versionData.base_quantity),
                    baseUomShortcut: unitMap.get(Number(versionData.uom_id))?.unit_shortcut || "",
                    expectedYieldPercentage: Number(versionData.expected_yield_percentage || 100),
                    versionName: versionData.version_name,
                    versionId: Number(versionData.version_id),
                },
                branch: {
                    id: branchId,
                    branchName: branchData.branch_name || branchData.branchName || `Branch #${branchId}`,
                },
                assumptions: {
                    scalingFactor: 0,
                    expectedYieldPercentage: Number(versionData.expected_yield_percentage || 100),
                    calculationTimestamp: new Date().toISOString(),
                    disclaimer: "No component materials registered under this version's routes.",
                },
                summary: {
                    totalComponents: 0,
                    rawMaterialsCount: 0,
                    packagingCount: 0,
                    shortageCount: 0,
                    sufficientCount: 0,
                    readinessPercentage: 0,
                },
                components: [],
            };
            return NextResponse.json(incompleteResult);
        }

        // 4. Load Component Product Details (to inspect product_type, density, names)
        const componentProductIds = [...new Set(rawBoms.map(b => Number(b.product_id)).filter(id => id > 0))];
        const compFilter = encodeURIComponent(JSON.stringify({ product_id: { _in: componentProductIds } }));
        const compProdsRes = await fetch(
            `${DIRECTUS_URL}/items/products?filter=${compFilter}&fields=product_id,product_name,product_code,product_type,unit_of_measurement&limit=-1`,
            { headers, cache: "no-store" }
        );
        const compProducts: DirectusProduct[] = compProdsRes.ok ? (await compProdsRes.json()).data || [] : [];
        const compProdMap = new Map<number, DirectusProduct>(
            compProducts.map(p => [Number(p.product_id), p])
        );

        // 5. Fetch Spring Boot On-Hand Stock for this branch
        let onhandList: SpringOnhandItem[] = [];
        try {
            const token = await getSpringAuthToken();
            const springHeaders: Record<string, string> = { Accept: "application/json" };
            if (token) springHeaders["Authorization"] = `Bearer ${token}`;

            const springUrl = `${SPRING_API_BASE}/api/mm-product-onhand/filter?branch=${branchId}`;
            const stockRes = await fetch(springUrl, { headers: springHeaders, cache: "no-store" });
            if (stockRes.ok) {
                const stockData = await stockRes.json();
                onhandList = Array.isArray(stockData) ? stockData : [];
            }
        } catch (err) {
            console.error("Warning: Failed to fetch live spring boot on-hand stock:", err);
        }

        // Map product_id -> onhand_quantity
        const onhandMap = new Map<number, number>();
        for (const item of onhandList) {
            const pid = Number(item.productId);
            const current = onhandMap.get(pid) || 0;
            onhandMap.set(pid, current + Number(item.onhandQuantity || 0));
        }

        // 6. Base Quantity & Scaling Factor Calculation
        const baseQty = Number(versionData.base_quantity);
        if (!Number.isFinite(baseQty) || baseQty <= 0) {
            return NextResponse.json({ error: "Invalid BOM base quantity in master data." }, { status: 400 });
        }

        // Check if unit conversion or density conversion is needed between target and BOM
        const bomUomId = Number(versionData.uom_id);
        const selectedTargetUomId = targetUomId ? Number(targetUomId) : bomUomId;
        let effectiveTargetQty = targetQtyNum;

        // Apply density or scale if target UOM differs from BOM base UOM
        if (selectedTargetUomId !== bomUomId) {
            const targetUomObj = unitMap.get(selectedTargetUomId);
            const baseUomObj = unitMap.get(bomUomId);
            const targetShortcut = (targetUomObj?.unit_shortcut || "").toUpperCase();
            const baseShortcut = (baseUomObj?.unit_shortcut || "").toUpperCase();
            const density = Number(prodData.density_factor || 1.0);

            // e.g., Target in Liters, Base in MT
            if ((targetShortcut === "L" || targetShortcut === "LITERS") && (baseShortcut === "MT" || baseShortcut === "METRIC TON")) {
                // Mass (MT) = Volume (L) * density / 1000
                effectiveTargetQty = (targetQtyNum * density) / 1000;
            } else if ((targetShortcut === "MT" || targetShortcut === "METRIC TON") && (baseShortcut === "L" || baseShortcut === "LITERS")) {
                // Volume (L) = Mass (MT) * 1000 / density
                effectiveTargetQty = (targetQtyNum * 1000) / (density || 1);
            } else if ((targetShortcut === "KG" || targetShortcut === "KILOGRAM") && (baseShortcut === "MT" || baseShortcut === "METRIC TON")) {
                effectiveTargetQty = targetQtyNum / 1000;
            } else if ((targetShortcut === "MT" || targetShortcut === "METRIC TON") && (baseShortcut === "KG" || baseShortcut === "KILOGRAM")) {
                effectiveTargetQty = targetQtyNum * 1000;
            }
        }

        const scalingFactor = Number(
            DecimalValue.from(effectiveTargetQty)
                .divideRounded(DecimalValue.from(baseQty), 6)
                .toFixed(6)
        );

        const routeMap = new Map<number, DirectusRoute>(
            rawRoutes.map(r => [Number(r.route_id), r])
        );

        // 7. Calculate Per-Component Requirements
        const components: ComponentRequirementRow[] = [];
        let totalShortageLines = 0;
        let totalSufficientLines = 0;
        let rawCount = 0;
        let packagingCount = 0;

        for (const bom of rawBoms) {
            const pid = Number(bom.product_id);
            const compProd = compProdMap.get(pid);
            const route = routeMap.get(Number(bom.route_id));
            const seq = route?.sequence_order || 10;
            const opName = route?.operation_id ? (opsMap.get(Number(route.operation_id)) || "Operation") : "General";

            const bomQty = Number(bom.quantity_required || 0);
            const wastagePct = Number(bom.wastage_factor_percentage || 0);
            const wastageMultiplier = 1 + (wastagePct / 100);

            // Gross requirement = target/base * bomQty * (1 + wastage/100)
            const nominalQty = scalingFactor * bomQty;
            const grossRequired = Number(
                DecimalValue.from(nominalQty)
                    .multiply(DecimalValue.from(wastageMultiplier))
                    .toFixed(4)
            );

            // Determine if packaging or raw material
            // Product Type IDs: e.g., 389/Raw Material, Packaging items
            const pType = compProd?.product_type;
            const pName = (compProd?.product_name || "").toLowerCase();
            const isPackaging = pType === 390 || pName.includes("bottle") || pName.includes("cap") || pName.includes("label") || pName.includes("box") || pName.includes("carton") || pName.includes("pouch");

            if (isPackaging) {
                packagingCount++;
            } else {
                rawCount++;
            }

            const available = onhandMap.get(pid) || 0;
            const shortage = Math.max(0, Number(DecimalValue.from(grossRequired).subtract(DecimalValue.from(available)).toFixed(4)));

            let status: "Sufficient" | "Shortage" | "No Stock" = "Sufficient";
            if (shortage > 0) {
                status = available <= 0 ? "No Stock" : "Shortage";
                totalShortageLines++;
            } else {
                totalSufficientLines++;
            }

            const uomId = Number(bom.unit_of_measurement || compProd?.unit_of_measurement || 0);
            const uomObj = unitMap.get(uomId);

            components.push({
                bomItemId: Number(bom.id),
                productId: pid,
                productName: compProd?.product_name || `Item #${pid}`,
                productCode: compProd?.product_code || "N/A",
                materialType: isPackaging ? "PACKAGING" : "RAW_MATERIALS",
                routeSequence: seq,
                operationName: opName,
                unitId: uomId,
                unitShortcut: uomObj?.unit_shortcut || uomObj?.unit_name || "",
                quantityPerBatch: bomQty,
                wastagePercentage: wastagePct,
                requiredQuantity: grossRequired,
                availableQuantity: available,
                shortageQuantity: shortage,
                status,
            });
        }

        // Sort components by Route Sequence then Material Type
        components.sort((a, b) => {
            if (a.routeSequence !== b.routeSequence) return a.routeSequence - b.routeSequence;
            return a.materialType.localeCompare(b.materialType);
        });

        // 8. Overall Feasibility Verdict
        let verdict: FeasibilityVerdict = "Sufficient";
        if (components.length === 0) {
            verdict = "Incomplete Data";
        } else if (totalShortageLines > 0) {
            verdict = "Shortage";
        }

        const readinessPercentage = components.length > 0
            ? Math.round((totalSufficientLines / components.length) * 100)
            : 0;

        const result: CalculationResult = {
            verdict,
            targetQuantity: targetQtyNum,
            targetUomId: selectedTargetUomId,
            targetUomShortcut: unitMap.get(selectedTargetUomId)?.unit_shortcut || "Units",
            finishedGood: {
                productId: Number(prodData.product_id),
                productName: prodData.product_name,
                productCode: prodData.product_code,
                baseQuantity: baseQty,
                baseUomShortcut: unitMap.get(bomUomId)?.unit_shortcut || "",
                expectedYieldPercentage: Number(versionData.expected_yield_percentage || 100),
                versionName: versionData.version_name,
                versionId: Number(versionData.version_id),
            },
            branch: {
                id: branchId,
                branchName: branchData.branch_name || branchData.branchName || `Branch #${branchId}`,
            },
            assumptions: {
                scalingFactor,
                appliedDensityFactor: prodData.density_factor ? Number(prodData.density_factor) : undefined,
                expectedYieldPercentage: Number(versionData.expected_yield_percentage || 100),
                calculationTimestamp: new Date().toISOString(),
                disclaimer: "Simulation estimation only. Does not reserve stock, generate Job Orders, or guarantee plant workstation/labor capacity.",
            },
            summary: {
                totalComponents: components.length,
                rawMaterialsCount: rawCount,
                packagingCount: packagingCount,
                shortageCount: totalShortageLines,
                sufficientCount: totalSufficientLines,
                readinessPercentage,
            },
            components,
        };

        return NextResponse.json(result);
    } catch (e) {
        console.error("POST calculator error:", e);
        return NextResponse.json({ error: (e as Error).message || "Calculation failed" }, { status: 500 });
    }
}
