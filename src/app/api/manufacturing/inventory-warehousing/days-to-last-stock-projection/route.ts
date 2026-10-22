import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    StockProjectionItem,
    StockProjectionApiResponse,
    ProjectionStatus,
} from "@/modules/manufacturing-management/inventory-warehousing/days-to-last-stock-projection/types";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusBranchRaw {
    id: number;
    branch_name: string;
    branch_code: string;
    isActive?: number | boolean | string | null;
    isBadStock?: number | boolean | string | null;
}

interface DirectusProductRaw {
    product_id: number;
    product_code: string | null;
    product_name: string | null;
    description?: string | null;
    product_type?: { id: number; name: string } | number | null;
    product_category?: { category_id: number; category_name: string } | number | null;
    unit_of_measurement?: { unit_id: number; unit_name: string; unit_shortcut: string } | number | null;
    isActive?: boolean | number | null;
}

interface DirectusProductTypeRaw {
    id: number;
    name: string;
}

interface SpringBatchOnhandRow {
    branchId?: number;
    branch_id?: number;
    productId?: number;
    product_id?: number;
    productCode?: string;
    product_code?: string;
    productName?: string;
    product_name?: string;
    inventoryCondition?: string;
    inventory_condition?: string;
    batchNo?: string;
    batch_no?: string;
    onhandQuantity?: number | string;
    onhand_quantity?: number | string;
    unitId?: number;
    unit_id?: number;
}

interface WipRawMovement {
    branch_id?: number | null;
    branch?: number | null;
    product_id?: number | null;
    product?: number | null;
    quantity_out?: number | string | null;
    transaction_date?: string | null;
    transaction_type?: string | null;
    source_module?: string | null;
}

interface DirectusJobOrderMaterialRaw {
    jo_material_id: number;
    job_order_id: number | { job_order_id: number; branch_id: number; created_at?: string; scheduled_start_date?: string };
    product_id: number | { product_id: number };
    actual_consumed_quantity: number | string | null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchParam = searchParams.get("branch");
        const windowMonthsParam = Number(searchParams.get("window_months") ?? 3);
        const isAllTime = windowMonthsParam === 0;
        const windowMonths = isAllTime ? 12 : Math.max(1, windowMonthsParam);
        const workingDaysPerMonth = Math.max(1, Number(searchParams.get("working_days") || 26));

        const springBaseUrl =
            process.env.SPRING_API_BASE_URL?.trim().replace(/\/+$/, "") ||
            process.env.NEXT_PUBLIC_SPRING_API_URL?.trim().replace(/\/+$/, "") ||
            "";

        // 1. Retrieve JWT Bearer token from secure request cookies
        let token = "";
        const cookiePairs: string[] = [];
        try {
            const cookieStore = await cookies();
            for (const cookieName of ["springboot_token", "vos_access_token", "token"]) {
                const val = cookieStore.get(cookieName)?.value?.trim();
                if (val) {
                    cookiePairs.push(`${cookieName}=${val}`);
                    if (!token) token = val;
                }
            }
        } catch {
            // Cookie context fallback
        }

        const springHeaders: Record<string, string> = {
            Accept: "application/json",
        };
        if (token) {
            springHeaders["Authorization"] = `Bearer ${token}`;
            if (cookiePairs.length > 0) {
                springHeaders["Cookie"] = cookiePairs.join("; ");
            }
        }

        const timestamp = Date.now();

        // 2. Query Master Data (Branches, Products, Product Types) in Parallel
        const branchesPromise = fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&sort=branch_name&fields=id,branch_name,branch_code,isActive,isBadStock&_t=${timestamp}`,
            { headers: directusHeaders, cache: "no-store" }
        ).then(async (res) => (res.ok ? ((await res.json()).data as DirectusBranchRaw[]) : []));

        const productTypesPromise = fetch(
            `${DIRECTUS_URL}/items/product_type?limit=-1&sort=name&fields=id,name&_t=${timestamp}`,
            { headers: directusHeaders, cache: "no-store" }
        ).then(async (res) => (res.ok ? ((await res.json()).data as DirectusProductTypeRaw[]) : []));

        const productsPromise = fetch(
            `${DIRECTUS_URL}/items/products?filter[isActive][_eq]=1&limit=-1&fields=product_id,product_code,product_name,description,product_type,product_category.category_id,product_category.category_name,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut&_t=${timestamp}`,
            { headers: directusHeaders, cache: "no-store" }
        ).then(async (res) => (res.ok ? ((await res.json()).data as DirectusProductRaw[]) : []));

        // 3. Query Live On-Hand Batches from Canonical View `v_mm_batch_onhand` via Spring Boot
        const onhandPromise = springBaseUrl
            ? fetch(`${springBaseUrl}/api/mm-batch-onhand/all`, {
                  headers: springHeaders,
                  cache: "no-store",
              })
                  .then(async (res) => {
                      if (!res.ok) return [];
                      const json = await res.json();
                      return Array.isArray(json) ? (json as SpringBatchOnhandRow[]) : json?.data || [];
                  })
                  .catch(() => [] as SpringBatchOnhandRow[])
            : Promise.resolve([] as SpringBatchOnhandRow[]);

        // 4. Query Verified Outflow Movements from Canonical View `v_mm_inventory_movements` via Spring Boot
        const movementsPromise = springBaseUrl
            ? fetch(`${springBaseUrl}/api/mm-inventory-movements/all`, {
                  headers: springHeaders,
                  cache: "no-store",
              })
                  .then(async (res) => {
                      if (!res.ok) return [];
                      const json = await res.json();
                      return Array.isArray(json) ? (json as WipRawMovement[]) : json?.data || [];
                  })
                  .catch(() => [] as WipRawMovement[])
            : Promise.resolve([] as WipRawMovement[]);

        // 5. Query Directus manufacturing_job_order_materials as Dual Consumption Source
        const joMaterialsPromise = fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[actual_consumed_quantity][_gt]=0&limit=-1&fields=jo_material_id,job_order_id.job_order_id,job_order_id.branch_id,job_order_id.created_at,product_id,actual_consumed_quantity&_t=${timestamp}`,
            { headers: directusHeaders, cache: "no-store" }
        ).then(async (res) => (res.ok ? ((await res.json()).data as DirectusJobOrderMaterialRaw[]) : [])).catch(() => []);

        // 6. Directus fallback for onhand & lots if Spring Boot has zero rows
        const directusLotsPromise = fetch(
            `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&fields=inventory_lot_id,lot_id,branch_id,product_id,batch_no,qa_status&_t=${timestamp}`,
            { headers: directusHeaders, cache: "no-store" }
        ).then(async (res) => (res.ok ? ((await res.json()).data as Array<Record<string, unknown>>) : [])).catch(() => []);

        const [
            rawBranches,
            rawProductTypes,
            rawProducts,
            springOnhand,
            springMovements,
            directusJobOrderMaterials,
            directusLots,
        ] = await Promise.all([
            branchesPromise,
            productTypesPromise,
            productsPromise,
            onhandPromise,
            movementsPromise,
            joMaterialsPromise,
            directusLotsPromise,
        ]);

        // Map branches
        const branches = rawBranches.map((b) => ({
            id: Number(b.id),
            branch_name: b.branch_name,
            branch_code: b.branch_code,
        }));

        const selectedBranchIds =
            branchParam && branchParam !== "ALL"
                ? [Number(branchParam)]
                : branches.map((b) => b.id);

        const branchMap = new Map<number, string>();
        for (const b of branches) {
            branchMap.set(b.id, b.branch_name);
        }

        // 7. Aggregate Live On-Hand Stock from `v_mm_batch_onhand`
        // Key: `${branch_id}:${product_id}`
        const stockMap = new Map<string, { available: number; total: number; batchCount: number }>();

        for (const row of springOnhand) {
            const bId = Number(row.branchId || row.branch_id || 0);
            const pId = Number(row.productId || row.product_id || 0);
            if (!bId || !pId) continue;

            const qty = Number(row.onhandQuantity ?? row.onhand_quantity ?? 0);
            const condition = String(row.inventoryCondition || row.inventory_condition || "GOOD").toUpperCase().trim();
            const isEligible = condition === "GOOD" || condition === "PASSED" || condition === "";

            const key = `${bId}:${pId}`;
            const curr = stockMap.get(key) || { available: 0, total: 0, batchCount: 0 };
            curr.total += qty;
            if (isEligible && qty > 0) {
                curr.available += qty;
                curr.batchCount += 1;
            }
            stockMap.set(key, curr);
        }

        // Directus mm_inventory_lots fallback if onhand had zero rows
        if (springOnhand.length === 0) {
            for (const lot of directusLots) {
                const bId = Number(lot.branch_id || 0);
                const pId = Number(lot.product_id || 0);
                if (!bId || !pId) continue;
                const qaStatus = String(lot.qa_status || "GOOD").toUpperCase();
                const isEligible = qaStatus === "GOOD" || qaStatus === "PASSED";

                const key = `${bId}:${pId}`;
                const curr = stockMap.get(key) || { available: 0, total: 0, batchCount: 0 };
                if (isEligible) {
                    curr.batchCount += 1;
                }
                stockMap.set(key, curr);
            }
        }

        // 8. Aggregate Verified Consumption from Dual Sources (`v_mm_inventory_movements` + `manufacturing_job_order_materials`)
        const now = new Date();
        const cutoffDate = new Date();
        cutoffDate.setDate(now.getDate() - windowMonths * 30);

        const consumptionMap = new Map<
            string,
            { totalConsumed: number; txCount: number; earliestDate: string | null; latestDate: string | null }
        >();

        // Source A: Spring Boot v_mm_inventory_movements
        for (const mv of springMovements) {
            const srcModule = String(mv.source_module || "").toUpperCase();
            const txType = String(mv.transaction_type || "").toUpperCase();
            const isProductionConsumption =
                srcModule === "MM_JOB_ORDER" ||
                txType === "JOB_ORDER_CONSUMPTION" ||
                txType === "MATERIAL_CONSUMPTION";

            if (!isProductionConsumption) continue;

            const bId = Number(mv.branch_id || mv.branch || 0);
            const pId = Number(mv.product_id || mv.product || 0);
            if (!bId || !pId) continue;

            const txDateStr = mv.transaction_date;
            if (!isAllTime && txDateStr) {
                const txDate = new Date(txDateStr);
                if (txDate < cutoffDate) continue; // Outside assessed window
            }

            const qtyOut = Number(mv.quantity_out) || 0;
            if (qtyOut <= 0) continue;

            const key = `${bId}:${pId}`;
            const curr = consumptionMap.get(key) || {
                totalConsumed: 0,
                txCount: 0,
                earliestDate: null,
                latestDate: null,
            };

            curr.totalConsumed += qtyOut;
            curr.txCount += 1;
            if (txDateStr) {
                if (!curr.earliestDate || txDateStr < curr.earliestDate) curr.earliestDate = txDateStr;
                if (!curr.latestDate || txDateStr > curr.latestDate) curr.latestDate = txDateStr;
            }
            consumptionMap.set(key, curr);
        }

        // Source B: Directus manufacturing_job_order_materials
        for (const jom of directusJobOrderMaterials) {
            const joObj = typeof jom.job_order_id === "object" ? jom.job_order_id : null;
            const pId = typeof jom.product_id === "object" ? Number(jom.product_id.product_id) : Number(jom.product_id);
            const bId = joObj ? Number(joObj.branch_id) : 1; // Default to main branch if not joined
            if (!pId || !bId) continue;

            const txDateStr = joObj?.created_at || joObj?.scheduled_start_date || null;
            if (!isAllTime && txDateStr) {
                const txDate = new Date(txDateStr);
                if (txDate < cutoffDate) continue;
            }

            const qtyOut = Number(jom.actual_consumed_quantity) || 0;
            if (qtyOut <= 0) continue;

            const key = `${bId}:${pId}`;
            const curr = consumptionMap.get(key) || {
                totalConsumed: 0,
                txCount: 0,
                earliestDate: null,
                latestDate: null,
            };

            // Avoid double counting if already populated by movement key
            if (springMovements.length === 0) {
                curr.totalConsumed += qtyOut;
                curr.txCount += 1;
            } else if (curr.totalConsumed === 0) {
                curr.totalConsumed = qtyOut;
                curr.txCount = 1;
            }

            if (txDateStr) {
                if (!curr.earliestDate || txDateStr < curr.earliestDate) curr.earliestDate = txDateStr;
                if (!curr.latestDate || txDateStr > curr.latestDate) curr.latestDate = txDateStr;
            }
            consumptionMap.set(key, curr);
        }

        // 9. Iterate across all REAL catalog products
        const items: StockProjectionItem[] = [];
        const assessedMonths = windowMonths;
        const actualWorkingDays = assessedMonths * workingDaysPerMonth;

        const displayBranchIds = selectedBranchIds.length > 0 ? selectedBranchIds : branches.map((b) => b.id);

        // Build map for Product Types by ID
        const productTypeMap = new Map<number, string>();
        for (const pt of rawProductTypes) {
            productTypeMap.set(Number(pt.id), pt.name);
        }

        for (const p of rawProducts) {
            const pId = Number(p.product_id);
            if (!pId) continue;

            const productTypeObj = typeof p.product_type === "object" && p.product_type !== null ? p.product_type : null;
            const productTypeId = productTypeObj ? Number(productTypeObj.id) : (typeof p.product_type === "number" ? p.product_type : null);
            const categoryObj = typeof p.product_category === "object" && p.product_category !== null ? p.product_category : null;
            const uomObj = typeof p.unit_of_measurement === "object" && p.unit_of_measurement !== null ? p.unit_of_measurement : null;

            const displayName = String(p.product_name || p.description || `Product #${pId}`).trim();
            const displayCode = String(p.product_code || `P-${pId}`).trim();
            const uomShortcut = uomObj?.unit_shortcut || "PCS";
            const categoryName = categoryObj?.category_name || null;

            // Resolve real product type name from object or from productTypeMap via ID
            const resolvedTypeName =
                productTypeObj?.name ||
                (productTypeId ? productTypeMap.get(productTypeId) : null) ||
                (productTypeId === 389 ? "Raw Materials" : productTypeId === 390 ? "Packaging Items" : productTypeId === 388 ? "Finished Goods" : "Other");
            const productTypeName = resolvedTypeName;

            for (const bId of displayBranchIds) {
                const branchName = branchMap.get(bId) || `Branch #${bId}`;
                const key = `${bId}:${pId}`;
                const stock = stockMap.get(key) || { available: 0, total: 0, batchCount: 0 };
                const consumption = consumptionMap.get(key) || {
                    totalConsumed: 0,
                    txCount: 0,
                    earliestDate: null,
                    latestDate: null,
                };

                // Step 1: MAvg = total consumption ÷ months assessed
                const mAvg = consumption.totalConsumed > 0 && assessedMonths > 0
                    ? consumption.totalConsumed / assessedMonths
                    : 0;

                // Step 2: DAvg = MAvg ÷ working days per month
                const dAvg = mAvg > 0 && workingDaysPerMonth > 0
                    ? mAvg / workingDaysPerMonth
                    : 0;

                // Step 3: Days to last = available stock ÷ DAvg
                const daysToLast = dAvg > 0
                    ? Number((stock.available / dAvg).toFixed(1))
                    : null;

                const hasSufficientHistory = consumption.txCount >= 1;
                let status: ProjectionStatus = "ESTIMATED_SUPPLY";

                if (consumption.totalConsumed === 0 || dAvg === 0) {
                    status = "NO_RECORDED_CONSUMPTION";
                } else if (!hasSufficientHistory) {
                    status = "INSUFFICIENT_HISTORY";
                } else if (stock.available <= 0 || (daysToLast !== null && daysToLast <= 3)) {
                    status = "CRITICAL_SUPPLY";
                } else if (daysToLast !== null && daysToLast <= 14) {
                    status = "LOW_SUPPLY";
                } else {
                    status = "ESTIMATED_SUPPLY";
                }

                items.push({
                    product_id: pId,
                    product_code: displayCode,
                    product_name: displayName,
                    product_type_id: productTypeId,
                    product_type_name: productTypeName,
                    category_name: categoryName,
                    unit_id: uomObj?.unit_id ?? null,
                    unit_name: uomObj?.unit_name ?? null,
                    unit_shortcut: uomShortcut,
                    branch_id: bId,
                    branch_name: branchName,
                    available_stock: Number(stock.available.toFixed(4)),
                    total_on_hand_stock: Number(stock.total.toFixed(4)),
                    quarantined_stock: Number((stock.total - stock.available).toFixed(4)),
                    active_batches_count: stock.batchCount,
                    total_consumed_quantity: Number(consumption.totalConsumed.toFixed(4)),
                    assessed_months: assessedMonths,
                    assessed_calendar_days: assessedMonths * 30,
                    actual_working_days_covered: actualWorkingDays,
                    working_days_per_month: workingDaysPerMonth,
                    m_avg: Number(mAvg.toFixed(2)),
                    d_avg: Number(dAvg.toFixed(2)),
                    days_to_last: daysToLast,
                    status,
                    has_sufficient_history: hasSufficientHistory,
                    history_record_count: consumption.txCount,
                    earliest_recorded_date: consumption.earliestDate,
                    latest_recorded_date: consumption.latestDate,
                    low_stock_threshold_days: 14,
                });
            }
        }

        // Sort: Active stock or consumption first, then by urgency status
        const statusPriority: Record<ProjectionStatus, number> = {
            CRITICAL_SUPPLY: 1,
            LOW_SUPPLY: 2,
            ESTIMATED_SUPPLY: 3,
            INSUFFICIENT_HISTORY: 4,
            NO_RECORDED_CONSUMPTION: 5,
        };

        items.sort((a, b) => {
            const aHasActivity = a.available_stock > 0 || a.total_consumed_quantity > 0;
            const bHasActivity = b.available_stock > 0 || b.total_consumed_quantity > 0;
            if (aHasActivity && !bHasActivity) return -1;
            if (!aHasActivity && bHasActivity) return 1;
            return statusPriority[a.status] - statusPriority[b.status];
        });

        const kpis = {
            critical_supply_count: items.filter((i) => i.status === "CRITICAL_SUPPLY").length,
            low_supply_count: items.filter((i) => i.status === "LOW_SUPPLY").length,
            adequate_supply_count: items.filter((i) => i.status === "ESTIMATED_SUPPLY").length,
            insufficient_history_count: items.filter((i) => i.status === "INSUFFICIENT_HISTORY").length,
            no_consumption_count: items.filter((i) => i.status === "NO_RECORDED_CONSUMPTION").length,
            total_materials_assessed: items.length,
            total_available_stock_units: items.reduce((acc, curr) => acc + curr.available_stock, 0),
        };

        const response: StockProjectionApiResponse = {
            success: true,
            data: items,
            kpis,
            branches,
            product_types: rawProductTypes.map((pt) => ({ id: pt.id, name: pt.name })),
            timestamp: new Date().toISOString(),
        };

        return NextResponse.json(response);
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Failed to calculate stock projections";
        console.error("Stock projections real data error:", err);
        return NextResponse.json(
            {
                success: false,
                data: [],
                branches: [],
                product_types: [],
                error: errorMsg,
            },
            { status: 500 }
        );
    }
}
