import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";
import { nowUtcSql, parseUtc } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PICKING_STATUSES = ["For Picking", "Picking"];

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

// ─── GET — list picking-stage batches ────────────────────────────────────────
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
        qs.set("filter[status][_in]", PICKING_STATUSES.join(","));
        qs.set("sort", "-updated_at");
        qs.set("limit", String(size));
        qs.set("offset", String(page * size));
        qs.set("meta", "filter_count");

        if (search) {
            qs.set("filter[consolidator_no][_contains]", search);
        }

        const listRes = await fetch(`${DIRECTUS_URL}/items/consolidator?${qs.toString()}`, {
            headers: directusHeaders,
            cache: "no-store",
        });

        if (!listRes.ok) {
            return NextResponse.json({ message: `Directus error (HTTP ${listRes.status})` }, { status: listRes.status });
        }

        const json = await listRes.json();
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
            picked_by: number | null;
            picked_at: string | null;
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
                    status: c.status || "Picking",
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
                            pickedById: d.picked_by,
                            pickedAt: d.picked_at,
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
        console.error("consolidation-picking GET error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── POST — start picking / complete picking (UTC persistence) ───────────────
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { batchId, action } = body;

        if (!batchId || !action) {
            return NextResponse.json({ message: "batchId and action are required" }, { status: 400 });
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
        const currentStatus = consolidator.status || "Pending";

        if (action === "start") {
            if (!["Pending", "For Picking", "Picking"].includes(currentStatus)) {
                return NextResponse.json({ message: "Batch must be in Pending or For Picking status to start" }, { status: 400 });
            }
            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({ status: "Picking", updated_at: utcNow }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: `Failed to update status (HTTP ${patchRes.status})` }, { status: patchRes.status });
            }

            const invoiceLinksRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (invoiceLinksRes.ok) {
                const invoiceIds: number[] = ((await invoiceLinksRes.json()).data || [])
                    .map((row: { invoice_id: number }) => Number(row.invoice_id))
                    .filter(Boolean);
                for (const orderId of invoiceIds) {
                    await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            order_status: "For Picking",
                            for_picking_at: utcNow,
                            modified_date: utcNow,
                            modified_by: userId,
                            updated_at: utcNow,
                        }),
                    }).catch((err) => {
                        console.warn(`[consolidation-picking start] Failed to update sales_order ${orderId}:`, err);
                    });
                }
            }

            return NextResponse.json({ success: true, message: "Batch moved to Picking", status: "Picking" });
        }

        if (action === "complete") {
            if (currentStatus !== "Picking" && currentStatus !== "For Picking") {
                return NextResponse.json({ message: "Only Picking or For Picking batches can be completed" }, { status: 400 });
            }

            const manualOrderDistributions = Array.isArray(body.orderDistributions) ? body.orderDistributions : null;

            const detailRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            if (!detailRes.ok) {
                return NextResponse.json({ message: "Failed to load batch details" }, { status: 502 });
            }
            const details: { id: number; product_id: number; ordered_quantity: number; picked_quantity: number }[] =
                (await detailRes.json()).data || [];

            if (details.length === 0) {
                return NextResponse.json({ message: "Batch has no details" }, { status: 400 });
            }

            const invoiceLinksRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );
            let invoiceIds: number[] = [];
            if (invoiceLinksRes.ok) {
                invoiceIds = ((await invoiceLinksRes.json()).data || [])
                    .map((row: { invoice_id: number }) => Number(row.invoice_id))
                    .filter(Boolean);
            }

            const salesOrdersMap = new Map<number, { order_id: number; order_date?: string; created_date?: string }>();
            if (invoiceIds.length > 0) {
                const soListRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${invoiceIds.join(",")}&fields=order_id,order_date,created_date&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (soListRes.ok) {
                    const soList = (await soListRes.json()).data || [];
                    for (const so of soList) {
                        salesOrdersMap.set(Number(so.order_id), so);
                    }
                }
            }

            const orderItemDetails: { detail_id: number; order_id: number; product_id: number; ordered_quantity?: number }[] = [];
            if (invoiceIds.length > 0) {
                const [sodRes, sidRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id,order_id,product_id,ordered_quantity&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_in]=${invoiceIds.join(",")}&fields=detail_id,invoice_no,product_id,quantity&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);
                if (sodRes.ok) {
                    const sodData = (await sodRes.json()).data || [];
                    orderItemDetails.push(
                        ...sodData.map((d: { detail_id: number; order_id: number; product_id: number; ordered_quantity?: number }) => ({
                            detail_id: Number(d.detail_id),
                            order_id: Number(d.order_id),
                            product_id: Number(d.product_id),
                            ordered_quantity: Number(d.ordered_quantity || 0),
                        }))
                    );
                }
                if (sidRes.ok) {
                    const sidData = (await sidRes.json()).data || [];
                    orderItemDetails.push(
                        ...sidData.map((d: { detail_id: number; invoice_no: number; product_id: number; quantity?: number }) => ({
                            detail_id: Number(d.detail_id),
                            order_id: Number(d.invoice_no),
                            product_id: Number(d.product_id),
                            ordered_quantity: Number(d.quantity || 0),
                        }))
                    );
                }
            }

            const orderProductPickedMap = new Map<string, number>();
            if (manualOrderDistributions && manualOrderDistributions.length > 0) {
                for (const dist of manualOrderDistributions) {
                    const targetOrdId = Number(dist.orderId || dist.invoiceId);
                    const prodId = Number(dist.productId);
                    const qty = Math.max(0, Number(dist.pickedQuantity) || 0);
                    if (targetOrdId && prodId) {
                        orderProductPickedMap.set(`${targetOrdId}:${prodId}`, qty);
                    }
                }
            } else {
                for (const d of details) {
                    const prodId = Number(d.product_id);
                    let remainingBudget = Number(d.picked_quantity ?? d.ordered_quantity ?? 0);
                    const matchingLines = orderItemDetails.filter((item) => item.product_id === prodId);
                    matchingLines.sort((a, b) => {
                        const soA = salesOrdersMap.get(a.order_id);
                        const soB = salesOrdersMap.get(b.order_id);
                        const dateA = parseUtc(soA?.order_date || soA?.created_date)?.getTime() ?? 0;
                        const dateB = parseUtc(soB?.order_date || soB?.created_date)?.getTime() ?? 0;
                        if (dateA !== dateB) return dateA - dateB;
                        return a.order_id - b.order_id;
                    });
                    for (const line of matchingLines) {
                        const lineReq = Number(line.ordered_quantity || 0);
                        const alloc = Math.min(remainingBudget, lineReq);
                        orderProductPickedMap.set(`${line.order_id}:${prodId}`, alloc);
                        remainingBudget = Math.max(0, remainingBudget - alloc);
                    }
                }
            }

            const invoiceDetailIds: number[] = orderItemDetails.map((row) => Number(row.detail_id)).filter(Boolean);
            const postPickedResIds = Array.isArray(body.pickedReservationIds) ? body.pickedReservationIds : null;
            const postPickedLotIds = Array.isArray(body.pickedLotIds) ? body.pickedLotIds : null;

            if (invoiceDetailIds.length > 0) {
                const [soRes, siRes] = await Promise.all([
                    fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${invoiceDetailIds.join(",")}&filter[status][_in]=Reserved,Picked&limit=-1&fields=reservation_id,id,inventory_lot_id,status,reserved_quantity,picked_quantity`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                    fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_reservation?filter[sales_invoice_detail_id][_in]=${invoiceDetailIds.join(",")}&filter[status][_in]=Reserved,Picked&limit=-1&fields=id,inventory_lot_id,status`,
                        { headers: directusHeaders, cache: "no-store" }
                    ),
                ]);

                if (soRes.ok) {
                    const soData = (await soRes.json()).data || [];
                    const hasExplicitLists = Boolean(postPickedResIds || postPickedLotIds);
                    const anyAlreadyPicked = soData.some(
                        (r: { status?: string; picked_quantity?: number }) =>
                            r.status === "Picked" || Number(r.picked_quantity || 0) > 0
                    );

                    for (const r of soData) {
                        const rId = Number(r.reservation_id || r.id);
                        const rawInv =
                            typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                                ? (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).id ||
                                  (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).inventory_lot_id
                                : r.inventory_lot_id;
                        const invId = Number(rawInv || 0);
                        const resQty = Number(r.reserved_quantity || 0);
                        const currentPickedQty = Number(r.picked_quantity || 0);

                        let isPicked: boolean;
                        let nextPickedQty: number;
                        if (anyAlreadyPicked) {
                            // Respect exact per-lot picked quantities saved by PATCH
                            isPicked = currentPickedQty > 0;
                            nextPickedQty = isPicked ? currentPickedQty : 0;
                        } else if (hasExplicitLists) {
                            isPicked = Boolean(
                                (postPickedResIds && postPickedResIds.includes(rId)) ||
                                    (postPickedLotIds && postPickedLotIds.includes(invId))
                            );
                            nextPickedQty = isPicked ? resQty : 0;
                        } else {
                            isPicked = resQty > 0;
                            nextPickedQty = resQty;
                        }

                        const nextStatus = isPicked ? "Picked" : "Reserved";

                        if (r.status !== nextStatus || currentPickedQty !== nextPickedQty) {
                            await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({
                                    status: nextStatus,
                                    picked_quantity: nextPickedQty,
                                    updated_by: userId,
                                    updated_at: utcNow,
                                }),
                            }).catch(() => null);
                        }
                    }
                }

                if (siRes.ok) {
                    const siData = (await siRes.json()).data || [];
                    for (const r of siData) {
                        const rId = Number(r.id);
                        const rawInv =
                            typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                                ? (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).id ||
                                  (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).inventory_lot_id
                                : r.inventory_lot_id;
                        const invId = Number(rawInv || 0);
                        const isPicked =
                            (postPickedResIds && postPickedResIds.includes(rId)) ||
                            (postPickedLotIds && postPickedLotIds.includes(invId));

                        const nextStatus = isPicked ? "Picked" : "Reserved";
                        if (r.status !== nextStatus) {
                            await fetch(`${DIRECTUS_URL}/items/sales_invoice_reservation/${rId}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({
                                    status: nextStatus,
                                    updated_by: userId,
                                    updated_at: utcNow,
                                }),
                            }).catch(() => null);
                        }
                    }
                }
            }

            for (const d of details) {
                await fetch(`${DIRECTUS_URL}/items/consolidator_details/${d.id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        picked_quantity: Number(d.picked_quantity ?? d.ordered_quantity ?? 0),
                        picked_by: userId,
                        picked_at: utcNow,
                    }),
                }).catch(() => null);
            }

            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({
                    status: "Picked",
                    updated_at: utcNow,
                    updated_by: userId,
                }),
            });
            if (!patchRes.ok) {
                return NextResponse.json({ message: "Failed to update batch status to Picked" }, { status: 502 });
            }

            for (const orderId of invoiceIds) {
                await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        order_status: "Picked",
                        modified_date: utcNow,
                        modified_by: userId,
                        updated_at: utcNow,
                    }),
                }).catch((err) => {
                    console.warn(`[consolidation-picking complete] Failed to update sales_order ${orderId}:`, err);
                });
            }

            return NextResponse.json({
                success: true,
                message: `Batch ${consolidator.consolidator_no} successfully marked as Picked`,
                status: "Picked",
            });
        }

        return NextResponse.json({ message: "Action must be 'start' or 'complete'" }, { status: 400 });
    } catch (e) {
        console.error("consolidation-picking POST error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}

// ─── PATCH — save picked quantities (UTC persistence) ────────────────────────
export async function PATCH(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken();
        if (!userId || isNaN(userId)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { batchId, quantities, pickedReservationIds, pickedLotIds } = body;

        if (!batchId || !quantities || !Array.isArray(quantities) || quantities.length === 0) {
            return NextResponse.json({ message: "batchId and quantities are required" }, { status: 400 });
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
        if (!["For Picking", "Picking"].includes(consolidator.status)) {
            return NextResponse.json(
                { message: "Can only update quantities for batches in For Picking or Picking status" },
                { status: 400 }
            );
        }

        const batchDetailsRes = await fetch(
            `${DIRECTUS_URL}/items/consolidator_details?filter[consolidator_id][_eq]=${batchId}&fields=id&limit=-1`,
            { headers: directusHeaders, cache: "no-store" }
        );
        if (!batchDetailsRes.ok) {
            return NextResponse.json({ message: "Failed to load batch details" }, { status: 502 });
        }
        const batchDetailIds = new Set<number>(
            ((await batchDetailsRes.json()).data || []).map((d: { id: number }) => d.id)
        );
        for (const q of quantities) {
            if (!batchDetailIds.has(q.detailId)) {
                return NextResponse.json({ message: `Detail ${q.detailId} does not belong to this batch` }, { status: 403 });
            }
        }

        for (const q of quantities) {
            if (!q.detailId || typeof q.pickedQuantity !== "number" || q.pickedQuantity < 0) {
                return NextResponse.json(
                    { message: "Each quantity must have a valid detailId and non-negative pickedQuantity" },
                    { status: 400 }
                );
            }
            const patchRes = await fetch(`${DIRECTUS_URL}/items/consolidator_details/${q.detailId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify({
                    picked_quantity: q.pickedQuantity,
                    picked_by: userId,
                    picked_at: utcNow,
                }),
            });
            if (!patchRes.ok) {
                return NextResponse.json(
                    { message: `Failed to update detail ${q.detailId} (HTTP ${patchRes.status})` },
                    { status: patchRes.status }
                );
            }
        }

        if (Array.isArray(pickedReservationIds) || Array.isArray(pickedLotIds)) {
            try {
                const linksRes = await fetch(
                    `${DIRECTUS_URL}/items/consolidator_invoices?filter[consolidator_id][_eq]=${batchId}&fields=invoice_id&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (linksRes.ok) {
                    const invoiceIds = ((await linksRes.json()).data || [])
                        .map((row: { invoice_id: number }) => Number(row.invoice_id))
                        .filter(Boolean);

                    if (invoiceIds.length > 0) {
                        const sodRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${invoiceIds.join(",")}&fields=detail_id,order_id,product_id,ordered_quantity&limit=-1`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (sodRes.ok) {
                            const sodList: { detail_id: number; order_id: number; product_id: number; ordered_quantity: number }[] =
                                ((await sodRes.json()).data || [])
                                    .map((row: { detail_id: number; order_id: number; product_id: number; ordered_quantity?: number }) => ({
                                        detail_id: Number(row.detail_id),
                                        order_id: Number(row.order_id),
                                        product_id: Number(row.product_id),
                                        ordered_quantity: Number(row.ordered_quantity ?? 0),
                                    }))
                                    .filter((d: { detail_id: number; product_id: number }) => Boolean(d.detail_id));
                            const detailIds = sodList.map((d) => d.detail_id);

                            if (detailIds.length > 0) {
                                const soRes = await fetch(
                                    `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&filter[status][_in]=Reserved,Picked,Consumed&limit=-1`,
                                    { headers: directusHeaders, cache: "no-store" }
                                );
                                if (soRes.ok) {
                                    const reservations: Array<{
                                        id?: number;
                                        reservation_id?: number;
                                        sales_order_detail_id?: number;
                                        product_id?: number;
                                        inventory_lot_id?: unknown;
                                        lot_id?: number;
                                        batch_no?: string;
                                        reserved_quantity?: number;
                                        quantity?: number;
                                        picked_quantity?: number;
                                        status?: string;
                                    }> = (await soRes.json()).data || [];

                                    const lotPickedItems = Array.isArray(body.lotPickedItems) ? body.lotPickedItems : null;

                                    if (lotPickedItems && lotPickedItems.length > 0) {
                                        // Build mm_inventory_lots lookup so floor-picked lots always resolve a valid FK
                                        const itemProductIds = [
                                            ...new Set(
                                                lotPickedItems
                                                    .map((x: { productId?: number }) => Number(x.productId))
                                                    .filter(Boolean)
                                            ),
                                        ];
                                        const validInvLotIds = new Set<number>();
                                        const invLotLookup = new Map<string, number>();

                                        if (itemProductIds.length > 0) {
                                            const invLotsRes = await fetch(
                                                `${DIRECTUS_URL}/items/mm_inventory_lots?filter[product_id][_in]=${itemProductIds.join(",")}&fields=inventory_lot_id,id,product_id,lot_id,batch_no&limit=-1`,
                                                { headers: directusHeaders, cache: "no-store" }
                                            ).catch(() => null);
                                            if (invLotsRes && invLotsRes.ok) {
                                                const invRows: Array<Record<string, unknown>> = (await invLotsRes.json()).data || [];
                                                for (const row of invRows) {
                                                    const id = Number(row.inventory_lot_id || row.id || 0);
                                                    const p = Number(
                                                        typeof row.product_id === "object" && row.product_id !== null
                                                            ? (row.product_id as { product_id?: number }).product_id
                                                            : row.product_id || 0
                                                    );
                                                    const lId = Number(
                                                        typeof row.lot_id === "object" && row.lot_id !== null
                                                            ? (row.lot_id as { lot_id?: number; id?: number }).lot_id ||
                                                              (row.lot_id as { lot_id?: number; id?: number }).id
                                                            : row.lot_id || 0
                                                    );
                                                    const bNo = String(row.batch_no || "").trim().toLowerCase();
                                                    if (id > 0) {
                                                        validInvLotIds.add(id);
                                                        if (p && bNo) {
                                                            if (lId) invLotLookup.set(`${p}:${lId}:${bNo}`, id);
                                                            if (!invLotLookup.has(`${p}:${bNo}`)) {
                                                                invLotLookup.set(`${p}:${bNo}`, id);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        const resolveInventoryLotId = async (item: (typeof lotPickedItems)[0]): Promise<number> => {
                                            const incomingId = Number(item.inventoryLotId || 0);
                                            if (incomingId > 0 && validInvLotIds.has(incomingId)) {
                                                return incomingId;
                                            }
                                            const pId = Number(item.productId || 0);
                                            const lId = Number(item.lotId || 0);
                                            const rawBatch = String(item.batchNo || "").trim();
                                            const normBatch = rawBatch.toLowerCase();
                                            const mapped =
                                                (pId && lId && normBatch ? invLotLookup.get(`${pId}:${lId}:${normBatch}`) : undefined) ||
                                                (pId && normBatch ? invLotLookup.get(`${pId}:${normBatch}`) : undefined);
                                            if (mapped && mapped > 0) {
                                                return mapped;
                                            }
                                            if (pId > 0 && lId > 0 && rawBatch && rawBatch !== "LOT-N/A") {
                                                const createLotRes = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots`, {
                                                    method: "POST",
                                                    headers: directusHeaders,
                                                    body: JSON.stringify({
                                                        lot_id: lId,
                                                        branch_id: Number(consolidator.branch_id),
                                                        product_id: pId,
                                                        batch_no: rawBatch,
                                                        expiry_date: item.expiryDate || null,
                                                        qa_status: "GOOD",
                                                        status: "ACTIVE",
                                                        created_at: utcNow,
                                                        updated_at: utcNow,
                                                        created_by: userId,
                                                        updated_by: userId,
                                                    }),
                                                }).catch(() => null);
                                                if (createLotRes && createLotRes.ok) {
                                                    const createdRow = (await createLotRes.json()).data;
                                                    const newInvId = Number(createdRow?.inventory_lot_id || createdRow?.id || 0);
                                                    if (newInvId > 0) {
                                                        validInvLotIds.add(newInvId);
                                                        invLotLookup.set(`${pId}:${lId}:${normBatch}`, newInvId);
                                                        invLotLookup.set(`${pId}:${normBatch}`, newInvId);
                                                        return newInvId;
                                                    }
                                                }
                                            }
                                            return incomingId;
                                        };

                                        // Initialize all active reservations to picked = 0 so unpicked lots are explicitly cleared
                                        const pickedByResId = new Map<number, number>();
                                        const reservedByResId = new Map<number, number>();
                                        for (const r of reservations) {
                                            if (r.status === "Consumed") continue;
                                            const rId = Number(r.reservation_id || r.id || 0);
                                            if (!rId) continue;
                                            pickedByResId.set(rId, 0);
                                            reservedByResId.set(rId, Number(r.reserved_quantity ?? r.quantity ?? 0));
                                        }

                                        const detailAllocatedMap = new Map<number, number>();
                                        const remainingItemsWithBudget: Array<{ item: (typeof lotPickedItems)[0]; budget: number }> = [];

                                        // Pass 1: Assign picked quantities to each item's existing reservations up to reserved_quantity
                                        for (const item of lotPickedItems) {
                                            let budget = Math.max(0, Number(item.pickedQuantity || 0));
                                            const itemResIds = (item.reservationIds || []).map(Number).filter(Boolean);

                                            if (itemResIds.length > 0) {
                                                for (const rId of itemResIds) {
                                                    const r = reservations.find((x) => Number(x.reservation_id || x.id) === rId);
                                                    if (!r || r.status === "Consumed") continue;

                                                    const resQty = reservedByResId.get(rId) ?? Number(r.reserved_quantity ?? r.quantity ?? 0);
                                                    const pickedPart = Math.min(budget, resQty);
                                                    budget = Math.max(0, budget - pickedPart);

                                                    pickedByResId.set(rId, (pickedByResId.get(rId) || 0) + pickedPart);
                                                    const sodId = Number(r.sales_order_detail_id);
                                                    detailAllocatedMap.set(sodId, (detailAllocatedMap.get(sodId) || 0) + pickedPart);
                                                }
                                            }

                                            if (budget > 0) {
                                                remainingItemsWithBudget.push({ item, budget });
                                            }
                                        }

                                        // Pass 2: Allocate floor-picked lots or surplus above initial reserved_quantity
                                        for (const { item, budget: initialBudget } of remainingItemsWithBudget) {
                                            let budget = initialBudget;
                                            const resolvedInvLotId = await resolveInventoryLotId(item);
                                            if (!resolvedInvLotId || resolvedInvLotId <= 0) {
                                                throw new Error(
                                                    `Cannot save picked quantity: storage lot for batch "${item.batchNo || "N/A"}" is not registered in mm_inventory_lots.`
                                                );
                                            }

                                            const matchingDetails = sodList.filter((d) => d.product_id === Number(item.productId));

                                            const allocateToDetail = async (detailRowId: number, allocQty: number) => {
                                                const existingRes = reservations.find((r) => {
                                                    if (r.status === "Consumed") return false;
                                                    const rSod = Number(r.sales_order_detail_id);
                                                    const rawInv =
                                                        typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                                                            ? (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).id ||
                                                              (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).inventory_lot_id
                                                            : r.inventory_lot_id;
                                                    return rSod === detailRowId && Number(rawInv || 0) === resolvedInvLotId;
                                                });

                                                if (existingRes) {
                                                    const exId = Number(existingRes.reservation_id || existingRes.id);
                                                    const nextPicked = (pickedByResId.get(exId) || 0) + allocQty;
                                                    pickedByResId.set(exId, nextPicked);
                                                    reservedByResId.set(
                                                        exId,
                                                        Math.max(reservedByResId.get(exId) || 0, nextPicked)
                                                    );
                                                } else {
                                                    const createRes = await fetch(`${DIRECTUS_URL}/items/sales_order_reservation`, {
                                                        method: "POST",
                                                        headers: directusHeaders,
                                                        body: JSON.stringify({
                                                            sales_order_detail_id: detailRowId,
                                                            product_id: Number(item.productId),
                                                            inventory_lot_id: resolvedInvLotId,
                                                            reserved_quantity: allocQty,
                                                            picked_quantity: allocQty,
                                                            status: "Picked",
                                                            created_by: userId,
                                                            created_at: utcNow,
                                                            updated_by: userId,
                                                            updated_at: utcNow,
                                                        }),
                                                    });
                                                    if (!createRes.ok) {
                                                        const errTxt = await createRes.text().catch(() => "");
                                                        throw new Error(
                                                            `Failed to create reservation for batch "${item.batchNo || "N/A"}": ${errTxt || createRes.status}`
                                                        );
                                                    }
                                                    const createdData = (await createRes.json()).data;
                                                    const newResId = Number(createdData?.reservation_id || createdData?.id || 0);
                                                    if (newResId > 0) {
                                                        reservations.push({
                                                            reservation_id: newResId,
                                                            sales_order_detail_id: detailRowId,
                                                            product_id: Number(item.productId),
                                                            inventory_lot_id: resolvedInvLotId,
                                                            reserved_quantity: allocQty,
                                                            picked_quantity: allocQty,
                                                            status: "Picked",
                                                        });
                                                        pickedByResId.set(newResId, allocQty);
                                                        reservedByResId.set(newResId, allocQty);
                                                    }
                                                }
                                            };

                                            for (const d of matchingDetails) {
                                                if (budget <= 0) break;
                                                const curAlloc = detailAllocatedMap.get(d.detail_id) || 0;
                                                const deficit = Math.max(0, d.ordered_quantity - curAlloc);
                                                if (deficit <= 0) continue;

                                                const allocQty = Math.min(budget, deficit);
                                                budget -= allocQty;
                                                detailAllocatedMap.set(d.detail_id, curAlloc + allocQty);
                                                await allocateToDetail(d.detail_id, allocQty);
                                            }

                                            if (budget > 0 && matchingDetails.length > 0) {
                                                const fallbackDetail = matchingDetails[matchingDetails.length - 1];
                                                const curAlloc = detailAllocatedMap.get(fallbackDetail.detail_id) || 0;
                                                detailAllocatedMap.set(fallbackDetail.detail_id, curAlloc + budget);
                                                await allocateToDetail(fallbackDetail.detail_id, budget);
                                                budget = 0;
                                            }
                                        }

                                        // Persist final per-reservation picked_quantity, reserved_quantity, and status
                                        for (const [rId, finalPickedRaw] of pickedByResId.entries()) {
                                            const finalPicked = Number(finalPickedRaw.toFixed(4));
                                            const finalReserved = Number((reservedByResId.get(rId) ?? finalPicked).toFixed(4));
                                            const finalStatus = finalPicked > 0 ? "Picked" : "Reserved";

                                            const patchRes = await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                method: "PATCH",
                                                headers: directusHeaders,
                                                body: JSON.stringify({
                                                    picked_quantity: finalPicked,
                                                    reserved_quantity: finalReserved,
                                                    status: finalStatus,
                                                    updated_at: utcNow,
                                                    updated_by: userId,
                                                }),
                                            });
                                            if (!patchRes.ok) {
                                                const errTxt = await patchRes.text().catch(() => "");
                                                throw new Error(`Failed to save picked lot reservation #${rId}: ${errTxt || patchRes.status}`);
                                            }
                                        }
                                    } else {
                                        for (const r of reservations) {
                                            const rId = Number(r.id || r.reservation_id);
                                            const rawInv =
                                                typeof r.inventory_lot_id === "object" && r.inventory_lot_id !== null
                                                    ? (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).id ||
                                                      (r.inventory_lot_id as { id?: number; inventory_lot_id?: number }).inventory_lot_id
                                                    : r.inventory_lot_id;
                                            const invId = Number(rawInv || 0);

                                            const isPicked =
                                                (pickedReservationIds && pickedReservationIds.includes(rId)) ||
                                                (pickedLotIds && pickedLotIds.includes(invId));

                                            const resQty = Number(r.reserved_quantity ?? r.quantity ?? 0);
                                            if (isPicked && r.status !== "Picked") {
                                                await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                    method: "PATCH",
                                                    headers: directusHeaders,
                                                    body: JSON.stringify({
                                                        picked_quantity: resQty,
                                                        status: "Picked",
                                                        updated_at: utcNow,
                                                        updated_by: userId,
                                                    }),
                                                }).catch(() => null);
                                            } else if (!isPicked && r.status === "Picked") {
                                                await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${rId}`, {
                                                    method: "PATCH",
                                                    headers: directusHeaders,
                                                    body: JSON.stringify({
                                                        picked_quantity: 0,
                                                        status: "Reserved",
                                                        updated_at: utcNow,
                                                        updated_by: userId,
                                                    }),
                                                }).catch(() => null);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        for (const orderId of invoiceIds) {
                            await fetch(`${DIRECTUS_URL}/items/sales_order/${orderId}`, {
                                method: "PATCH",
                                headers: directusHeaders,
                                body: JSON.stringify({
                                    order_status: "For Picking",
                                    for_picking_at: utcNow,
                                    modified_date: utcNow,
                                    modified_by: userId,
                                    updated_at: utcNow,
                                }),
                            }).catch(() => null);
                        }
                    }
                }
            } catch (err) {
                console.error("[consolidation-picking PATCH] Failed updating sales_order_reservation lot statuses:", err);
                const msg = err instanceof Error ? err.message : "Failed to save picked lot reservations";
                return NextResponse.json({ message: msg }, { status: 422 });
            }
        }

        await fetch(`${DIRECTUS_URL}/items/consolidator/${batchId}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({ status: "Picking", updated_at: utcNow }),
        });

        return NextResponse.json({ success: true, message: "Picking progress and batch lot statuses updated" });
    } catch (e) {
        console.error("consolidation-picking PATCH error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
