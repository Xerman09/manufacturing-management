import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";
import {
    fetchSourceMovements,
    postMovements,
    type PostMovementPayload,
} from "../../invoice-consolidation/inventory-movements-client";
import { syncProductLedgerToTarget } from "../../invoice-consolidation/product-ledger-client";
import { nowUtcSql } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVAL_STATUSES = ["Picked"];
const TXN_TYPE_SALES_ISSUE = 4;

let branchesCache: Map<number, { branchName: string; branchCode: string }> | null = null;

async function getBranchesMap(): Promise<Map<number, { branchName: string; branchCode: string }>> {
    if (branchesCache) return branchesCache;
    const res = await fetch(
        `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code`,
        { headers: directusHeaders, cache: "no-store" }
    );
    if (res.ok) {
        const data = (await res.json()).data || [];
        branchesCache = new Map(
            data.map((b: { id: number; branch_name: string; branch_code: string }) => [
                b.id,
                { branchName: b.branch_name, branchCode: b.branch_code },
            ])
        );
    } else {
        branchesCache = new Map();
    }
    return branchesCache;
}

async function transitionSalesOrderToForInvoicing(
    documentIds: number[],
    userId: number,
    utcNow: string
): Promise<{ updated: number; errors: string[] }> {
    const errors: string[] = [];
    const orderIds = [...new Set(documentIds.map((id) => Number(id)).filter(Boolean))];
    if (orderIds.length === 0) return { updated: 0, errors: [] };

    let updated = 0;
    for (const orderId of orderIds) {
        const patchRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({
                order_status: "For Invoicing",
                for_consolidation_at: utcNow,
                for_invoicing_at: utcNow,
                modified_date: utcNow,
                modified_by: userId,
            }),
        });
        if (patchRes.ok) {
            updated++;
        } else {
            const retryRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({
                    order_status: "For Invoicing",
                    for_consolidation_at: utcNow,
                }),
            });
            if (retryRes.ok) {
                updated++;
            } else {
                errors.push(`Order ${orderId}: status update failed HTTP ${patchRes.status}`);
            }
        }
    }
    return { updated, errors };
}

// ─── GET — list approval-stage batches (status = Picked) ─────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(0, parseInt(searchParams.get("page") || "0"));
        const size = Math.max(1, Math.min(100, parseInt(searchParams.get("size") || "50")));
        const search = searchParams.get("search");
        const branchId = searchParams.get("branchId");

        if (!branchId) {
            return NextResponse.json({ message: "branchId is required" }, { status: 400 });
        }

        const qs = new URLSearchParams();
        qs.set("filter[is_delete][_eq]", "0");
        qs.set("filter[branch_id][_eq]", branchId);
        qs.set("filter[status][_in]", APPROVAL_STATUSES.join(","));
        qs.set("sort", "-updated_at");
        qs.set("limit", String(size));
        qs.set("offset", String(page * size));
        qs.set("meta", "filter_count");

        if (search) {
            qs.set("filter[consolidator_no][_contains]", search);
        }

        const res = await fetch(`${DIRECTUS_URL}/items/consolidator?${qs.toString()}`, {
            headers: directusHeaders,
            cache: "no-store",
        });
        if (!res.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${res.status})` }, { status: res.status });
        }

        const json = await res.json();
        const items = json.data || [];
        const total = json.meta?.filter_count ?? items.length;
        const ids: number[] = items.map((c: { id: number }) => c.id);

        let details: {
            id: number;
            consolidator_id: number;
            product_id: number;
            ordered_quantity: number;
            picked_quantity: number;
            applied_quantity: number;
        }[] = [];
        let junctions: { consolidator_id: number; invoice_id: number }[] = [];
        if (ids.length > 0) {
            const [dRes, jRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`, {
                    headers: directusHeaders,
                    cache: "no-store",
                }),
                fetch(`${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_in]=${ids.join(",")}&limit=-1`, {
                    headers: directusHeaders,
                    cache: "no-store",
                }),
            ]);
            if (dRes.ok) details = (await dRes.json()).data || [];
            if (jRes.ok) junctions = (await jRes.json()).data || [];
        }

        const detailMap = new Map<number, typeof details>();
        for (const d of details) {
            const list = detailMap.get(d.consolidator_id) || [];
            list.push(d);
            detailMap.set(d.consolidator_id, list);
        }

        const invMap = new Map<number, number>();
        for (const j of junctions) {
            invMap.set(j.consolidator_id, (invMap.get(j.consolidator_id) || 0) + 1);
        }

        const productIds = [...new Set(details.map((d) => d.product_id).filter(Boolean))];
        let productMap = new Map<number, { product_name: string; product_code: string }>();
        if (productIds.length > 0) {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&fields=product_id,product_name,product_code&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (prodRes.ok) {
                const prodData: { product_id: number; product_name: string; product_code: string }[] =
                    (await prodRes.json()).data || [];
                productMap = new Map(prodData.map((p) => [p.product_id, p]));
            }
        }

        const branchMap = await getBranchesMap();

        const enriched = items.map(
            (c: {
                id: number;
                consolidator_no: string;
                status: string;
                created_by: number;
                checked_by: number | null;
                branch_id: number;
                created_at: string;
                updated_at: string;
            }) => {
                const batchDetails = detailMap.get(c.id) || [];
                return {
                    id: c.id,
                    consolidatorNo: c.consolidator_no,
                    status: c.status || "Picked",
                    createdBy: c.created_by,
                    checkedBy: c.checked_by,
                    branchId: c.branch_id,
                    branchName: branchMap.get(c.branch_id)?.branchName || `Branch #${c.branch_id}`,
                    invoiceCount: invMap.get(c.id) || 0,
                    createdAt: c.created_at,
                    updatedAt: c.updated_at,
                    details: batchDetails.map((d) => {
                        const prod = productMap.get(d.product_id);
                        return {
                            id: d.id,
                            consolidatorId: d.consolidator_id,
                            productId: d.product_id,
                            productName: prod?.product_name || `Product #${d.product_id}`,
                            productCode: prod?.product_code || "",
                            orderedQuantity: Number(d.ordered_quantity || 0),
                            pickedQuantity: Number(d.picked_quantity || 0),
                            appliedQuantity: Number(d.applied_quantity || 0),
                        };
                    }),
                    dispatches: [],
                    invoices: [],
                    totalSalesOrderAmount: 0,
                };
            }
        );

        return NextResponse.json({ content: enriched, totalElements: total, totalPages: Math.ceil(total / size) });
    } catch (e) {
        console.error("consolidation-approval GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── POST — approve batch / request re-pick (UTC persistence) ────────────────
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { batchId } = body;
        const action = body.action || "approve";

        if (!batchId) {
            return NextResponse.json({ message: "batchId is required" }, { status: 400 });
        }

        const utcNow = nowUtcSql();
        if (!utcNow) {
            return NextResponse.json({ message: "Failed to generate UTC timestamp" }, { status: 500 });
        }

        const getRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator?filter[id][_eq]=${batchId}&filter[is_delete][_eq]=0&limit=1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!getRes.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${getRes.status})` }, { status: getRes.status });
        }
        const items = (await getRes.json()).data || [];
        if (items.length === 0) {
            return NextResponse.json({ message: "Batch not found" }, { status: 404 });
        }
        const consolidator = items[0];

        if (action === "approve") {
            if (consolidator.status === "Approved" || consolidator.status === "Audited") {
                const junctionRes = await fetch(
                    `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&limit=-1&fields=invoice_id`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                const junctions: { invoice_id: number }[] = junctionRes.ok ? (await junctionRes.json()).data || [] : [];
                if (junctions.length > 0) {
                    const invoiceIds = junctions.map((j) => j.invoice_id);
                    const result = await transitionSalesOrderToForInvoicing(invoiceIds, userId, utcNow);
                    if (result.errors.length > 0) {
                        console.error("[consolidation-approval retry] SO transition errors:", result.errors);
                    }
                    const sodRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    const allDetailIds = sodRes.ok
                        ? ((await sodRes.json()).data || []).map((d: { detail_id: number }) => Number(d.detail_id))
                        : [];
                    if (allDetailIds.length > 0) {
                        const soRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Reserved&fields=reservation_id&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (soRes.ok) {
                            const soRows = (await soRes.json()).data || [];
                            for (const r of soRows) {
                                const id = Number(r.reservation_id || r.id);
                                await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${id}`, {
                                    method: "PATCH",
                                    headers: directusHeaders,
                                    body: JSON.stringify({ status: "Consumed", updated_by: userId, updated_at: utcNow }),
                                }).catch(() => null);
                            }
                        }
                    }
                }
                return NextResponse.json({ success: true, message: "Batch is already audited and synced" });
            }

            if (consolidator.status !== "Picked") {
                return NextResponse.json({ message: "Batch must be in Picked status before approval" }, { status: 400 });
            }

            const [invRes, detRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&limit=-1`, {
                    headers: directusHeaders,
                    cache: "no-store",
                }),
                fetch(`${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&limit=-1`, {
                    headers: directusHeaders,
                    cache: "no-store",
                }),
            ]);

            if (!invRes.ok || !detRes.ok) {
                return NextResponse.json({ message: "Failed to load batch data" }, { status: 502 });
            }

            const junctions = (await invRes.json()).data || [];
            const details = (await detRes.json()).data || [];

            for (const d of details) {
                const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator_details/${d.id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({ applied_quantity: Number(d.picked_quantity || 0) }),
                });
                if (!patchRes.ok) {
                    return NextResponse.json({ message: `Failed to apply quantity for detail ${d.id}` }, { status: 502 });
                }
            }

            if (junctions.length > 0) {
                const invoiceIds = junctions.map((j: { invoice_id: number }) => j.invoice_id);
                const [sodRes, sidRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);
                const allDetailIds: number[] = [
                    ...(sodRes.ok ? ((await sodRes.json()).data || []).map((d: { detail_id: number }) => Number(d.detail_id)) : []),
                    ...(sidRes.ok ? ((await sidRes.json()).data || []).map((d: { detail_id: number }) => Number(d.detail_id)) : []),
                ];

                if (allDetailIds.length > 0) {
                    const [soRes, siRes] = await Promise.all([
                        fetch(
                            `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Reserved&fields=*&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        ),
                        fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Reserved&fields=*&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        ),
                    ]);
                    if (soRes.ok) {
                        const soRows: Array<{ reservation_id?: number; id?: number; status?: string; picked_quantity?: number }> =
                            (await soRes.json()).data || [];
                        for (const r of soRows) {
                            const id = Number(r.reservation_id || r.id);
                            const isPicked = r.status === "Picked" || Number(r.picked_quantity || 0) > 0;
                            const targetStatus = isPicked ? "Consumed" : "Released";
                            await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${id}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({ status: targetStatus, updated_by: userId, updated_at: utcNow }),
                            }).catch(() => null);
                        }
                    }
                    if (siRes.ok) {
                        const siRows: Array<{ id: number; status?: string }> = (await siRes.json()).data || [];
                        for (const r of siRows) {
                            const isPicked = r.status === "Picked";
                            const targetStatus = isPicked ? "Consumed" : "Released";
                            await fetch(`${DIRECTUS_URL}/items/sales_invoice_reservation/${r.id}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({ status: targetStatus, updated_by: userId, updated_at: utcNow }),
                            }).catch(() => null);
                        }
                    }
                }
            }

            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ status: "Audited", checked_by: userId, updated_at: utcNow }),
            });
            if (!patchRes.ok) {
                return NextResponse.json(
                    { message: `Failed to update batch status (HTTP ${patchRes.status})` },
                    { status: patchRes.status }
                );
            }

            let transitionErrors: string[] = [];
            if (junctions.length > 0) {
                const result = await transitionSalesOrderToForInvoicing(
                    junctions.map((j: { invoice_id: number }) => j.invoice_id),
                    userId,
                    utcNow
                );
                transitionErrors = result.errors;
                if (transitionErrors.length > 0) {
                    console.error("[consolidation-approval] SO transition errors:", transitionErrors);
                }
            }

            return NextResponse.json({
                success: transitionErrors.length === 0,
                message:
                    transitionErrors.length > 0
                        ? `Batch audited but ${transitionErrors.length} sales order(s) failed to transition: ${transitionErrors.join("; ")}`
                        : "Batch audited successfully",
                checkedBy: userId,
                transitionErrors: transitionErrors.length > 0 ? transitionErrors : undefined,
            });
        }

        if (action === "repick") {
            if (consolidator.status !== "Picked") {
                return NextResponse.json({ message: "Only Picked batches can be re-picked" }, { status: 400 });
            }

            const movements = await fetchSourceMovements(batchId, TXN_TYPE_SALES_ISSUE);
            const compensations: PostMovementPayload[] = [];
            let compensatedCount = 0;
            const movementGroups = new Map<string, { movement: (typeof movements)[number]; net: number }>();

            for (const movement of movements) {
                const key = [
                    movement.product_id,
                    movement.lot_id,
                    movement.batch_no,
                    movement.expiry_date || "",
                    movement.manufacturing_date || "",
                ].join(":");
                const group = movementGroups.get(key) || { movement, net: 0 };
                group.net += Number(movement.quantity || 0);
                movementGroups.set(key, group);
            }

            for (const { movement: m, net } of movementGroups.values()) {
                if (net >= 0) continue;
                compensations.push({
                    product_id: m.product_id,
                    lot_id: m.lot_id,
                    branch_id: m.branch_id,
                    transaction_type_id: TXN_TYPE_SALES_ISSUE,
                    source_document_id: batchId,
                    source_document_no: consolidator.consolidator_no,
                    batch_no: m.batch_no,
                    expiry_date: m.expiry_date,
                    manufacturing_date: m.manufacturing_date,
                    quantity: Math.abs(net),
                    created_by: userId,
                    remarks: `Re-pick reversal - ${consolidator.consolidator_no}`,
                });
                compensatedCount++;
            }

            await syncProductLedgerToTarget({
                branchId: Number(consolidator.branch_id),
                documentNo: consolidator.consolidator_no,
                targetByProduct: new Map<number, number>(),
                description: `Re-pick reversal - ${consolidator.consolidator_no}`,
            });

            if (compensations.length > 0) {
                await postMovements(compensations);
            }

            const invoiceLinksRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            const invoiceIds: number[] = invoiceLinksRes.ok
                ? ((await invoiceLinksRes.json()).data || [])
                      .map((row: { invoice_id: number }) => Number(row.invoice_id))
                      .filter(Boolean)
                : [];

            if (invoiceIds.length > 0) {
                const [sodRes, sidRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);
                const allDetailIds: number[] = [
                    ...(sodRes.ok ? ((await sodRes.json()).data || []).map((d: { detail_id: number }) => Number(d.detail_id)) : []),
                    ...(sidRes.ok ? ((await sidRes.json()).data || []).map((d: { detail_id: number }) => Number(d.detail_id)) : []),
                ];

                if (allDetailIds.length > 0) {
                    const [soRes, siRes] = await Promise.all([
                        fetch(
                            `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Consumed&fields=reservation_id&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        ),
                        fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${allDetailIds.join(",")}&filter[status][_in]=Picked,Consumed&fields=id&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        ),
                    ]);

                    if (soRes.ok) {
                        const soRows: { reservation_id?: number; id?: number }[] = (await soRes.json()).data || [];
                        for (const r of soRows) {
                            const id = Number(r.reservation_id || r.id);
                            await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${id}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({
                                    status: "Reserved",
                                    picked_quantity: 0,
                                    updated_by: userId,
                                    updated_at: utcNow,
                                }),
                            }).catch(() => null);
                        }
                    }
                    if (siRes.ok) {
                        const siRows: { id: number }[] = (await siRes.json()).data || [];
                        for (const r of siRows) {
                            await fetch(`${DIRECTUS_URL}/items/sales_invoice_reservation/${r.id}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({ status: "Reserved", updated_by: userId, updated_at: utcNow }),
                            }).catch(() => null);
                        }
                    }
                }
            }

            const detRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (detRes.ok) {
                const details: { id: number }[] = (await detRes.json()).data || [];
                for (const d of details) {
                    const detailPatchRes = await fetch(`${DIRECTUS_URL}/items/consolidator_details/${d.id}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            picked_quantity: 0,
                            picked_by: null,
                            picked_at: null,
                            applied_quantity: 0,
                        }),
                    });
                    if (!detailPatchRes.ok) {
                        return NextResponse.json(
                            { message: `Failed to clear picking data for detail ${d.id}` },
                            { status: 502 }
                        );
                    }
                }
            }

            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({
                    status: "Picking",
                    checked_by: null,
                    updated_at: utcNow,
                }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: "Status revert failed" }, { status: 502 });
            }

            for (const orderId of invoiceIds) {
                await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        order_status: "For Picking",
                        modified_date: utcNow,
                        modified_by: userId,
                        updated_at: utcNow,
                    }),
                }).catch(() => null);
            }

            const msg =
                compensatedCount > 0
                    ? `Batch reverted to Picking (${compensatedCount} movement(s) compensated)`
                    : "Batch reverted to Picking (no movements to compensate)";

            return NextResponse.json({ success: true, message: msg, compensatedCount });
        }

        return NextResponse.json({ message: `Unknown action: ${action}` }, { status: 400 });
    } catch (e) {
        console.error("consolidation-approval POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
