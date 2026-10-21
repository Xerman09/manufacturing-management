import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { VerifiedConsumptionDetail } from "@/modules/manufacturing-management/inventory-warehousing/days-to-last-stock-projection/types";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusJobOrderMaterialRaw {
    jo_material_id: number;
    job_order_id: number | { job_order_id: number; job_order_no?: string; branch_id?: number; created_at?: string };
    product_id: number | { product_id: number; product_name?: string };
    actual_consumed_quantity: number | string | null;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productId = Number(searchParams.get("product_id"));
        const branchId = Number(searchParams.get("branch_id"));

        if (!productId) {
            return NextResponse.json({ success: true, data: [] });
        }

        const springBaseUrl = process.env.SPRING_API_BASE_URL?.trim().replace(/\/+$/, "");

        // Retrieve JWT Bearer token
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

        const results: VerifiedConsumptionDetail[] = [];

        // 1. Fetch from Spring Boot v_mm_inventory_movements
        if (springBaseUrl && token) {
            try {
                const params = new URLSearchParams({
                    sourceModule: "MM_JOB_ORDER",
                    product: String(productId),
                });
                if (branchId > 0) {
                    params.set("branch", String(branchId));
                }

                const res = await fetch(`${springBaseUrl}/api/mm-inventory-movements/filter?${params.toString()}`, {
                    headers: {
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`,
                        ...(cookiePairs.length > 0 ? { Cookie: cookiePairs.join("; ") } : {}),
                    },
                    cache: "no-store",
                });

                if (res.ok) {
                    const rawList = (await res.json()) as Array<Record<string, unknown>>;
                    for (const m of Array.isArray(rawList) ? rawList : []) {
                        const refNo = String(m.referenceNo || m.reference_no || m.source_document_no || "").trim();
                        const qty = Number(m.quantityOut ?? m.quantity_out ?? 0);
                        const txDate = String(m.transactionDate || m.transaction_date || m.postedAt || m.posted_at || "");
                        const batch = String(m.batchNo || m.batch_no || "").trim();

                        if (qty > 0 || refNo) {
                            results.push({
                                movement_key: String(m.movementKey || m.movement_key || `MV-${results.length + 1}`),
                                reference_no: refNo || `JO-REF-${m.referenceId || m.reference_id || "N/A"}`,
                                reference_id: Number(m.referenceId || m.reference_id) || 0,
                                transaction_date: txDate,
                                posted_at: String(m.postedAt || m.posted_at || txDate),
                                branch_id: Number(m.branchId || m.branch_id || branchId) || 0,
                                product_id: Number(m.productId || m.product_id) || productId,
                                product_name: String(m.productName || m.product_name || "Material"),
                                batch_no: batch || null,
                                quantity_out: qty,
                                unit_shortcut: "",
                                remarks: (m.remarks as string) || null,
                            });
                        }
                    }
                }
            } catch {
                // Spring Boot fetch failed, proceed to Directus fallback
            }
        }

        // 2. Directus fallback from manufacturing_job_order_materials
        if (results.length === 0) {
            try {
                const timestamp = Date.now();
                const joRes = await fetch(
                    `${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[product_id][_eq]=${productId}&filter[actual_consumed_quantity][_gt]=0&limit=-1&fields=jo_material_id,actual_consumed_quantity,job_order_id.job_order_id,job_order_id.job_order_no,job_order_id.branch_id,job_order_id.created_at&_t=${timestamp}`,
                    { headers: directusHeaders, cache: "no-store" }
                );

                if (joRes.ok) {
                    const json = await joRes.json();
                    const list = (json.data || []) as DirectusJobOrderMaterialRaw[];
                    for (const row of list) {
                        const joObj = typeof row.job_order_id === "object" ? row.job_order_id : null;
                        const rowBranch = joObj?.branch_id ? Number(joObj.branch_id) : branchId;

                        if (branchId > 0 && rowBranch !== branchId) continue;

                        const qty = Number(row.actual_consumed_quantity) || 0;
                        results.push({
                            movement_key: `JOM-${row.jo_material_id}`,
                            reference_no: joObj?.job_order_no || `JO-${joObj?.job_order_id || row.jo_material_id}`,
                            reference_id: joObj?.job_order_id || 0,
                            transaction_date: joObj?.created_at ? joObj.created_at.slice(0, 19).replace("T", " ") : "",
                            posted_at: joObj?.created_at || "",
                            branch_id: rowBranch,
                            product_id: productId,
                            product_name: "",
                            batch_no: null,
                            quantity_out: qty,
                            unit_shortcut: "",
                            remarks: `Consumed in Job Order ${joObj?.job_order_no || ""}`,
                        });
                    }
                }
            } catch {
                // Ignore fallback error
            }
        }

        return NextResponse.json({ success: true, data: results });
    } catch (e) {
        return NextResponse.json({ success: false, data: [], error: String(e) }, { status: 500 });
    }
}
