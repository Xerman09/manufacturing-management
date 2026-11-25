// src/app/api/manufacturing/sales-and-fulfillment/fulfilment-and-deliveries/route.ts

import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";
import { getPhTimestamp } from "../../invoice-consolidation/_time-utils";
import { ConsolidatedDeliveryRecord, ConsolidatedSalesOrderRecord } from "@/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LineItemReservation {
    reservation_id: number;
    sales_order_detail_id: number;
    inventory_lot_id: number;
    product_id?: number;
    lot_id?: number;
    lot_name?: string;
    lot_number?: string;
    batch_no?: string;
    reserved_quantity: number;
    picked_quantity: number;
    returned_quantity?: number;
    status: string;
    created_at?: string;
}



interface DirectusInvoice {
    id?: number;
    invoice_id: number;
    order_id: string | number | Record<string, unknown>;
    customer_code?: string;
    invoice_no?: string;
    invoice_date?: string;
    dispatch_date?: string;
    transaction_status?: string;
    payment_status?: string;
    total_amount?: number;
    net_amount?: number;
    branch_id?: number;
    salesman_id?: number | Record<string, unknown>;
    salesman_code?: string;
    salesman_name?: string;
    isDispatched?: number | boolean;
    isDelivered?: number | boolean;
    remarks?: string;
    created_date?: string;
}

interface DirectusSalesOrder {
    id?: number;
    order_id: number;
    order_no: string;
    customer_code: string;
    order_status: string;
    branch_id?: number;
    total_amount?: number;
    net_amount?: number;
    order_date?: string;
    delivery_date?: string;
    created_date?: string;
    isDelivered?: number | boolean;
    delivered_at?: string | null;
    not_fulfilled_at?: string | null;
    invoice_id?: number;
    invoice_no?: string;
    salesman_id?: number | Record<string, unknown>;
    salesman_code?: string;
    salesman_name?: string;
    remarks?: string;
}

interface DirectusDispatchPlan {
    dispatch_id: number;
    dispatch_no: string;
    dispatch_date?: string | null;
    departure_date?: string | null;
    arrival_date?: string | null;
    driver_id?: number | null;
    helper_id?: number | null;
    vehicle_id?: number | null;
    branch_id?: number | null;
    status: string;
    total_amount?: number | null;
    remarks?: string | null;
    created_at?: string | null;
    is_delete?: number | boolean | string | { type?: string; data?: number[] } | null;
}

interface DirectusDispatchDetail {
    detail_id: number;
    dispatch_id: number;
    sales_order_id: number;
}

interface DirectusSalesOrderDetail {
    id?: number;
    detail_id?: number;
    order_id: number;
    product_id: number;
    ordered_quantity: number;
    allocated_quantity?: number;
    served_quantity?: number;
    unit_price?: number;
    gross_amount?: number;
    net_amount?: number;
    remarks?: string;
}

interface DirectusProduct {
    product_id: number;
    product_name: string;
    product_code: string;
    description?: string;
    short_description?: string;
    product_type?: number | string | { id?: number; type_id?: number; name?: string } | null;
    unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } | string | null;
}

interface DirectusCustomer {
    id: number;
    customer_name: string;
    customer_code: string;
}

interface DirectusBranch {
    id: number;
    branch_name: string;
    branch_code: string;
    isActive?: number | boolean;
}

interface DirectusSalesman {
    id: number;
    salesman_code: string;
    salesman_name: string;
}

// ─── GET: Fetch Consolidated Delivery Manifests ───────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
        const size = Math.max(1, Math.min(100, parseInt(searchParams.get("size") || "50", 10)));
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const statusFilter = searchParams.get("status") || "All";
        const branchIdParam = searchParams.get("branchId");

        // 1. Fetch active branches for lookup (only isActive = 1)
        const branchRes = await fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code,isActive`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const branches: DirectusBranch[] = branchRes.ok ? (await branchRes.json()).data || [] : [];
        const branchMap = new Map<number, DirectusBranch>(branches.map((b) => [Number(b.id), b]));

        // 2. Fetch candidate dispatch plans (lightweight list with only existing fields)
        const dispatchQs = new URLSearchParams();
        dispatchQs.set("limit", "-1");
        dispatchQs.set("sort", "-created_at,-dispatch_id");
        dispatchQs.set("fields", "dispatch_id,dispatch_no,dispatch_date,driver_id,vehicle_id,branch_id,status,total_amount,remarks,created_at,is_delete");
        dispatchQs.set("filter[status][_in]", "Dispatched,Approved,Completed,Delivered,Audited");

        if (branchIdParam && branchIdParam !== "All") {
            dispatchQs.set("filter[branch_id][_eq]", String(branchIdParam));
        }

        const dpRes = await fetch(
            `${DIRECTUS_URL}/items/dispatch_plan?${dispatchQs.toString()}`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const allDispatchPlansRaw: DirectusDispatchPlan[] = dpRes.ok ? (await dpRes.json()).data || [] : [];
        const allDispatchPlans = allDispatchPlansRaw.filter((dp) => {
            const isDel = dp.is_delete;
            if (isDel === true || isDel === 1 || isDel === "1") return false;
            if (isDel && typeof isDel === "object" && "data" in isDel) {
                const d = (isDel as { data?: number[] }).data;
                if (Array.isArray(d) && d.length > 0 && d[0] === 1) return false;
            }
            return true;
        });

        // 3. Fetch drivers and vehicles only for candidate plans
        const candidateDriverIds = [...new Set(allDispatchPlans.map((dp) => Number(dp.driver_id)).filter(Boolean))];
        const candidateVehicleIds = [...new Set(allDispatchPlans.map((dp) => Number(dp.vehicle_id)).filter(Boolean))];

        const driverNameMap = new Map<number, string>();
        const vehicleMap = new Map<number, string>();

        await Promise.all([
            candidateDriverIds.length > 0
                ? fetch(
                    `${DIRECTUS_URL}/items/user?filter[user_id][_in]=${candidateDriverIds.slice(0, 100).join(",")}&fields=user_id,user_fname,user_lname&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ).then(async (r) => {
                    if (r.ok) {
                        const uData = (await r.json()).data || [];
                        for (const u of uData) {
                            const name = [u.user_fname, u.user_lname].filter(Boolean).join(" ").trim();
                            if (name) driverNameMap.set(Number(u.user_id), name);
                        }
                    }
                }).catch(() => null)
                : Promise.resolve(null),

            candidateVehicleIds.length > 0
                ? fetch(
                    `${DIRECTUS_URL}/items/vehicles?filter[vehicle_id][_in]=${candidateVehicleIds.slice(0, 100).join(",")}&fields=vehicle_id,vehicle_plate,name&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                ).then(async (r) => {
                    if (r.ok) {
                        const vData = (await r.json()).data || [];
                        for (const v of vData) {
                            const vId = Number(v.vehicle_id);
                            const is3PL =
                                v.name?.toLowerCase().includes("third party") ||
                                v.name?.toLowerCase().includes("3rd party") ||
                                v.vehicle_plate?.toLowerCase().includes("3pl") ||
                                vId === 245;
                            const plate = v.vehicle_plate?.trim();
                            const name = v.name?.trim();
                            const label = plate
                                ? (name && name !== plate ? `${plate} — ${name}` : plate)
                                : (name || (is3PL ? "3PL — Third Party Logistics" : `Vehicle #${vId}`));
                            vehicleMap.set(vId, label);
                        }
                    }
                }).catch(() => null)
                : Promise.resolve(null),
        ]);

        // 4. Search matching dispatch_ids if a search term was provided
        const matchingDispatchIdsFromSearch = new Set<number>();
        if (search) {
            try {
                const [soSearchRes, invSearchRes, custSearchRes] = await Promise.all([
                    fetch(`${DIRECTUS_URL}/items/sales_order?filter[order_no][_icontains]=${encodeURIComponent(search)}&fields=order_id&limit=50`, { headers: directusHeaders, cache: "no-store" }),
                    fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[invoice_no][_icontains]=${encodeURIComponent(search)}&fields=order_id,invoice_id&limit=50`, { headers: directusHeaders, cache: "no-store" }),
                    fetch(`${DIRECTUS_URL}/items/customer?filter[customer_name][_icontains]=${encodeURIComponent(search)}&fields=customer_code&limit=50`, { headers: directusHeaders, cache: "no-store" }),
                ]);
                const soIds: number[] = [];
                if (soSearchRes.ok) {
                    const data = (await soSearchRes.json()).data || [];
                    soIds.push(...data.map((x: { order_id: number }) => Number(x.order_id)));
                }
                if (invSearchRes.ok) {
                    const data = (await invSearchRes.json()).data || [];
                    for (const i of data) {
                        if (i.order_id && !isNaN(Number(i.order_id))) soIds.push(Number(i.order_id));
                    }
                }
                if (custSearchRes.ok) {
                    const custCodes = ((await custSearchRes.json()).data || []).map((x: { customer_code: string }) => x.customer_code).filter(Boolean);
                    if (custCodes.length > 0) {
                        const custSoRes = await fetch(`${DIRECTUS_URL}/items/sales_order?filter[customer_code][_in]=${custCodes.map(encodeURIComponent).join(",")}&fields=order_id&limit=50`, { headers: directusHeaders, cache: "no-store" });
                        if (custSoRes.ok) {
                            const cSoData = (await custSoRes.json()).data || [];
                            soIds.push(...cSoData.map((x: { order_id: number }) => Number(x.order_id)));
                        }
                    }
                }
                const distinctSearchOrderIds = [...new Set(soIds)].filter(Boolean);
                if (distinctSearchOrderIds.length > 0) {
                    const dpdRes = await fetch(`${DIRECTUS_URL}/items/dispatch_plan_details?filter[sales_order_id][_in]=${distinctSearchOrderIds.slice(0, 100).join(",")}&fields=dispatch_id&limit=-1`, { headers: directusHeaders, cache: "no-store" });
                    if (dpdRes.ok) {
                        const dpdData = (await dpdRes.json()).data || [];
                        for (const d of dpdData) {
                            if (d.dispatch_id) matchingDispatchIdsFromSearch.add(Number(d.dispatch_id));
                        }
                    }
                }
            } catch (sErr) {
                console.warn("[fulfilment-and-deliveries search error]", sErr);
            }
        }

        // 5. Filter candidate plans by search and status
        const filteredPlans = allDispatchPlans.filter((dp) => {
            const dpId = Number(dp.dispatch_id);
            const bName = (branchMap.get(Number(dp.branch_id))?.branch_name || "").toLowerCase();
            const dName = (driverNameMap.get(Number(dp.driver_id)) || "").toLowerCase();
            const vName = (vehicleMap.get(Number(dp.vehicle_id)) || "").toLowerCase();
            const dNo = (dp.dispatch_no || "").toLowerCase();

            const matchesSearch =
                !search ||
                dNo.includes(search) ||
                bName.includes(search) ||
                dName.includes(search) ||
                vName.includes(search) ||
                matchingDispatchIdsFromSearch.has(dpId);

            if (!matchesSearch) return false;

            if (statusFilter === "All") return true;
            const st = (dp.status || "").toLowerCase();
            const sFilter = statusFilter.toLowerCase();
            if (sFilter === "completed" || sFilter === "delivered" || sFilter === "fulfilled") {
                return st === "completed" || st === "delivered";
            }
            if (sFilter === "pending") {
                return st === "dispatched" || st === "approved";
            }
            return st === sFilter;
        });

        // 6. Compute lightweight summary metrics
        const totalDispatched = allDispatchPlans.length;
        const pendingClearance = allDispatchPlans.filter(
            (dp) => dp.status === "Dispatched" || dp.status === "Approved"
        ).length;
        const fulfilledCount = allDispatchPlans.filter(
            (dp) => dp.status === "Completed" || dp.status === "Delivered" || dp.status === "Audited"
        ).length;

        let concernsAndReturnsCount = 0;
        try {
            const [ustCountRes, srCountRes] = await Promise.all([
                fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction?aggregate[count]=*&limit=1`, { headers: directusHeaders, cache: "no-store" }),
                fetch(`${DIRECTUS_URL}/items/sales_return?filter[status][_in]=Posted,Completed,Approved&aggregate[count]=*&limit=1`, { headers: directusHeaders, cache: "no-store" }),
            ]);
            const ustCount = ustCountRes.ok ? Number((await ustCountRes.json()).data?.[0]?.count || 0) : 0;
            const srCount = srCountRes.ok ? Number((await srCountRes.json()).data?.[0]?.count || 0) : 0;
            concernsAndReturnsCount = Math.min(fulfilledCount, ustCount + srCount);
        } catch {
            concernsAndReturnsCount = 0;
        }

        // 7. Paginate candidate plans BEFORE enriching details
        const totalElements = filteredPlans.length;
        const totalPages = Math.ceil(totalElements / size) || 1;
        const paginatedPlans = filteredPlans.slice(page * size, (page + 1) * size);

        if (paginatedPlans.length === 0) {
            return NextResponse.json({
                content: [],
                totalPages,
                totalElements,
                page,
                size,
                metrics: {
                    total_dispatched: totalDispatched,
                    pending_clearance: pendingClearance,
                    fulfilled_count: fulfilledCount,
                    concerns_and_returns_count: concernsAndReturnsCount,
                },
                branches,
            });
        }

        // 8. Fetch details ONLY for the paginated plans
        const pageDispatchIds = paginatedPlans.map((dp) => Number(dp.dispatch_id)).filter(Boolean);

        const dpDetRes = await fetch(
            `${DIRECTUS_URL}/items/dispatch_plan_details?filter[dispatch_id][_in]=${pageDispatchIds.join(",")}&limit=-1&fields=detail_id,dispatch_id,sales_order_id`,
            { headers: directusHeaders, cache: "no-store" }
        );
        const dispatchDetails: DirectusDispatchDetail[] = dpDetRes.ok ? (await dpDetRes.json()).data || [] : [];

        const dpSoMap = new Map<number, number[]>();
        const dispatchNoByOrderId = new Map<number, string>();
        for (const dd of dispatchDetails) {
            const dpId = Number(dd.dispatch_id);
            const soId = Number(dd.sales_order_id);
            if (dpId && soId) {
                const list = dpSoMap.get(dpId) || [];
                list.push(soId);
                dpSoMap.set(dpId, list);
                const plan = paginatedPlans.find((p) => Number(p.dispatch_id) === dpId);
                if (plan?.dispatch_no) {
                    dispatchNoByOrderId.set(soId, plan.dispatch_no);
                }
            }
        }

        const targetOrderIds = [...new Set(dispatchDetails.map((dd) => Number(dd.sales_order_id)).filter(Boolean))];

        // 9. Fetch sales_order, sales_order_details, and sales_invoice strictly for targetOrderIds
        const [soRes, sodRes] = await Promise.all([
            targetOrderIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_order?filter[order_id][_in]=${targetOrderIds.join(",")}&fields=*&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            targetOrderIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${targetOrderIds.join(",")}&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
        ]);

        const salesOrders: DirectusSalesOrder[] = soRes && soRes.ok ? (await soRes.json()).data || [] : [];
        const salesOrderDetails: DirectusSalesOrderDetail[] = sodRes && sodRes.ok ? (await sodRes.json()).data || [] : [];

        const candidateInvIds = [...new Set(salesOrders.map((s) => Number(s.invoice_id)).filter(Boolean))];
        const candidateOrderNos = [...new Set(salesOrders.map((s) => s.order_no ? s.order_no.trim() : "").filter(Boolean))];

        const [invByOrderRes, invByIdRes, invByNoRes, sidByOrderRes] = await Promise.all([
            targetOrderIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_in]=${targetOrderIds.join(",")}&fields=*&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            candidateInvIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${candidateInvIds.join(",")}&fields=*&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            candidateOrderNos.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_in]=${candidateOrderNos.map(encodeURIComponent).join(",")}&fields=*&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            targetOrderIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_invoice_details?filter[order_id][_in]=${targetOrderIds.join(",")}&fields=detail_id,order_id,invoice_no,product_id,quantity&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
        ]);

        const invByOrder = invByOrderRes && invByOrderRes.ok ? (await invByOrderRes.json()).data || [] : [];
        const invById = invByIdRes && invByIdRes.ok ? (await invByIdRes.json()).data || [] : [];
        const invByNo = invByNoRes && invByNoRes.ok ? (await invByNoRes.json()).data || [] : [];
        const allInvoices: DirectusInvoice[] = [...invByOrder, ...invById, ...invByNo].filter((v, idx, arr) => arr.findIndex(x => (x.invoice_id || x.id) === (v.invoice_id || v.id)) === idx);
        const rawSidList: Array<{ detail_id: number; order_id: string | number; invoice_no: number | string; product_id?: number; quantity?: number }> =
            sidByOrderRes && sidByOrderRes.ok ? (await sidByOrderRes.json()).data || [] : [];

        // Check if any invoice_ids referenced in sales_invoice_details are missing
        const existingInvIds = new Set(allInvoices.map((i) => Number(i.invoice_id || i.id)));
        const missingInvIds: number[] = [];
        for (const sid of rawSidList) {
            const invId = Number(sid.invoice_no);
            if (invId && !existingInvIds.has(invId)) {
                missingInvIds.push(invId);
            }
        }
        const distinctMissingInvIds = [...new Set(missingInvIds)].filter(Boolean);
        if (distinctMissingInvIds.length > 0) {
            try {
                const missingRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${distinctMissingInvIds.join(",")}&fields=*&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (missingRes.ok) {
                    const mData = (await missingRes.json()).data || [];
                    allInvoices.push(...mData);
                }
            } catch (e) {
                console.warn("[fulfilment-and-deliveries] Error fetching missing invoices:", e);
            }
        }

        // Index invoices
        const invoiceMapById = new Map<number, DirectusInvoice>();
        const invoiceMapByOrderKey = new Map<string, DirectusInvoice>();
        const invoicesByOrderKey = new Map<string, DirectusInvoice[]>();
        const invoiceMapByInvoiceNo = new Map<string, DirectusInvoice>();

        const addInvoiceToOrder = (key: string, inv: DirectusInvoice) => {
            const k = key.toLowerCase().trim();
            if (!invoicesByOrderKey.has(k)) {
                invoicesByOrderKey.set(k, []);
            }
            const list = invoicesByOrderKey.get(k)!;
            const targetId = Number(inv.invoice_id || inv.id);
            if (!list.some((existing) => Number(existing.invoice_id || existing.id) === targetId)) {
                list.push(inv);
            }
        };

        for (const rawInv of allInvoices) {
            const invId = Number(rawInv.invoice_id || rawInv.id);
            if (invId) invoiceMapById.set(invId, rawInv);

            let ordIdStr: string | null = null;
            let ordIdNum: number | null = null;
            let ordNoFromRel: string | null = null;

            if (typeof rawInv.order_id === "object" && rawInv.order_id !== null) {
                const rel = rawInv.order_id as Record<string, unknown>;
                ordIdNum = Number(rel.order_id || rel.id || null);
                if (ordIdNum) ordIdStr = String(ordIdNum);
                if (rel.order_no) ordNoFromRel = String(rel.order_no).trim().toLowerCase();
            } else if (rawInv.order_id !== undefined && rawInv.order_id !== null) {
                const rawStr = String(rawInv.order_id).trim();
                if (rawStr.length > 0 && rawStr !== "[object Object]") {
                    ordIdStr = rawStr.toLowerCase();
                    const parsedNum = Number(rawStr);
                    if (!isNaN(parsedNum)) ordIdNum = parsedNum;
                }
            }

            if (ordIdStr) {
                invoiceMapByOrderKey.set(ordIdStr, rawInv);
                addInvoiceToOrder(ordIdStr, rawInv);
            }
            if (ordIdNum) {
                invoiceMapByOrderKey.set(String(ordIdNum), rawInv);
                addInvoiceToOrder(String(ordIdNum), rawInv);
            }
            if (ordNoFromRel) {
                invoiceMapByOrderKey.set(ordNoFromRel, rawInv);
                addInvoiceToOrder(ordNoFromRel, rawInv);
            }

            if (rawInv.invoice_no && typeof rawInv.invoice_no === "string") {
                const invNoLower = rawInv.invoice_no.trim().toLowerCase();
                if (invNoLower.length > 0) {
                    invoiceMapByInvoiceNo.set(invNoLower, rawInv);
                }
            }
        }

        // Map orderIdToInvoiceIdMap
        const orderIdToInvoiceIdMap = new Map<string, number>();
        for (const sid of rawSidList) {
            const ordStr = sid.order_id ? String(sid.order_id).trim() : "";
            const invId = Number(sid.invoice_no);
            if (ordStr && invId) {
                orderIdToInvoiceIdMap.set(ordStr.toLowerCase(), invId);
                const pNum = Number(ordStr);
                if (!isNaN(pNum)) orderIdToInvoiceIdMap.set(String(pNum), invId);
                const targetInv = invoiceMapById.get(invId);
                if (targetInv) {
                    addInvoiceToOrder(ordStr, targetInv);
                    if (!invoiceMapByOrderKey.has(ordStr)) invoiceMapByOrderKey.set(ordStr, targetInv);
                }
            }
        }

        // Index invoiced quantities in invoiceProductQtyMap
        const uniqueSidMap = new Map<number | string, (typeof rawSidList)[0]>();
        for (const sid of rawSidList) {
            const sidKey = sid.detail_id ? Number(sid.detail_id) : `${sid.order_id}:${sid.invoice_no}:${sid.product_id}`;
            if (!uniqueSidMap.has(sidKey)) uniqueSidMap.set(sidKey, sid);
        }

        const invoiceProductQtyMap = new Map<string, number>();
        for (const sid of uniqueSidMap.values()) {
            const qty = Number(sid.quantity || 0);
            const pId = Number(sid.product_id || 0);
            if (!pId) continue;
            if (sid.invoice_no) {
                const key = `${sid.invoice_no}:${pId}`;
                invoiceProductQtyMap.set(key, (invoiceProductQtyMap.get(key) || 0) + qty);
                const invObj = invoiceMapById.get(Number(sid.invoice_no));
                if (invObj?.invoice_no) {
                    const invNoKey = `${String(invObj.invoice_no).trim().toLowerCase()}:${pId}`;
                    invoiceProductQtyMap.set(invNoKey, (invoiceProductQtyMap.get(invNoKey) || 0) + qty);
                }
            }
            if (sid.order_id) {
                const ordRaw = String(sid.order_id).trim();
                const ordLower = ordRaw.toLowerCase();
                invoiceProductQtyMap.set(`${ordLower}:${pId}`, (invoiceProductQtyMap.get(`${ordLower}:${pId}`) || 0) + qty);
                const pNum = Number(ordRaw);
                if (!isNaN(pNum)) {
                    invoiceProductQtyMap.set(`${pNum}:${pId}`, (invoiceProductQtyMap.get(`${pNum}:${pId}`) || 0) + qty);
                }
            }
        }

        const salesOrderMap = new Map<number, DirectusSalesOrder>(
            salesOrders.map((so) => [Number(so.order_id), so])
        );

        for (const so of salesOrderMap.values()) {
            const numId = Number(so.order_id);
            const strNo = String(so.order_no || "").toLowerCase().trim();
            if (numId && strNo) {
                for (const sod of salesOrderDetails.filter((d) => Number(d.order_id) === numId)) {
                    const pId = Number(sod.product_id);
                    const qtyFromStr = invoiceProductQtyMap.get(`${strNo}:${pId}`);
                    const qtyFromNum = invoiceProductQtyMap.get(`${numId}:${pId}`);
                    if (qtyFromStr !== undefined && qtyFromNum === undefined) {
                        invoiceProductQtyMap.set(`${numId}:${pId}`, qtyFromStr);
                    } else if (qtyFromNum !== undefined && qtyFromStr === undefined) {
                        invoiceProductQtyMap.set(`${strNo}:${pId}`, qtyFromNum);
                    }
                }
            }
        }

        // 10. Fetch sub-entities strictly for discovered orders and invoices
        const pageInvoiceIds = Array.from(invoiceMapById.keys());
        const pageSodDetailIds = salesOrderDetails.map((s) => Number(s.detail_id)).filter(Boolean);
        const pageProductIds = [...new Set(salesOrderDetails.map((s) => Number(s.product_id)).filter(Boolean))];
        const pageCustomerCodes = [...new Set([
            ...allInvoices.map((i) => i.customer_code).filter(Boolean),
            ...salesOrders.map((s) => s.customer_code).filter(Boolean),
        ])] as string[];

        const extractSalesmanId = (sm: unknown): number | null => {
            if (typeof sm === "object" && sm !== null) {
                const rec = sm as Record<string, unknown>;
                return Number(rec.id || rec.salesman_id) || null;
            }
            return Number(sm) || null;
        };

        const pageSalesmanIds = [...new Set([
            ...allInvoices.map((i) => extractSalesmanId(i.salesman_id)).filter((id): id is number => Boolean(id)),
            ...salesOrders.map((s) => extractSalesmanId(s.salesman_id)).filter((id): id is number => Boolean(id)),
        ])];

        const candidateReturnKeys = [...new Set([
            ...allInvoices.map((i) => i.invoice_no?.trim()).filter(Boolean),
            ...allInvoices.map((i) => String(i.invoice_id || i.id)),
            ...salesOrders.map((s) => s.order_no?.trim()).filter(Boolean),
            ...salesOrders.map((s) => String(s.order_id)),
        ])] as string[];

        interface DirectusInvoiceBatch {
            id: number;
            invoice_id: number;
            invoice_detail_id: number;
            product_id: number;
            inventory_lot_id: number;
            lot_id?: number | null;
            batch_no?: string | null;
            quantity: number | string;
        }

        interface DirectusUstRecord {
            id: number;
            sales_invoice_id: number;
            nte?: string;
            isCleared?: number;
            checked_by?: number;
            date_acknowledged?: string;
            date_created?: string;
            variance_amount?: number;
        }

        interface DirectusUstDetailRecord {
            id: number;
            unfulfilled_sales_transaction_id: number;
            sales_invoice_detail_id?: number | null;
            inventory_lot_id?: number | null;
            product_id?: number | null;
            returned_quantity?: number | string;
            missing_quantity?: number;
        }

        interface RawInventoryLotRecord {
            inventory_lot_id?: number | string;
            lot_id?: number | string | { lot_id?: number | string; lot_name?: string };
            batch_no?: string;
            expiry_date?: string;
        }

        interface RawLotRecord {
            lot_id?: number | string;
            lot_name?: string;
        }

        interface RawReservationRecord {
            reservation_id?: number | string;
            id?: number | string;
            sales_order_detail_id?: number | string;
            product_id?: number | string;
            inventory_lot_id?: number | string;
            reserved_quantity?: number | string;
            picked_quantity?: number | string;
            status?: string;
            created_at?: string;
        }

        const [
            batchRes,
            resvRes,
            prodRes,
            ptRes,
            custRes,
            smRes,
            srRes,
            ustRes,
        ] = await Promise.all([
            pageInvoiceIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_invoice_batches?filter[invoice_id][_in]=${pageInvoiceIds.join(",")}&fields=id,invoice_id,invoice_detail_id,product_id,inventory_lot_id,lot_id,batch_no,quantity&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            pageSodDetailIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${pageSodDetailIds.join(",")}&filter[status][_in]=Picked,Consumed,Reserved&fields=reservation_id,sales_order_detail_id,product_id,inventory_lot_id,reserved_quantity,picked_quantity,status,created_at&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            pageProductIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${pageProductIds.join(",")}&fields=product_id,product_name,product_code,description,short_description,product_type,unit_of_measurement.unit_shortcut&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            fetch(`${DIRECTUS_URL}/items/product_type?limit=-1&fields=id,name`, { headers: directusHeaders, cache: "no-store" }).catch(() => null),
            pageCustomerCodes.length > 0
                ? fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${pageCustomerCodes.map(encodeURIComponent).join(",")}&fields=id,customer_name,customer_code&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            pageSalesmanIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/salesman?filter[id][_in]=${pageSalesmanIds.join(",")}&fields=id,salesman_code,salesman_name&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            candidateReturnKeys.length > 0
                ? fetch(`${DIRECTUS_URL}/items/sales_return?filter[order_id][_in]=${candidateReturnKeys.map(encodeURIComponent).join(",")}&fields=return_id,return_number,customer_code,salesman_id,branch_id,return_date,total_amount,remarks,created_by,order_id,invoice_no,status,isPosted,isApplied,isReceived&limit=-1`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
            pageInvoiceIds.length > 0
                ? fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction?filter[sales_invoice_id][_in]=${pageInvoiceIds.join(",")}&limit=-1&fields=id,sales_invoice_id,nte,isCleared,checked_by,date_acknowledged,date_created,variance_amount`, { headers: directusHeaders, cache: "no-store" })
                : Promise.resolve(null),
        ]);

        const invoiceBatches: DirectusInvoiceBatch[] = batchRes && batchRes.ok ? (await batchRes.json()).data || [] : [];
        const rawReservations: RawReservationRecord[] = resvRes && resvRes.ok ? (await resvRes.json()).data || [] : [];
        const products: DirectusProduct[] = prodRes && prodRes.ok ? (await prodRes.json()).data || [] : [];
        const productTypes: Array<{ id: number; name: string }> = ptRes && ptRes.ok ? (await ptRes.json()).data || [] : [];
        const customerList: DirectusCustomer[] = custRes && custRes.ok ? (await custRes.json()).data || [] : [];
        const salesmanList: DirectusSalesman[] = smRes && smRes.ok ? (await smRes.json()).data || [] : [];
        const salesReturnsRaw = srRes && srRes.ok ? (await srRes.json()).data || [] : [];
        const ustList: DirectusUstRecord[] = ustRes && ustRes.ok ? (await ustRes.json()).data || [] : [];

        // Fetch UST details if any ustList records exist
        const ustIds = ustList.map((u) => u.id).filter(Boolean);
        let ustDetailList: DirectusUstDetailRecord[] = [];
        if (ustIds.length > 0) {
            try {
                const ustdRes = await fetch(
                    `${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details?filter[unfulfilled_sales_transaction_id][_in]=${ustIds.join(",")}&limit=-1&fields=id,unfulfilled_sales_transaction_id,sales_invoice_detail_id,inventory_lot_id,product_id,returned_quantity,missing_quantity`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (ustdRes.ok) {
                    ustDetailList = (await ustdRes.json()).data || [];
                }
            } catch (e) {
                console.warn("[fulfilment-and-deliveries] Error fetching ust details:", e);
            }
        }

        // Fetch mm_inventory_lots & mm_lots only for discovered lot IDs
        const targetInvLotIds = [...new Set([
            ...rawReservations.map((r) => Number(r.inventory_lot_id)),
            ...invoiceBatches.map((b) => Number(b.inventory_lot_id)),
        ].filter(Boolean))];

        const invLotMap = new Map<number, RawInventoryLotRecord>();
        const lotMap = new Map<number, RawLotRecord>();

        if (targetInvLotIds.length > 0) {
            try {
                const invRes = await fetch(
                    `${DIRECTUS_URL}/items/mm_inventory_lots?filter[inventory_lot_id][_in]=${targetInvLotIds.join(",")}&fields=inventory_lot_id,lot_id.lot_id,lot_id.lot_name,batch_no,expiry_date&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (invRes.ok) {
                    const chunkData = ((await invRes.json()).data || []) as RawInventoryLotRecord[];
                    for (const inv of chunkData) {
                        invLotMap.set(Number(inv.inventory_lot_id), inv);
                    }
                }

                const targetLotIds = [...new Set(
                    Array.from(invLotMap.values())
                        .map((inv) => (typeof inv.lot_id === "object" && inv.lot_id !== null ? Number(inv.lot_id.lot_id) : Number(inv.lot_id)))
                        .filter(Boolean)
                )];

                if (targetLotIds.length > 0) {
                    const lotRes = await fetch(
                        `${DIRECTUS_URL}/items/mm_lots?filter[lot_id][_in]=${targetLotIds.join(",")}&fields=lot_id,lot_name&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (lotRes.ok) {
                        const lotData = ((await lotRes.json()).data || []) as RawLotRecord[];
                        for (const lot of lotData) {
                            lotMap.set(Number(lot.lot_id), lot);
                        }
                    }
                }
            } catch (e) {
                console.warn("[fulfilment-and-deliveries] Error fetching lot data:", e);
            }
        }

        // Index product, product type, customer, salesman maps
        const productMap = new Map<number, DirectusProduct>();
        for (const p of products) {
            const pid = Number(p.product_id || (p as { id?: number }).id);
            if (pid) productMap.set(pid, p);
        }

        const productTypeMap = new Map<number, string>();
        for (const pt of productTypes) {
            if (pt.id) productTypeMap.set(Number(pt.id), pt.name);
        }

        const customerCodeMap = new Map<string, string>();
        for (const c of customerList) {
            if (c.customer_code) customerCodeMap.set(c.customer_code, c.customer_name);
        }

        const salesmanMap = new Map<number, DirectusSalesman>();
        for (const sm of salesmanList) {
            const smId = Number(sm.id);
            if (smId) salesmanMap.set(smId, sm);
        }

        // Index reservations
        const sodReservationMap = new Map<number, LineItemReservation[]>();
        for (const r of rawReservations) {
            const sodId = Number(r.sales_order_detail_id);
            const invLot = invLotMap.get(Number(r.inventory_lot_id));

            let resolvedLotId: number | undefined = undefined;
            let resolvedLotName: string | undefined = undefined;

            if (invLot) {
                if (typeof invLot.lot_id === "object" && invLot.lot_id !== null) {
                    resolvedLotId = invLot.lot_id.lot_id ? Number(invLot.lot_id.lot_id) : undefined;
                    resolvedLotName = invLot.lot_id.lot_name || undefined;
                } else if (invLot.lot_id) {
                    resolvedLotId = Number(invLot.lot_id);
                }
            }

            if (!resolvedLotName && resolvedLotId) {
                resolvedLotName = lotMap.get(resolvedLotId)?.lot_name;
            }

            const mapped: LineItemReservation = {
                reservation_id: Number(r.reservation_id || r.id),
                sales_order_detail_id: sodId,
                product_id: Number(r.product_id),
                inventory_lot_id: Number(r.inventory_lot_id),
                lot_id: resolvedLotId,
                lot_name: resolvedLotName,
                batch_no: invLot?.batch_no || undefined,
                reserved_quantity: Number(r.reserved_quantity || 0),
                picked_quantity: Number(r.picked_quantity || 0),
                status: r.status || "Reserved",
                created_at: r.created_at ? String(r.created_at) : undefined,
            };

            const existing = sodReservationMap.get(sodId) || [];
            existing.push(mapped);
            sodReservationMap.set(sodId, existing);
        }

        // Index invoice batches
        const invoiceBatchesMap = new Map<string, DirectusInvoiceBatch[]>();
        for (const b of invoiceBatches) {
            const key = `${b.invoice_id}:${b.product_id}`;
            if (!invoiceBatchesMap.has(key)) {
                invoiceBatchesMap.set(key, []);
            }
            invoiceBatchesMap.get(key)!.push(b);
        }

        // Index returns
        const salesReturnMap = new Map<string, {
            return_id: number;
            return_number: string;
            status: string;
            is_received?: boolean;
            return_date?: string | null;
            total_amount?: number | null;
            invoice_no?: string;
            order_id?: string | number;
        }>();
        const returnItemQtyMap = new Map<string, number>();

        for (const sr of salesReturnsRaw) {
            const entry = {
                return_id: Number(sr.return_id),
                return_number: sr.return_number || `SR-${sr.return_id}`,
                status: sr.status || "Completed",
                is_received: Boolean(sr.isReceived || sr.is_received),
                return_date: sr.return_date || null,
                total_amount: sr.total_amount ? Number(sr.total_amount) : null,
                invoice_no: sr.invoice_no ? String(sr.invoice_no).trim() : undefined,
                order_id: sr.order_id,
            };
            if (sr.return_number) salesReturnMap.set(sr.return_number.toLowerCase(), entry);
            if (sr.return_id) salesReturnMap.set(String(sr.return_id), entry);
            if (sr.invoice_no) salesReturnMap.set(String(sr.invoice_no).toLowerCase().trim(), entry);
            if (sr.order_id) salesReturnMap.set(String(sr.order_id).toLowerCase().trim(), entry);
        }

        // Helper to assemble child orders for a trip
        const buildChildOrdersForTrip = (
            distinctOrderIds: number[],
            tripCreatedAt: string | null | undefined,
            tripDispatchNo: string | null | undefined,
            isTripCleared: boolean,
            fallbackStatus: string
        ): ConsolidatedSalesOrderRecord[] => {
            const childOrders: ConsolidatedSalesOrderRecord[] = [];

            for (const orderId of distinctOrderIds) {
                const so = salesOrderMap.get(orderId);
                const sidInvId =
                    orderIdToInvoiceIdMap.get(String(orderId)) ||
                    (so?.order_id ? orderIdToInvoiceIdMap.get(String(so.order_id)) : null) ||
                    (so?.order_no ? orderIdToInvoiceIdMap.get(so.order_no.trim().toLowerCase()) : null) ||
                    null;

                const inv =
                    (sidInvId ? invoiceMapById.get(sidInvId) : null) ||
                    (so?.order_id ? invoiceMapByOrderKey.get(String(so.order_id).toLowerCase()) : null) ||
                    (so?.order_no ? invoiceMapByOrderKey.get(so.order_no.trim().toLowerCase()) : null) ||
                    (so?.order_no ? invoiceMapByInvoiceNo.get(so.order_no.trim().toLowerCase()) : null) ||
                    invoiceMapByOrderKey.get(String(orderId).toLowerCase()) ||
                    invoiceMapById.get(orderId) ||
                    null;

                if (!so && !inv) {
                    childOrders.push({
                        order_id: orderId,
                        order_no: `SO-${orderId}`,
                        order_status: fallbackStatus || "Dispatched",
                        dispatch_no: tripDispatchNo || null,
                        consolidator_no: null,
                        invoice_id: 0,
                        invoice_no: "---",
                        invoice_date: tripCreatedAt || new Date().toISOString(),
                        customer_code: "-",
                        customer_name: "-",
                        salesman_id: null,
                        salesman_code: null,
                        salesman_name: null,
                        amount: 0,
                        remarks: "",
                        fulfillment_status: isTripCleared ? "Fulfilled" : "Pending",
                        is_cleared: isTripCleared,
                        cleared_at: null,
                        cleared_by: null,
                        linked_sales_return: null,
                        items: [],
                    });
                    continue;
                }

                const allInvoicesForOrder: DirectusInvoice[] = [
                    ...(so?.order_id ? invoicesByOrderKey.get(String(so.order_id).toLowerCase()) || [] : []),
                    ...(so?.order_no ? invoicesByOrderKey.get(so.order_no.trim().toLowerCase()) || [] : []),
                    ...(invoicesByOrderKey.get(String(orderId).toLowerCase()) || []),
                    ...(inv ? [inv] : []),
                ].filter((v, idx, arr) => arr.findIndex((x) => Number(x.invoice_id || x.id) === Number(v.invoice_id || v.id)) === idx);

                const targetInvoices: Array<DirectusInvoice | null> =
                    allInvoicesForOrder.length > 0 ? allInvoicesForOrder : (inv ? [inv] : [null]);

                const relevantSodDetails = salesOrderDetails.filter(
                    (sod) => Number(sod.order_id) === orderId
                );

                for (const curInv of targetInvoices) {
                    const invoiceNo = curInv?.invoice_no || inv?.invoice_no || so?.invoice_no || "---";
                    const invoiceId = curInv?.invoice_id ? Number(curInv.invoice_id) : (inv?.invoice_id ? Number(inv.invoice_id) : (so?.invoice_id ? Number(so.invoice_id) : null));
                    const invoiceDate = curInv?.invoice_date || inv?.invoice_date || allInvoicesForOrder[0]?.invoice_date || null;
                    const invoiceAmount = curInv ? Number(curInv.total_amount || curInv.net_amount || 0) : Number(so?.total_amount || 0);

                    const hasSpecificInvoice = Boolean(invoiceNo && invoiceNo !== "---");
                    const linkedSr =
                        (hasSpecificInvoice ? salesReturnMap.get(invoiceNo.toLowerCase()) : null) ||
                        (invoiceId ? salesReturnMap.get(String(invoiceId)) : null) ||
                        (invoiceId ? salesReturnMap.get(`inv_id:${invoiceId}`) : null) ||
                        (!hasSpecificInvoice && targetInvoices.length === 1 && so?.order_no ? salesReturnMap.get(so.order_no.toLowerCase()) : null) ||
                        (!hasSpecificInvoice && targetInvoices.length === 1 ? salesReturnMap.get(String(orderId)) : null) ||
                        (!hasSpecificInvoice && targetInvoices.length === 1 && so?.order_id ? salesReturnMap.get(String(so.order_id)) : null) ||
                        null;

                    const effectiveInvId = invoiceId || inv?.invoice_id || so?.invoice_id || null;

                    const matchingUst = isTripCleared && effectiveInvId
                        ? ustList.find((u) => Number(u.sales_invoice_id) === Number(effectiveInvId)) || null
                        : null;

                    const ustDetailsForMatching = matchingUst
                        ? ustDetailList.filter((d) => Number(d.unfulfilled_sales_transaction_id) === Number(matchingUst.id))
                        : [];

                    let sodLinesToUse = relevantSodDetails;
                    if (targetInvoices.length > 1 && curInv) {
                        const curInvIdNum = Number(curInv.invoice_id || curInv.id);
                        const invSpecificLines = relevantSodDetails.filter((sod) => {
                            const pId = Number(sod.product_id);
                            const q1 = invoiceProductQtyMap.get(`${curInvIdNum}:${pId}`);
                            const q2 = curInv.invoice_no ? invoiceProductQtyMap.get(`${String(curInv.invoice_no).trim().toLowerCase()}:${pId}`) : undefined;
                            return (q1 !== undefined && q1 > 0) || (q2 !== undefined && q2 > 0);
                        });
                        if (invSpecificLines.length > 0) {
                            sodLinesToUse = invSpecificLines;
                        }
                    }

                    let isCleared = false;
                    let orderFulfillmentStatus:
                        | "Pending"
                        | "Fulfilled"
                        | "Fulfilled with Concerns"
                        | "Fulfilled with Returns"
                        | "Unfulfilled / Returns" = "Pending";
                    let orderRemarks = "";
                    let linkedSrToReturn: typeof linkedSr | null = null;
                    let items: Array<{
                        detail_id: number;
                        product_id: number;
                        product_code: string;
                        product_name: string;
                        product_description: string;
                        uom: string;
                        ordered_quantity: number;
                        invoiced_quantity?: number;
                        received_quantity: number;
                        returned_quantity: number;
                        unit_price: number;
                        has_concern: boolean;
                        concern_notes: string;
                        line_status: "Fulfilled" | "Fulfilled with Returns" | "Unfulfilled / Returns";
                        reservations: LineItemReservation[];
                    }> = [];

                    if (!isTripCleared) {
                        isCleared = false;
                        orderFulfillmentStatus = "Pending";

                        items = sodLinesToUse.map((sod) => {
                            const prod = productMap.get(Number(sod.product_id));
                            const prodName = prod?.description || prod?.product_name || `Product #${sod.product_id}`;
                            const prodCode = prod?.product_code || `SKU-${sod.product_id}`;
                            const prodDesc = prod?.short_description || (prod?.description && prod?.description !== prod?.product_name ? prod?.description : "") || "";
                            const ordered = Number(sod.ordered_quantity || 0);

                            const rawLineReservations = sodReservationMap.get(Number(sod.detail_id)) || [];
                            const lineReservations = rawLineReservations;
                            const totalPickedFromRes = lineReservations.reduce((s, r) => s + (Number(r.picked_quantity) || 0), 0);
                            const sodAllocated = sod.allocated_quantity !== undefined && sod.allocated_quantity !== null ? Number(sod.allocated_quantity) : null;
                            const actualDispatched = totalPickedFromRes > 0
                                ? totalPickedFromRes
                                : sodAllocated !== null
                                ? sodAllocated
                                : 0;

                            let invoicedQty: number | undefined = undefined;
                            const curInvIdNum = curInv ? Number(curInv.invoice_id || curInv.id) : null;

                            if (curInvIdNum) {
                                const fromInv = invoiceProductQtyMap.get(`${curInvIdNum}:${sod.product_id}`);
                                if (fromInv !== undefined) invoicedQty = fromInv;
                            }
                            if (invoicedQty === undefined && curInv?.invoice_no) {
                                const fromInvNo = invoiceProductQtyMap.get(`${String(curInv.invoice_no).trim().toLowerCase()}:${sod.product_id}`);
                                if (fromInvNo !== undefined) invoicedQty = fromInvNo;
                            }
                            if (invoicedQty === undefined && targetInvoices.length === 1) {
                                if (allInvoicesForOrder.length > 0) {
                                    let sum = 0;
                                    let found = false;
                                    for (const oInv of allInvoicesForOrder) {
                                        const oInvId = Number(oInv.invoice_id || oInv.id);
                                        const fromInv = invoiceProductQtyMap.get(`${oInvId}:${sod.product_id}`);
                                        if (fromInv !== undefined) {
                                            sum += fromInv;
                                            found = true;
                                        }
                                    }
                                    if (found) invoicedQty = sum;
                                }
                                if (invoicedQty === undefined && inv?.invoice_id) {
                                    const fromInv = invoiceProductQtyMap.get(`${inv.invoice_id}:${sod.product_id}`);
                                    if (fromInv !== undefined) invoicedQty = fromInv;
                                }
                                if (invoicedQty === undefined) {
                                    const fromOrdNo = so?.order_no ? invoiceProductQtyMap.get(`${so.order_no.trim().toLowerCase()}:${sod.product_id}`) : undefined;
                                    if (fromOrdNo !== undefined) {
                                        invoicedQty = fromOrdNo;
                                    } else {
                                        const fromOrd = invoiceProductQtyMap.get(`${orderId}:${sod.product_id}`);
                                        if (fromOrd !== undefined) invoicedQty = fromOrd;
                                    }
                                }
                            }

                            let sibList: DirectusInvoiceBatch[] | undefined = undefined;
                            if (curInvIdNum) {
                                sibList = invoiceBatchesMap.get(`${curInvIdNum}:${sod.product_id}`);
                            }
                            if (!sibList && targetInvoices.length === 1 && inv?.invoice_id) {
                                sibList = invoiceBatchesMap.get(`${inv.invoice_id}:${sod.product_id}`);
                            }

                            const effectiveReservations: LineItemReservation[] = (sibList && sibList.length > 0)
                                ? sibList.map((sib) => {
                                    const invLot = invLotMap.get(Number(sib.inventory_lot_id));
                                    const lotId = Number(sib.lot_id || (typeof invLot?.lot_id === "object" ? invLot.lot_id?.lot_id : invLot?.lot_id) || 0);
                                    const lot = lotMap.get(lotId);
                                    const lotName = (typeof invLot?.lot_id === "object" ? invLot.lot_id?.lot_name : undefined) || lot?.lot_name || `Lot #${lotId}`;
                                    return {
                                        reservation_id: Number(sib.id),
                                        sales_order_detail_id: Number(sod.detail_id),
                                        inventory_lot_id: Number(sib.inventory_lot_id),
                                        product_id: Number(sod.product_id),
                                        lot_id: lotId,
                                        lot_name: lotName,
                                        lot_number: lotName,
                                        batch_no: sib.batch_no || invLot?.batch_no || "",
                                        reserved_quantity: Number(sib.quantity || 0),
                                        picked_quantity: Number(sib.quantity || 0),
                                        returned_quantity: 0,
                                        status: "Dispatched",
                                    };
                                })
                                : lineReservations;

                            const hasInvoice = Boolean(curInv?.invoice_id) || allInvoicesForOrder.length > 0 || Boolean(inv?.invoice_id);
                            const baseDeliverable = invoicedQty !== undefined
                                ? invoicedQty
                                : (hasInvoice ? 0 : Math.min(ordered, actualDispatched));

                            const rawPt = prod?.product_type;
                            const productTypeId =
                                typeof rawPt === "object" && rawPt !== null
                                    ? (rawPt.id ?? (rawPt as { id?: number | string; type_id?: number | string }).type_id)
                                    : rawPt;
                            const productTypeName =
                                typeof rawPt === "object" && rawPt !== null
                                    ? rawPt.name || null
                                    : (productTypeId ? productTypeMap.get(Number(productTypeId)) || null : null);
                            const prodUom =
                                typeof prod?.unit_of_measurement === "object" && prod?.unit_of_measurement !== null
                                    ? prod.unit_of_measurement.unit_shortcut || ""
                                    : "";

                            return {
                                detail_id: Number(sod.detail_id),
                                product_id: Number(sod.product_id),
                                product_code: prodCode,
                                product_name: prodName,
                                product_description: prodDesc,
                                uom: prodUom,
                                ordered_quantity: invoicedQty !== undefined ? invoicedQty : ordered,
                                invoiced_quantity: invoicedQty,
                                received_quantity: baseDeliverable,
                                returned_quantity: 0,
                                unit_price: Number(sod.unit_price || 0),
                                has_concern: false,
                                concern_notes: "",
                                line_status: "Fulfilled" as const,
                                reservations: effectiveReservations,
                                product_type: productTypeId ? Number(productTypeId) : null,
                                product_type_name: productTypeName,
                            };
                        });

                        orderRemarks = "";
                        linkedSrToReturn = null;
                    } else {
                        isCleared = true;

                        const invTxStatus = String(curInv?.transaction_status || "").trim();
                        const isInvoiceNotDelivered = invTxStatus === "Not Delivered";
                        const isInvoiceWithConcerns = invTxStatus === "Completed with Concerns" || invTxStatus === "Fulfilled with Concerns";
                        const isInvoiceWithReturns = invTxStatus === "Completed with Returns" || invTxStatus === "Fulfilled with Returns";

                        items = sodLinesToUse.map((sod) => {
                            const prod = productMap.get(Number(sod.product_id));
                            const prodName = prod?.description || prod?.product_name || `Product #${sod.product_id}`;
                            const prodCode = prod?.product_code || `SKU-${sod.product_id}`;
                            const prodDesc = prod?.short_description || (prod?.description && prod?.description !== prod?.product_name ? prod?.description : "") || "";
                            const ordered = Number(sod.ordered_quantity || 0);

                            const rawLineReservations = sodReservationMap.get(Number(sod.detail_id)) || [];
                            const lineReservations = rawLineReservations;
                            const totalPickedFromRes = lineReservations.reduce((s, r) => s + (Number(r.picked_quantity) || 0), 0);
                            const sodAllocated = sod.allocated_quantity !== undefined && sod.allocated_quantity !== null ? Number(sod.allocated_quantity) : null;
                            const actualDispatched = totalPickedFromRes > 0
                                ? totalPickedFromRes
                                : sodAllocated !== null
                                ? sodAllocated
                                : 0;

                            let invoicedQty: number | undefined = undefined;
                            const curInvIdNum = curInv ? Number(curInv.invoice_id || curInv.id) : null;

                            if (curInvIdNum) {
                                const fromInv = invoiceProductQtyMap.get(`${curInvIdNum}:${sod.product_id}`);
                                if (fromInv !== undefined) invoicedQty = fromInv;
                            }
                            if (invoicedQty === undefined && curInv?.invoice_no) {
                                const fromInvNo = invoiceProductQtyMap.get(`${String(curInv.invoice_no).trim().toLowerCase()}:${sod.product_id}`);
                                if (fromInvNo !== undefined) invoicedQty = fromInvNo;
                            }
                            if (invoicedQty === undefined && targetInvoices.length === 1) {
                                if (allInvoicesForOrder.length > 0) {
                                    let sum = 0;
                                    let found = false;
                                    for (const oInv of allInvoicesForOrder) {
                                        const oInvId = Number(oInv.invoice_id || oInv.id);
                                        const fromInv = invoiceProductQtyMap.get(`${oInvId}:${sod.product_id}`);
                                        if (fromInv !== undefined) {
                                            sum += fromInv;
                                            found = true;
                                        }
                                    }
                                    if (found) invoicedQty = sum;
                                }
                                if (invoicedQty === undefined && inv?.invoice_id) {
                                    const fromInv = invoiceProductQtyMap.get(`${inv.invoice_id}:${sod.product_id}`);
                                    if (fromInv !== undefined) invoicedQty = fromInv;
                                }
                                if (invoicedQty === undefined) {
                                    const fromOrdNo = so?.order_no ? invoiceProductQtyMap.get(`${so.order_no.trim().toLowerCase()}:${sod.product_id}`) : undefined;
                                    if (fromOrdNo !== undefined) {
                                        invoicedQty = fromOrdNo;
                                    } else {
                                        const fromOrd = invoiceProductQtyMap.get(`${orderId}:${sod.product_id}`);
                                        if (fromOrd !== undefined) invoicedQty = fromOrd;
                                    }
                                }
                            }

                            let sibList: DirectusInvoiceBatch[] | undefined = undefined;
                            if (curInvIdNum) {
                                sibList = invoiceBatchesMap.get(`${curInvIdNum}:${sod.product_id}`);
                            }
                            if (!sibList && targetInvoices.length === 1 && inv?.invoice_id) {
                                sibList = invoiceBatchesMap.get(`${inv.invoice_id}:${sod.product_id}`);
                            }

                            const effectiveReservations: LineItemReservation[] = (sibList && sibList.length > 0)
                                ? sibList.map((sib) => {
                                    const invLot = invLotMap.get(Number(sib.inventory_lot_id));
                                    const lotId = Number(sib.lot_id || (typeof invLot?.lot_id === "object" ? invLot.lot_id?.lot_id : invLot?.lot_id) || 0);
                                    const lot = lotMap.get(lotId);
                                    const lotName = (typeof invLot?.lot_id === "object" ? invLot.lot_id?.lot_name : undefined) || lot?.lot_name || `Lot #${lotId}`;
                                    return {
                                        reservation_id: Number(sib.id),
                                        sales_order_detail_id: Number(sod.detail_id),
                                        inventory_lot_id: Number(sib.inventory_lot_id),
                                        product_id: Number(sod.product_id),
                                        lot_id: lotId,
                                        lot_name: lotName,
                                        lot_number: lotName,
                                        batch_no: sib.batch_no || invLot?.batch_no || "",
                                        reserved_quantity: Number(sib.quantity || 0),
                                        picked_quantity: Number(sib.quantity || 0),
                                        returned_quantity: 0,
                                        status: "Dispatched",
                                    };
                                })
                                : lineReservations;

                            const hasInvoice = Boolean(curInv?.invoice_id) || allInvoicesForOrder.length > 0 || Boolean(inv?.invoice_id);
                            const baseDeliverable = invoicedQty !== undefined
                                ? invoicedQty
                                : (hasInvoice ? 0 : Math.min(ordered, actualDispatched));

                            const srReturned = linkedSr
                                ? returnItemQtyMap.get(`${linkedSr.return_number.toLowerCase()}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${linkedSr.return_number}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${String(linkedSr.return_id)}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${invoiceNo.toLowerCase()}:${sod.product_id}`) ||
                                  returnItemQtyMap.get(`${String(orderId)}:${sod.product_id}`) ||
                                  0
                                : 0;

                            const matchingUstDetails = ustDetailsForMatching.filter(
                                (d) => Number(d.product_id) === Number(sod.product_id)
                            );
                            const ustReturnedSum = matchingUstDetails.reduce(
                                (sum, d) => sum + (Number(d.returned_quantity !== undefined && d.returned_quantity !== null ? d.returned_quantity : d.missing_quantity) || 0),
                                0
                            );

                            const mappedReservations: LineItemReservation[] = effectiveReservations.map((r) => {
                                const matchByLot = matchingUstDetails.find(
                                    (d) => Number(d.inventory_lot_id) === Number(r.inventory_lot_id)
                                );
                                const rRet = matchByLot
                                    ? Number(matchByLot.returned_quantity !== undefined && matchByLot.returned_quantity !== null ? matchByLot.returned_quantity : matchByLot.missing_quantity || 0)
                                    : (matchingUstDetails.length === 1 && !matchingUstDetails[0].inventory_lot_id ? ustReturnedSum : Number(r.returned_quantity || 0));
                                return {
                                    ...r,
                                    returned_quantity: rRet,
                                };
                            });

                            let recQty = baseDeliverable;
                            let retQty = 0;
                            let lineStatus: "Fulfilled" | "Fulfilled with Returns" | "Unfulfilled / Returns" = "Fulfilled";

                            if (isInvoiceNotDelivered) {
                                recQty = 0;
                                retQty = matchingUstDetails.length > 0 ? ustReturnedSum : baseDeliverable;
                                lineStatus = "Unfulfilled / Returns";
                            } else if (matchingUst) {
                                const totalDiscrepancy = Math.max(0, ustReturnedSum);
                                if (totalDiscrepancy >= baseDeliverable && baseDeliverable > 0) {
                                    recQty = 0;
                                    retQty = baseDeliverable;
                                    lineStatus = "Unfulfilled / Returns";
                                } else if (totalDiscrepancy > 0) {
                                    retQty = totalDiscrepancy;
                                    recQty = Math.max(0, baseDeliverable - totalDiscrepancy);
                                    lineStatus = "Fulfilled with Returns";
                                } else {
                                    recQty = baseDeliverable;
                                    retQty = 0;
                                    lineStatus = "Fulfilled";
                                }
                            } else if (srReturned > 0) {
                                retQty = Math.min(srReturned, baseDeliverable);
                                recQty = Math.max(0, baseDeliverable - retQty);
                                lineStatus = recQty === 0 ? "Unfulfilled / Returns" : "Fulfilled with Returns";
                            } else {
                                recQty = baseDeliverable;
                                retQty = 0;
                                lineStatus = "Fulfilled";
                            }

                            const rawPt = prod?.product_type;
                            const productTypeId =
                                typeof rawPt === "object" && rawPt !== null
                                    ? (rawPt.id ?? (rawPt as { id?: number | string; type_id?: number | string }).type_id)
                                    : rawPt;
                            const productTypeName =
                                typeof rawPt === "object" && rawPt !== null
                                    ? rawPt.name || null
                                    : (productTypeId ? productTypeMap.get(Number(productTypeId)) || null : null);
                            const prodUom =
                                typeof prod?.unit_of_measurement === "object" && prod?.unit_of_measurement !== null
                                    ? prod.unit_of_measurement.unit_shortcut || ""
                                    : "";

                            return {
                                detail_id: Number(sod.detail_id),
                                product_id: Number(sod.product_id),
                                product_code: prodCode,
                                product_name: prodName,
                                product_description: prodDesc,
                                uom: prodUom,
                                ordered_quantity: invoicedQty !== undefined ? invoicedQty : ordered,
                                invoiced_quantity: invoicedQty,
                                received_quantity: recQty,
                                returned_quantity: retQty,
                                unit_price: Number(sod.unit_price || 0),
                                has_concern: isInvoiceWithConcerns,
                                concern_notes: isInvoiceWithConcerns ? ((curInv?.remarks as string) || (so?.remarks as string) || "") : "",
                                line_status: lineStatus,
                                reservations: mappedReservations,
                                product_type: productTypeId ? Number(productTypeId) : null,
                                product_type_name: productTypeName,
                            };
                        });

                        const allUnfulfilled = items.length > 0 && items.every((i) => i.received_quantity === 0 && i.returned_quantity > 0);
                        const anyReturns = items.some((i) => i.returned_quantity > 0);

                        if (isInvoiceNotDelivered || (matchingUst && allUnfulfilled)) {
                            orderFulfillmentStatus = "Unfulfilled / Returns";
                            orderRemarks = (curInv?.remarks as string) || matchingUst?.nte || "";
                            linkedSrToReturn = null;
                        } else if (isInvoiceWithConcerns) {
                            orderFulfillmentStatus = "Fulfilled with Concerns";
                            orderRemarks = (curInv?.remarks as string) || "";
                            linkedSrToReturn = null;
                        } else if (isInvoiceWithReturns || (linkedSr && anyReturns) || (matchingUst && anyReturns)) {
                            orderFulfillmentStatus = "Fulfilled with Returns";
                            orderRemarks = (curInv?.remarks as string) || matchingUst?.nte || "";
                            linkedSrToReturn = linkedSr;
                        } else if (invTxStatus === "Completed" || fallbackStatus === "Delivered" || fallbackStatus === "Completed") {
                            orderFulfillmentStatus = "Fulfilled";
                            orderRemarks = (curInv?.remarks as string) || "";
                            linkedSrToReturn = null;
                        } else {
                            orderFulfillmentStatus = "Fulfilled";
                            orderRemarks = (curInv?.remarks as string) || "";
                            linkedSrToReturn = null;
                        }
                    }

                    const custCode = curInv?.customer_code || so?.customer_code || "";
                    const custName =
                        (custCode ? customerCodeMap.get(custCode.toLowerCase()) : undefined) ||
                        (custCode ? customerCodeMap.get(custCode) : undefined) ||
                        custCode ||
                        "---";

                    const salesmanId: number | string | null =
                        (curInv?.salesman_id ? (typeof curInv.salesman_id === "object" ? Number((curInv.salesman_id as Record<string, unknown>).id || (curInv.salesman_id as Record<string, unknown>).salesman_id) || null : (curInv.salesman_id as number | string)) : null) ||
                        (so?.salesman_id ? (typeof so.salesman_id === "object" ? Number((so.salesman_id as Record<string, unknown>).id || (so.salesman_id as Record<string, unknown>).salesman_id) || null : (so.salesman_id as number | string)) : null) ||
                        null;

                    const smFromMap = salesmanId ? salesmanMap.get(Number(salesmanId)) : undefined;
                    const salesmanName =
                        smFromMap?.salesman_name ||
                        (typeof so?.salesman_name === "string" ? so.salesman_name : null) ||
                        (typeof curInv?.salesman_name === "string" ? curInv.salesman_name : null) ||
                        null;
                    const salesmanCode = smFromMap?.salesman_code || (typeof curInv?.salesman_code === "string" ? curInv.salesman_code : null) || null;

                    childOrders.push({
                        order_id: Number(so?.order_id || orderId),
                        order_no: so?.order_no || `SO-${orderId}`,
                        order_status: so?.order_status || fallbackStatus || "Dispatched",
                        dispatch_no: tripDispatchNo || dispatchNoByOrderId.get(Number(so?.order_id || orderId)) || null,
                        consolidator_no: null,
                        invoice_id: invoiceId || 0,
                        invoice_no: invoiceNo,
                        invoice_date: invoiceDate ? String(invoiceDate) : "",
                        customer_code: custCode,
                        customer_name: custName,
                        salesman_id: salesmanId,
                        salesman_code: salesmanCode,
                        salesman_name: salesmanName,
                        amount: invoiceAmount > 0
                            ? invoiceAmount
                            : Number(so?.net_amount || so?.total_amount || inv?.net_amount || inv?.total_amount || 0),
                        remarks: orderRemarks,
                        fulfillment_status: orderFulfillmentStatus,
                        is_cleared: isCleared,
                        linked_sales_return: linkedSrToReturn,
                        items,
                    });
                }
            }

            return childOrders;
        };

        // 11. Assemble final ConsolidatedDeliveryRecord for each paginated plan
        const dispatchRecords: ConsolidatedDeliveryRecord[] = paginatedPlans
            .map((dp) => {
                const dpId = Number(dp.dispatch_id);
                const branchId = Number(dp.branch_id || 1);
                const branchName = branchMap.get(branchId)?.branch_name || `Branch #${branchId}`;

                const orderIds = dpSoMap.get(dpId) || [];
                const distinctOrderIds = [...new Set(orderIds)];

                const allDpOrdersCleared = distinctOrderIds.length > 0 && distinctOrderIds.every((oId) => {
                    const so = salesOrderMap.get(oId);
                    const sidInvId =
                        orderIdToInvoiceIdMap.get(String(oId)) ||
                        (so?.order_id ? orderIdToInvoiceIdMap.get(String(so.order_id)) : null) ||
                        (so?.order_no ? orderIdToInvoiceIdMap.get(so.order_no.trim().toLowerCase()) : null) ||
                        null;
                    const inv =
                        (sidInvId ? invoiceMapById.get(sidInvId) : null) ||
                        (so?.order_id ? invoiceMapByOrderKey.get(String(so.order_id).toLowerCase()) : null) ||
                        null;
                    const isSoDelivered = Boolean(so?.isDelivered === 1 || so?.isDelivered === true || so?.order_status === "Delivered" || so?.order_status === "Partially Delivered");
                    const isInvDelivered = Boolean(inv?.isDelivered === 1 || inv?.isDelivered === true || inv?.transaction_status === "Completed" || inv?.transaction_status === "Completed with Concerns" || inv?.transaction_status === "Completed with Returns");
                    return isSoDelivered || isInvDelivered;
                });

                const isTripCleared = dp.status === "Completed" || dp.status === "Delivered" || dp.status === "Audited" || allDpOrdersCleared;
                const effectiveTripStatus = (dp.status === "Completed" || allDpOrdersCleared) ? "Completed" : (dp.status || "Dispatched");

                let childOrders: ConsolidatedSalesOrderRecord[] = [];
                if (distinctOrderIds.length > 0) {
                    childOrders = buildChildOrdersForTrip(
                        distinctOrderIds,
                        dp.dispatch_date || dp.created_at,
                        dp.dispatch_no,
                        isTripCleared,
                        effectiveTripStatus
                    );
                } else {
                    childOrders = [
                        {
                            order_id: dpId,
                            order_no: dp.dispatch_no || `DP-${dpId}`,
                            order_status: dp.status || "Dispatched",
                            dispatch_no: dp.dispatch_no || `DP-${dpId}`,
                            consolidator_no: null,
                            invoice_id: 0,
                            invoice_no: "---",
                            invoice_date: dp.dispatch_date || dp.created_at || new Date().toISOString(),
                            customer_code: "-",
                            customer_name: "-",
                            salesman_id: null,
                            salesman_code: null,
                            salesman_name: null,
                            amount: Number(dp.total_amount || 0),
                            remarks: dp.remarks || "",
                            fulfillment_status: isTripCleared ? "Fulfilled" : "Pending",
                            is_cleared: isTripCleared,
                            cleared_at: null,
                            cleared_by: null,
                            linked_sales_return: null,
                            items: [],
                        },
                    ];
                }

                if (childOrders.length === 0) return null;

                const totalOrdersCount = childOrders.length;
                const totalItemsCount = childOrders.reduce((sum, o) => sum + o.items.length, 0);
                const childOrdersSum = childOrders.reduce((sum, o) => sum + o.amount, 0);
                const totalAmount = (dp.total_amount && Number(dp.total_amount) > 0) ? Number(dp.total_amount) : childOrdersSum;

                if (childOrdersSum === 0 && totalAmount > 0 && childOrders.length > 0) {
                    const avgAmt = Math.round((totalAmount / childOrders.length) * 100) / 100;
                    childOrders.forEach((o) => {
                        if (o.amount === 0) o.amount = avgAmt;
                    });
                }

                const hasAnyReturns = childOrders.some((o) => o.fulfillment_status === "Fulfilled with Returns" || o.fulfillment_status === "Unfulfilled / Returns" || Boolean(o.linked_sales_return));
                const hasAnyConcerns = childOrders.some((o) => o.fulfillment_status === "Fulfilled with Concerns");
                const isAllUnfulfilled = childOrders.length > 0 && childOrders.every((o) => o.fulfillment_status === "Unfulfilled / Returns");

                let dpFulfillmentStatus: "Pending" | "Fulfilled" | "Fulfilled with Concerns" | "Fulfilled with Returns" | "Unfulfilled / Returns" = "Pending";
                if (!isTripCleared) {
                    dpFulfillmentStatus = "Pending";
                } else if (isAllUnfulfilled) {
                    dpFulfillmentStatus = "Unfulfilled / Returns";
                } else if (hasAnyReturns) {
                    dpFulfillmentStatus = "Fulfilled with Returns";
                } else if (hasAnyConcerns) {
                    dpFulfillmentStatus = "Fulfilled with Concerns";
                } else {
                    dpFulfillmentStatus = "Fulfilled";
                }

                return {
                    consolidator_id: dpId,
                    consolidator_no: dp.dispatch_no || `DP-${dpId}`,
                    dispatch_id: dpId,
                    dispatch_no: dp.dispatch_no || `DP-${dpId}`,
                    driver_name: driverNameMap.get(Number(dp.driver_id)) || (dp.driver_id ? `Driver #${dp.driver_id}` : "-"),
                    vehicle_name: dp.vehicle_id && vehicleMap.has(Number(dp.vehicle_id)) ? vehicleMap.get(Number(dp.vehicle_id))! : "3PL — Third Party Logistics",
                    status: effectiveTripStatus,
                    branch_id: branchId,
                    branch_name: branchName,
                    dispatch_date: dp.dispatch_date || dp.created_at || new Date().toISOString(),
                    total_orders: totalOrdersCount,
                    total_items: totalItemsCount,
                    total_amount: totalAmount,
                    route_value: totalAmount,
                    fulfillment_status: dpFulfillmentStatus,
                    is_cleared: isTripCleared,
                    orders: childOrders,
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null && r.total_orders > 0);

        return NextResponse.json({
            content: dispatchRecords,
            totalPages,
            totalElements,
            page,
            size,
            metrics: {
                total_dispatched: totalDispatched,
                pending_clearance: pendingClearance,
                fulfilled_count: fulfilledCount,
                concerns_and_returns_count: concernsAndReturnsCount,
            },
            branches,
        });
    } catch (error) {
        console.error("[fulfilment-and-deliveries GET] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to load delivery clearance data." },
            { status: 500 }
        );
    }
}

// ─── POST: Confirm & Post Delivery Clearance for Consolidation ─────────────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { consolidator_id, dispatch_id, orders, is_draft } = body;

        if ((!consolidator_id && !dispatch_id) || !Array.isArray(orders) || orders.length === 0) {
            return NextResponse.json(
                { message: "Invalid payload: consolidator_id and orders array are required." },
                { status: 400 }
            );
        }

        const userId = await getUserIdFromToken();
        const phNow = getPhTimestamp();

        // ─── DRAFT PATHWAY (Save Progress) ──────────────────────────────────────────
        if (is_draft) {
            for (const orderData of orders) {
                const { order_id, invoice_id, clearance_remarks: orderRemarks } = orderData;
                const targetOrderId = Number(order_id || invoice_id);

                if (targetOrderId && typeof orderRemarks === "string") {
                    await fetch(`${DIRECTUS_URL}/items/sales_order/${targetOrderId}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            remarks: orderRemarks.trim(),
                            modified_by: userId,
                            modified_date: phNow,
                        }),
                    }).catch((err) => console.warn(`[POST Draft] Failed to update sales_order #${targetOrderId}:`, err));
                }

                if (invoice_id && typeof orderRemarks === "string") {
                    await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoice_id}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            remarks: orderRemarks.trim(),
                            modified_by: userId,
                            modified_date: phNow,
                        }),
                    }).catch((err) => console.warn(`[POST Draft] Failed to update sales_invoice #${invoice_id}:`, err));
                }

                // If explicit linked_return_id is passed in draft, link sales_return
                if (orderData.linked_return_id) {
                    await fetch(`${DIRECTUS_URL}/items/sales_return/${orderData.linked_return_id}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            order_id: targetOrderId,
                            modified_by: userId,
                            modified_date: phNow,
                        }),
                    }).catch((err) => console.warn(`[POST Draft] Failed to link sales_return #${orderData.linked_return_id}:`, err));

                    if (invoice_id) {
                        try {
                            const checkJunc = await fetch(
                                `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_eq]=${invoice_id}&filter[return_no][_eq]=${orderData.linked_return_id}&limit=1`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (checkJunc.ok) {
                                const jData = (await checkJunc.json()).data;
                                if (!jData || jData.length === 0) {
                                    await fetch(`${DIRECTUS_URL}/items/sales_invoice_sales_return`, {
                                        method: "POST",
                                        headers: directusHeaders,
                                        body: JSON.stringify({
                                            invoice_no: invoice_id,
                                            return_no: orderData.linked_return_id,
                                        }),
                                    }).catch(() => null);
                                }
                            }
                        } catch (e) {
                            console.warn("[POST Draft] Junction link error:", e);
                        }
                    }
                }
            }

            return NextResponse.json({
                success: true,
                is_draft: true,
                message: "Draft progress saved successfully. You can return to complete the clearance later.",
            });
        }

        // ─── FINAL COMMIT PATHWAY (Confirm Clearance & Post) ───────────────────────
        // Process each invoice/order in the consolidation
        const compositeOrderOutcomes = new Map<number, {
            fulfilledInvoices: number;
            partiallyDeliveredInvoices: number;
            unfulfilledInvoices: number;
            totalInvoices: number;
            remarks: string[];
        }>();

        for (const orderData of orders) {
            const { order_id, invoice_id, items, clearance_remarks: orderRemarks, linked_return_id, fulfillment_status: clientFulfillmentStatus } = orderData;
            if (!items || !Array.isArray(items)) continue;

            const targetOrderId = Number(order_id || invoice_id);

            // If explicit linked_return_id is passed, link sales_return
            if (linked_return_id) {
                await fetch(`${DIRECTUS_URL}/items/sales_return/${linked_return_id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        order_id: targetOrderId,
                        modified_by: userId,
                        modified_date: phNow,
                    }),
                }).catch((err) => console.warn(`[POST] Failed to link sales_return #${linked_return_id}:`, err));

                if (invoice_id) {
                    try {
                        const checkJunc = await fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_eq]=${invoice_id}&filter[return_no][_eq]=${linked_return_id}&limit=1`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkJunc.ok) {
                            const jData = (await checkJunc.json()).data;
                            if (!jData || jData.length === 0) {
                                await fetch(`${DIRECTUS_URL}/items/sales_invoice_sales_return`, {
                                    method: "POST",
                                    headers: directusHeaders,
                                    body: JSON.stringify({
                                        invoice_no: invoice_id,
                                        return_no: linked_return_id,
                                    }),
                                }).catch(() => null);
                            }
                        }
                    } catch (e) {
                        console.warn("[POST] Junction link error:", e);
                    }
                }
            }

            // Fetch DB details from sales_order_details
            let dbDetails: DirectusSalesOrderDetail[] = [];
            if (targetOrderId) {
                const sodRes = await fetch(
                    `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${targetOrderId}&limit=-1`,
                    { headers: directusHeaders, cache: "no-store" }
                );
                if (sodRes.ok) {
                    dbDetails = (await sodRes.json()).data || [];
                }
            }

            const dbDetailMap = new Map<number, DirectusSalesOrderDetail>(
                dbDetails.map((d) => [Number(d.detail_id), d])
            );

            // Resolve effective invoice ID upfront
            let effectiveInvoiceId = Number(invoice_id || 0);
            if (!effectiveInvoiceId && targetOrderId) {
                try {
                    const invLookupRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_eq]=${targetOrderId}&filter[transaction_status][_neq]=Cancelled&fields=invoice_id&limit=1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (invLookupRes.ok) {
                        const invLookupData = (await invLookupRes.json()).data;
                        if (invLookupData && invLookupData.length > 0) {
                            effectiveInvoiceId = Number(invLookupData[0].invoice_id);
                        }
                    }
                } catch (e) {
                    console.warn("[POST] Failed to lookup invoice_id for order:", e);
                }
            }

            // Fetch sales_invoice_details for this invoice to get authoritative expected quantities
            const invoiceDetailQtyMap = new Map<number, number>();
            const invoiceDetailMap = new Map<number, number>();
            if (effectiveInvoiceId) {
                try {
                    const sidRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${effectiveInvoiceId}&limit=-1&fields=detail_id,product_id,quantity`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (sidRes.ok) {
                        const sidData: Array<{ detail_id: number; product_id: number; quantity?: number }> = (await sidRes.json()).data || [];
                        for (const sid of sidData) {
                            const pid = Number(sid.product_id);
                            if (pid) {
                                if (sid.detail_id) invoiceDetailMap.set(pid, Number(sid.detail_id));
                                invoiceDetailQtyMap.set(pid, (invoiceDetailQtyMap.get(pid) || 0) + Number(sid.quantity || 0));
                            }
                        }
                    }
                } catch (sidErr) {
                    console.warn("[POST] Error fetching sales_invoice_details for expected quantity mapping:", sidErr);
                }
            }

            let totalReceived = 0;
            let totalReturned = 0;
            let totalExpected = 0;
            let totalMissing = 0;

            for (const item of items) {
                const detailId = Number(item.detail_id);
                const dbItem = dbDetailMap.get(detailId);
                const prodId = Number(item.product_id || (dbItem ? dbItem.product_id : 0));
                const rec = Number(item.received_quantity);
                const ret = Number(item.returned_quantity);
                const dbOrdered = dbItem ? Number(dbItem.ordered_quantity || 0) : rec + ret;

                if (isNaN(rec) || isNaN(ret) || rec < 0 || ret < 0) {
                    return NextResponse.json(
                        { message: `Quantities for line #${detailId} must be non-negative numbers.` },
                        { status: 422 }
                    );
                }

                const invQty = invoiceDetailQtyMap.get(prodId) ?? (item.invoiced_quantity !== undefined && item.invoiced_quantity !== null ? Number(item.invoiced_quantity) : undefined);
                const expectedQty = invQty !== undefined ? invQty : dbOrdered;

                const missing = Math.max(0, expectedQty - (rec + ret));
                totalMissing += missing;
                totalReceived += rec;
                totalReturned += ret;
                totalExpected += expectedQty;
            }

            // Derive order status based on authoritative expected units
            const hasOrderConcerns =
                items.some((it) => it.has_concern || (it.concern_notes && String(it.concern_notes).trim().length > 0)) ||
                clientFulfillmentStatus === "Fulfilled with Concerns";

            let derivedStatus: "Unfulfilled / Returns" | "Fulfilled with Returns" | "Fulfilled with Concerns" | "Fulfilled";
            let targetSoStatus: "Delivered" | "Partially Delivered" | "Not Fulfilled";

            if (clientFulfillmentStatus === "Unfulfilled / Returns") {
                derivedStatus = "Unfulfilled / Returns";
                targetSoStatus = "Not Fulfilled";
            } else if (clientFulfillmentStatus === "Fulfilled with Concerns") {
                derivedStatus = "Fulfilled with Concerns";
                targetSoStatus = totalMissing > 0 ? "Partially Delivered" : "Delivered";
            } else if (clientFulfillmentStatus === "Fulfilled with Returns") {
                derivedStatus = "Fulfilled with Returns";
                targetSoStatus = "Partially Delivered";
            } else if (clientFulfillmentStatus === "Fulfilled") {
                derivedStatus = "Fulfilled";
                targetSoStatus = "Delivered";
            } else if (totalReceived === 0 && (totalReturned > 0 || totalMissing > 0 || totalExpected > 0)) {
                derivedStatus = "Unfulfilled / Returns";
                targetSoStatus = "Not Fulfilled";
            } else if (totalReceived > 0 && totalReturned > 0) {
                derivedStatus = "Fulfilled with Returns";
                targetSoStatus = "Partially Delivered";
            } else if (hasOrderConcerns || (totalReceived > 0 && totalMissing > 0)) {
                derivedStatus = "Fulfilled with Concerns";
                targetSoStatus = totalMissing > 0 ? "Partially Delivered" : "Delivered";
            } else {
                derivedStatus = "Fulfilled";
                targetSoStatus = "Delivered";
            }

            // Mandatory Remarks Validation: Required for 'Fulfilled with Returns', 'Fulfilled with Concerns', 'Unfulfilled / Returns', or quantity variances
            if (
                (derivedStatus === "Fulfilled with Returns" ||
                 derivedStatus === "Fulfilled with Concerns" ||
                 derivedStatus === "Unfulfilled / Returns" ||
                 clientFulfillmentStatus === "Fulfilled with Returns" ||
                 clientFulfillmentStatus === "Fulfilled with Concerns" ||
                 clientFulfillmentStatus === "Unfulfilled / Returns" ||
                 totalMissing > 0) &&
                (!orderRemarks || typeof orderRemarks !== "string" || orderRemarks.trim().length === 0)
            ) {
                const reason = totalMissing > 0 ? "quantity variance" : `status "${clientFulfillmentStatus || derivedStatus}"`;
                return NextResponse.json(
                    {
                        message: `Remarks are required for order #${targetOrderId || invoice_id} due to ${reason}. Please provide clearance remarks.`,
                    },
                    { status: 422 }
                );
            }

            // Verification Guard: Check for linked Sales Return if status is 'Fulfilled with Returns'
            // Unfulfilled / Returns (failed delivery / undelivered return to hub) does NOT require a Sales Return
            if (derivedStatus === "Fulfilled with Returns") {
                let invoiceNo = "";
                let orderNo = "";
                if (invoice_id) {
                    const invRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_invoice/${invoice_id}?fields=invoice_no,order_id`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (invRes.ok) {
                        const invData = (await invRes.json()).data;
                        invoiceNo = invData?.invoice_no ? String(invData.invoice_no).trim() : "";
                        orderNo = invData?.order_id ? String(invData.order_id).trim() : "";
                    }
                }
                if (!orderNo && targetOrderId) {
                    const soRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order/${targetOrderId}?fields=order_no`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (soRes.ok) {
                        const soData = (await soRes.json()).data;
                        orderNo = soData?.order_no ? String(soData.order_no).trim() : "";
                    }
                }

                let hasLinkedReturn = false;

                // 1. Check by invoice_no
                if (invoiceNo) {
                    try {
                        const checkReturnRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_return?filter[invoice_no][_eq]=${encodeURIComponent(invoiceNo)}&limit=1&fields=return_id,return_number,status,isReceived`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkReturnRes.ok) {
                            const returnData = (await checkReturnRes.json()).data;
                            if (returnData && returnData.length > 0) {
                                const srObj = returnData[0];
                                const isReceived =
                                    srObj.status === "Received" ||
                                    srObj.status === "Approved" ||
                                    srObj.isReceived === 1 ||
                                    srObj.isReceived === true ||
                                    srObj.isReceived === "1";
                                if (isReceived) {
                                    hasLinkedReturn = true;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("[fulfilment-and-deliveries POST] Error checking sales_return by invoice_no:", e);
                    }
                }

                // 2. Check by order_id or order_no
                if (!hasLinkedReturn && (orderNo || targetOrderId)) {
                    try {
                        const candidateOrderFilter = orderNo || String(targetOrderId);
                        const checkReturnRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_return?filter[order_id][_eq]=${encodeURIComponent(candidateOrderFilter)}&limit=1&fields=return_id,return_number,status,isReceived`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkReturnRes.ok) {
                            const returnData = (await checkReturnRes.json()).data;
                            if (returnData && returnData.length > 0) {
                                const srObj = returnData[0];
                                const isReceived =
                                    srObj.status === "Received" ||
                                    srObj.status === "Approved" ||
                                    srObj.isReceived === 1 ||
                                    srObj.isReceived === true ||
                                    srObj.isReceived === "1";
                                if (isReceived) {
                                    hasLinkedReturn = true;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("[fulfilment-and-deliveries POST] Error checking sales_return by order_id:", e);
                    }
                }

                // 3. Check junction sales_invoice_sales_return
                if (!hasLinkedReturn && invoice_id) {
                    try {
                        const checkJunctionRes = await fetch(
                            `${DIRECTUS_URL}/items/sales_invoice_sales_return?filter[invoice_no][_eq]=${invoice_id}&limit=1&fields=id`,
                            { headers: directusHeaders, cache: "no-store" }
                        );
                        if (checkJunctionRes.ok) {
                            const junctionData = (await checkJunctionRes.json()).data;
                            if (junctionData && junctionData.length > 0) {
                                hasLinkedReturn = true;
                            }
                        }
                    } catch (e) {
                        console.warn("[fulfilment-and-deliveries POST] Error checking junction:", e);
                    }
                }

                if (!hasLinkedReturn) {
                    return NextResponse.json(
                        {
                            message: `Delivery clearance for "${derivedStatus}" requires a registered and received Sales Return for invoice/order "${invoiceNo || orderNo || targetOrderId}". Please ensure the Sales Return is received before confirming clearance.`,
                            requiresSalesReturn: true,
                            invoice_no: invoiceNo || orderNo,
                        },
                        { status: 422 }
                    );
                }
            }

            const isInvoiceDelivered = targetSoStatus === "Delivered" || targetSoStatus === "Partially Delivered";
            const isInvoiceUnfulfilled = targetSoStatus === "Not Fulfilled" || derivedStatus === "Unfulfilled / Returns";
            const isOrderUnfulfilled = isInvoiceUnfulfilled;

            // Record outcome for parent sales order
            if (targetOrderId) {
                if (!compositeOrderOutcomes.has(targetOrderId)) {
                    compositeOrderOutcomes.set(targetOrderId, {
                        fulfilledInvoices: 0,
                        partiallyDeliveredInvoices: 0,
                        unfulfilledInvoices: 0,
                        totalInvoices: 0,
                        remarks: [],
                    });
                }
                const outcome = compositeOrderOutcomes.get(targetOrderId)!;
                outcome.totalInvoices += 1;
                if (derivedStatus === "Fulfilled") {
                    outcome.fulfilledInvoices += 1;
                } else if (derivedStatus === "Unfulfilled / Returns") {
                    outcome.unfulfilledInvoices += 1;
                } else {
                    outcome.partiallyDeliveredInvoices += 1;
                }
                if (orderRemarks && typeof orderRemarks === "string" && orderRemarks.trim()) {
                    outcome.remarks.push(orderRemarks.trim());
                }
            }

            // Update sales invoice if present: when unfulfilled, reset flags to allow re-dispatch reuse
            if (effectiveInvoiceId) {
                const invoicePayload: Record<string, unknown> = {
                    isDelivered: isInvoiceDelivered ? 1 : 0,
                    isDispatched: isInvoiceUnfulfilled ? 0 : 1,
                    posted_by: userId,
                    posted_date: phNow,
                    modified_by: userId,
                    modified_date: phNow,
                    delivered_at: isInvoiceDelivered ? phNow : null,
                    remarks: typeof orderRemarks === "string" && orderRemarks.trim().length > 0 ? orderRemarks.trim() : null,
                };

                if (isInvoiceUnfulfilled || derivedStatus === "Unfulfilled / Returns") {
                    invoicePayload.transaction_status = "Not Delivered";
                } else if (derivedStatus === "Fulfilled with Returns") {
                    invoicePayload.transaction_status = "Completed with Returns";
                } else if (derivedStatus === "Fulfilled with Concerns") {
                    invoicePayload.transaction_status = "Completed with Concerns";
                } else {
                    invoicePayload.transaction_status = "Completed";
                }

                await fetch(`${DIRECTUS_URL}/items/sales_invoice/${effectiveInvoiceId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify(invoicePayload),
                }).catch((err) => console.warn(`[POST] Failed to update sales_invoice #${effectiveInvoiceId}:`, err));
            }

            // Update sales_order_reservation status for lot-level inventory movement reflection
            // For Unfulfilled: reservations stay 'Consumed' — OUT movement remains in v_mm_inventory_movements permanently.
            // The IN reversal is written via unfulfilled_sales_transaction_details (inventory_lot_id + returned_quantity).
            let allLotReservations: Array<{
                reservation_id?: number;
                id?: number;
                sales_order_detail_id: number;
                product_id?: number;
                inventory_lot_id: number;
                reserved_quantity?: number | string;
                picked_quantity?: number | string;
                status: string;
            }> = [];

            const dbDetailIds = Array.from(dbDetailMap.keys());
            if (dbDetailIds.length > 0) {
                try {
                    const resvRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${dbDetailIds.join(",")}&limit=-1`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (resvRes.ok) {
                        const rawResvData: Array<{
                            reservation_id?: number;
                            id?: number;
                            sales_order_detail_id: number;
                            product_id?: number;
                            inventory_lot_id: number;
                            reserved_quantity?: number | string;
                            picked_quantity?: number | string;
                            status: string;
                        }> = (await resvRes.json()).data || [];

                        // Expose to the unfulfilled detail insertion block below
                        allLotReservations = rawResvData;

                        const lineItemMap = new Map<number, (typeof items)[0]>();
                        for (const it of items) {
                            lineItemMap.set(Number(it.detail_id), it);
                        }

                        // Group reservations by sales_order_detail_id
                        const resvByDetail = new Map<number, typeof rawResvData>();
                        for (const r of rawResvData) {
                            const sodId = Number(r.sales_order_detail_id);
                            const list = resvByDetail.get(sodId) || [];
                            list.push(r);
                            resvByDetail.set(sodId, list);
                        }

                        for (const [, resvList] of resvByDetail.entries()) {
                            if (!isOrderUnfulfilled) {
                                // Fulfilled, Fulfilled with Concerns, or Fulfilled with Returns:
                                // Mark reservations Consumed so the OUT movement stays in the ledger.
                                // (For Fulfilled with Returns, the Sales Return module handles return inventory movements).
                                for (const resv of resvList) {
                                    const resvId = Number(resv.reservation_id || resv.id);
                                    if (!resvId) continue;
                                    if (resv.status !== "Consumed") {
                                        await fetch(`${DIRECTUS_URL}/items/sales_order_reservation/${resvId}`, {
                                            method: "PATCH",
                                            headers: directusHeaders,
                                            body: JSON.stringify({ status: "Consumed" }),
                                        }).catch((err) => console.warn(`[POST] Failed to update reservation #${resvId} to Consumed:`, err));
                                    }
                                }
                            }
                            // Unfulfilled: reservations already Consumed from Consolidation Approval — leave untouched.
                            // The IN reversal is recorded via unfulfilled_sales_transaction_details below.
                        }
                    }
                } catch (resvErr) {
                    console.warn("[POST] Error updating sales_order_reservation status:", resvErr);
                }
            }

            // Fallback: for unfulfilled orders, if allLotReservations is still empty
            // (dbDetailIds was empty or the fetch returned no results), re-fetch
            // reservations directly using targetOrderId → sales_order_details → sales_order_reservation.
            if (isOrderUnfulfilled && allLotReservations.length === 0 && targetOrderId) {
                try {
                    const detailRes = await fetch(
                        `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${targetOrderId}&limit=-1&fields=detail_id`,
                        { headers: directusHeaders, cache: "no-store" }
                    );
                    if (detailRes.ok) {
                        const detailData: Array<{ detail_id: number }> = (await detailRes.json()).data || [];
                        const directDetailIds = detailData.map((d) => Number(d.detail_id)).filter(Boolean);
                        if (directDetailIds.length > 0) {
                            const retryResvRes = await fetch(
                                `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${directDetailIds.join(",")}&limit=-1`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (retryResvRes.ok) {
                                allLotReservations = (await retryResvRes.json()).data || [];
                            }
                        }
                    }
                } catch (fallbackErr) {
                    console.warn("[POST] Fallback reservation fetch error:", fallbackErr);
                }
            }

            // Log discrepancy in unfulfilled_sales_transaction for returns, variances, unfulfilled, or concerns
            if (
                totalReturned > 0 ||
                totalMissing > 0 ||
                derivedStatus === "Unfulfilled / Returns" ||
                derivedStatus === "Fulfilled with Concerns"
            ) {
                try {
                    let unfulfilledId: number | null = null;
                    const finalUstInvoiceId = effectiveInvoiceId || Number(invoice_id || targetOrderId);

                    // Check if an unfulfilled_sales_transaction already exists for this sales_invoice_id (to avoid unique key constraint violation)
                    if (finalUstInvoiceId) {
                        try {
                            const existingUstRes = await fetch(
                                `${DIRECTUS_URL}/items/unfulfilled_sales_transaction?filter[sales_invoice_id][_eq]=${finalUstInvoiceId}&limit=1&fields=id`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (existingUstRes.ok) {
                                const existingUstData = (await existingUstRes.json()).data;
                                if (existingUstData && existingUstData.length > 0) {
                                    unfulfilledId = Number(existingUstData[0].id);
                                    await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction/${unfulfilledId}`, {
                                        method: "PATCH",
                                        headers: directusHeaders,
                                        body: JSON.stringify({
                                            nte: typeof orderRemarks === "string" ? orderRemarks.trim() : "",
                                            isCleared: 1,
                                            checked_by: userId,
                                            date_acknowledged: phNow,
                                            variance_amount: totalReturned + totalMissing,
                                        }),
                                    }).catch(() => null);
                                }
                            }
                        } catch (checkErr) {
                            console.warn("[POST] Error checking existing unfulfilled_sales_transaction:", checkErr);
                        }
                    }

                    if (!unfulfilledId) {
                        const unfulfilledRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction`, {
                            method: "POST",
                            headers: directusHeaders,
                            body: JSON.stringify({
                                sales_invoice_id: finalUstInvoiceId,
                                nte: typeof orderRemarks === "string" ? orderRemarks.trim() : "",
                                isCleared: 1,
                                checked_by: userId,
                                date_acknowledged: phNow,
                                date_created: phNow,
                                variance_amount: totalReturned + totalMissing,
                            }),
                        });
                        if (unfulfilledRes.ok) {
                            const unfulfilledHeader = (await unfulfilledRes.json()).data;
                            unfulfilledId = unfulfilledHeader?.id ? Number(unfulfilledHeader.id) : null;
                        } else {
                            const errText = await unfulfilledRes.text();
                            console.error(`[POST] Failed to create unfulfilled_sales_transaction: ${unfulfilledRes.status} ${errText}`);
                        }
                    }

                    if (unfulfilledId) {
                        // Lookup real sales_invoice_details by invoice_no to map product_id -> sales_invoice_detail_id
                        const invoiceDetailMap = new Map<number, number>();
                        if (finalUstInvoiceId) {
                            try {
                                const sidRes = await fetch(
                                    `${DIRECTUS_URL}/items/sales_invoice_details?filter[invoice_no][_eq]=${finalUstInvoiceId}&limit=-1&fields=detail_id,product_id`,
                                    { headers: directusHeaders, cache: "no-store" }
                                );
                                if (sidRes.ok) {
                                    const sidData: Array<{ detail_id: number; product_id: number }> = (await sidRes.json()).data || [];
                                    for (const sid of sidData) {
                                        if (sid.product_id && sid.detail_id) {
                                            invoiceDetailMap.set(Number(sid.product_id), Number(sid.detail_id));
                                        }
                                    }
                                }
                            } catch (sidErr) {
                                console.warn("[POST] Error fetching sales_invoice_details for UST mapping:", sidErr);
                            }
                        }

                        // Clean up existing details for this unfulfilled_sales_transaction_id to prevent duplicates on repeated clearance
                        try {
                            const existingDetailsRes = await fetch(
                                `${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details?filter[unfulfilled_sales_transaction_id][_eq]=${unfulfilledId}&limit=-1&fields=id`,
                                { headers: directusHeaders, cache: "no-store" }
                            );
                            if (existingDetailsRes.ok) {
                                const existingDetails = (await existingDetailsRes.json()).data || [];
                                for (const det of existingDetails) {
                                    if (det.id) {
                                        await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details/${det.id}`, {
                                            method: "DELETE",
                                            headers: directusHeaders,
                                        }).catch(() => null);
                                    }
                                }
                            }
                        } catch (cleanErr) {
                            console.warn("[POST] Error cleaning up old unfulfilled details:", cleanErr);
                        }

                        for (const item of items) {
                            const sodId = Number(item.detail_id);
                            const prodId = Number(item.product_id);
                            const dbItem = dbDetailMap.get(sodId);
                            const rec = Number(item.received_quantity);
                            const ret = Number(item.returned_quantity);
                            const dbOrdered = dbItem ? Number(dbItem.ordered_quantity || 0) : rec + ret;
                            const expectedQty = item.invoiced_quantity !== undefined && item.invoiced_quantity !== null
                                ? Number(item.invoiced_quantity)
                                : dbOrdered;
                            const missing = Math.max(0, expectedQty - (rec + ret));

                            // If this item line has 0 returned, 0 missing, and no concerns, strictly skip detail insertion
                            if (ret <= 0 && missing <= 0 && !item.has_concern && derivedStatus !== "Fulfilled with Concerns") {
                                continue;
                            }

                            // Foreign key requires matching sales_invoice_details.detail_id or null
                            const validInvoiceDetailId = (prodId && invoiceDetailMap.get(prodId)) || null;

                            // 1. Check if client sent per-batch allocations in item.reservations
                            const clientReservations: Array<{
                                inventory_lot_id?: number;
                                returned_quantity?: number | string;
                                picked_quantity?: number | string;
                                product_id?: number;
                            }> = Array.isArray(item.reservations) ? item.reservations : [];
                            const allocatedClientResvs = clientReservations.filter(
                                (r) => Number(r.returned_quantity || 0) > 0 && r.inventory_lot_id
                            );

                            if (allocatedClientResvs.length > 0) {
                                // Insert detail rows using exact allocated returned_quantity per batch
                                for (const resv of allocatedClientResvs) {
                                    const allocQty = Number(resv.returned_quantity);
                                    if (allocQty <= 0) continue;
                                    const detailRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details`, {
                                        method: "POST",
                                        headers: directusHeaders,
                                        body: JSON.stringify({
                                            unfulfilled_sales_transaction_id: unfulfilledId,
                                            sales_invoice_detail_id: validInvoiceDetailId,
                                            inventory_lot_id: resv.inventory_lot_id,
                                            product_id: resv.product_id || prodId || null,
                                            returned_quantity: allocQty,
                                            missing_quantity: allocQty,
                                            invoice_quantity: Number(resv.picked_quantity) || expectedQty,
                                            total_amount: 0,
                                        }),
                                    });
                                    if (!detailRes.ok) {
                                        const errText = await detailRes.text();
                                        console.error(`[POST] Failed to insert unfulfilled detail: ${detailRes.status} ${errText}`);
                                    }
                                }
                            } else if (ret > 0 || missing > 0 || item.has_concern || derivedStatus === "Fulfilled with Concerns") {
                                // Item-level variance without batch allocation or non-lot item
                                const detailRes = await fetch(`${DIRECTUS_URL}/items/unfulfilled_sales_transaction_details`, {
                                    method: "POST",
                                    headers: directusHeaders,
                                    body: JSON.stringify({
                                        unfulfilled_sales_transaction_id: unfulfilledId,
                                        sales_invoice_detail_id: validInvoiceDetailId,
                                        inventory_lot_id: null,
                                        product_id: prodId || null,
                                        returned_quantity: ret,
                                        missing_quantity: ret + missing,
                                        invoice_quantity: expectedQty,
                                        total_amount: 0,
                                    }),
                                });
                                if (!detailRes.ok) {
                                    const errText = await detailRes.text();
                                    console.error(`[POST] Failed to insert non-lot unfulfilled detail: ${detailRes.status} ${errText}`);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[POST] Error logging unfulfilled transaction:", e);
                }
            }
        }

        // Update each parent sales order based on composite outcomes of all its invoices
        for (const [targetOrderId, outcome] of compositeOrderOutcomes.entries()) {
            let finalOrderStatus: "Delivered" | "Partially Delivered" | "For Consolidation";
            let isOrderDelivered = false;
            let isOrderUnfulfilled = false;

            if (outcome.unfulfilledInvoices === outcome.totalInvoices) {
                // All invoices unfulfilled -> transitions back to "For Consolidation"
                finalOrderStatus = "For Consolidation";
                isOrderUnfulfilled = true;
            } else if (outcome.fulfilledInvoices === outcome.totalInvoices) {
                // All invoices completely fulfilled -> "Delivered"
                finalOrderStatus = "Delivered";
                isOrderDelivered = true;
            } else {
                // Mixed or partial -> "Partially Delivered"
                finalOrderStatus = "Partially Delivered";
                isOrderDelivered = true;
            }

            const soPayload: Record<string, unknown> = {
                order_status: finalOrderStatus,
                isDelivered: isOrderDelivered ? 1 : 0,
                modified_by: userId,
                modified_date: phNow,
                posted_by: userId,
                posted_date: phNow,
            };
            if (isOrderDelivered) {
                soPayload.delivered_at = phNow;
                soPayload.not_fulfilled_at = null;
            } else if (isOrderUnfulfilled) {
                soPayload.not_fulfilled_at = phNow;
            }

            await fetch(`${DIRECTUS_URL}/items/sales_order/${targetOrderId}`, {
                method: "PATCH",
                headers: directusHeaders,
                body: JSON.stringify(soPayload),
            }).catch((err) => console.warn(`[POST] Failed to update composite sales_order #${targetOrderId}:`, err));
        }

        // Update dispatch plan / consolidator status to Completed, keeping phNow
        const targetPlanId = Number(dispatch_id || consolidator_id);
        if (targetPlanId) {
            try {
                const dpRes = await fetch(`${DIRECTUS_URL}/items/dispatch_plan/${targetPlanId}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        status: "Completed",
                        updated_at: phNow,
                    }),
                });
                if (!dpRes.ok) {
                    const errText = await dpRes.text().catch(() => "");
                    console.warn(`[POST] Failed to update dispatch_plan #${targetPlanId} with updated_at (${dpRes.status}):`, errText);
                    // Fallback without updated_at if Directus schema rejects the field:
                    await fetch(`${DIRECTUS_URL}/items/dispatch_plan/${targetPlanId}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            status: "Completed",
                        }),
                    }).catch(() => null);
                }
            } catch (dpErr) {
                console.warn(`[POST] Network error updating dispatch_plan #${targetPlanId}:`, dpErr);
            }
        }

        if (consolidator_id) {
            try {
                const conRes = await fetch(`${DIRECTUS_URL}/items/consolidator/${consolidator_id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({
                        status: "Completed",
                        updated_at: phNow,
                    }),
                });
                if (!conRes.ok) {
                    const errText = await conRes.text().catch(() => "");
                    console.warn(`[POST] Failed to update consolidator #${consolidator_id} with updated_at (${conRes.status}):`, errText);
                    // Fallback without updated_at if Directus schema rejects the field:
                    await fetch(`${DIRECTUS_URL}/items/consolidator/${consolidator_id}`, {
                        method: "PATCH",
                        headers: directusHeaders,
                        body: JSON.stringify({
                            status: "Completed",
                        }),
                    }).catch(() => null);
                }
            } catch (conErr) {
                console.warn(`[POST] Network error updating consolidator #${consolidator_id}:`, conErr);
            }
        }

        return NextResponse.json({
            success: true,
            message: "Consolidated delivery clearance committed successfully.",
        });
    } catch (error) {
        console.error("[fulfilment-and-deliveries POST] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to commit delivery clearance." },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { invoice_id, remarks } = body;
        if (!invoice_id) {
            return NextResponse.json({ message: "invoice_id is required." }, { status: 400 });
        }

        const userId = await getUserIdFromToken();
        const phNow = getPhTimestamp();

        const patchRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${invoice_id}`, {
            method: "PATCH",
            headers: directusHeaders,
            body: JSON.stringify({
                remarks: typeof remarks === "string" ? remarks.trim() : null,
                modified_by: userId,
                modified_date: phNow,
            }),
        });

        if (!patchRes.ok) {
            const errText = await patchRes.text();
            return NextResponse.json(
                { message: `Failed to update sales invoice remarks: ${errText}` },
                { status: patchRes.status }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Invoice remarks updated successfully.",
        });
    } catch (error) {
        console.error("[fulfilment-and-deliveries PATCH] Error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Failed to update invoice remarks." },
            { status: 500 }
        );
    }
}