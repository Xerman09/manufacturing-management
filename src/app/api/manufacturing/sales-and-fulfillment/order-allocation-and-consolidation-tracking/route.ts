// src/app/api/manufacturing/sales-and-fulfillment/order-allocation-and-consolidation-tracking/route.ts

import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";
import {
    OrderTrackingItem,
    OrderTrackingLineItem,
    LotReservationRef,
    ConsolidationBatchRef,
    AllocationStatus,
    ConsolidationStatus,
    OrderStage,
    TrackingMetrics,
    BranchOption,
    TrackingApiResponse,
} from "@/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTruthyDelete(val: unknown): boolean {
    if (!val) return false;
    if (val === 1 || val === true || val === "1") return true;
    if (typeof val === "object" && val && "data" in (val as Record<string, unknown>)) {
        const d = (val as { data: number[] }).data;
        return Array.isArray(d) && d[0] === 1;
    }
    return false;
}

interface RawDirectusReservation {
    reservation_id: number;
    sales_order_detail_id: number;
    inventory_lot_id?: {
        inventory_lot_id?: number;
        batch_no?: string;
        expiry_date?: string | null;
        lot_id?: { lot_name?: string } | number;
    } | number;
    reserved_quantity: number | string;
    picked_quantity: number | string;
    status: "Reserved" | "Picked" | "Consumed" | "Released" | "Returned";
    created_at?: string | null;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const branchIdParam = searchParams.get("branchId");
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const stageFilter = searchParams.get("stage") || "All";
        const allocFilter = searchParams.get("allocationStatus") || "All";
        const consolFilter = searchParams.get("consolidationStatus") || "All";
        const exceptionsOnly = searchParams.get("exceptionsOnly") === "true";
        const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
        const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get("pageSize") || "15", 10)));

        // 1. Fetch active branches for filter combobox
        const branchRes = await fetch(
            `${DIRECTUS_URL}/items/branches?filter[isActive][_eq]=1&limit=-1&fields=id,branch_name,branch_code&sort=branch_name`,
            { headers: directusHeaders, cache: "no-store" }
        ).catch(() => null);

        const branchesRaw = branchRes && branchRes.ok ? (await branchRes.json()).data || [] : [];
        const branches: BranchOption[] = branchesRaw.map((b: { id: number; branch_name: string; branch_code?: string }) => ({
            id: Number(b.id),
            branch_name: b.branch_name || `Branch #${b.id}`,
            branch_code: b.branch_code || "",
        }));

        const branchMap = new Map<number, BranchOption>(branches.map((b) => [b.id, b]));

        // Determine branch filter: Default to all branches unless a specific numeric branchId is provided
        let selectedBranchId: number | null = null;
        if (
            branchIdParam &&
            branchIdParam !== "All" &&
            branchIdParam !== "default" &&
            !isNaN(Number(branchIdParam))
        ) {
            selectedBranchId = Number(branchIdParam);
        }

        // 2. Fetch Sales Orders (with branch scope if selected)
        let soQuery = `${DIRECTUS_URL}/items/sales_order?limit=-1&sort=-order_date&fields=order_id,order_no,po_no,customer_code,branch_id,order_date,delivery_date,order_status,isCancelled`;
        if (selectedBranchId !== null) {
            soQuery += `&filter[branch_id][_eq]=${selectedBranchId}`;
        }

        const soRes = await fetch(soQuery, { headers: directusHeaders, cache: "no-store" });
        if (!soRes.ok) {
            const errTxt = await soRes.text().catch(() => "");
            return NextResponse.json(
                { success: false, message: `Failed to fetch sales orders: HTTP ${soRes.status} ${errTxt}` },
                { status: soRes.status }
            );
        }

        const soRows = (await soRes.json()).data || [];
        if (soRows.length === 0) {
            const emptyMetrics: TrackingMetrics = {
                total_orders: 0,
                overall_allocation_rate: 0,
                overall_physical_consolidation_rate: 0,
                overall_planned_consolidation_rate: 0,
                stage_awaiting_allocation_count: 0,
                stage_ready_for_picking_count: 0,
                stage_in_picking_count: 0,
                stage_fully_picked_count: 0,
                fully_allocated_count: 0,
                partially_allocated_count: 0,
                not_started_allocation_count: 0,
                fully_consolidated_count: 0,
                partially_consolidated_count: 0,
                not_started_consolidation_count: 0,
                total_discrepancies: 0,
                total_inconsistent_picks: 0,
                total_excess_allocations: 0,
                total_excess_consolidations: 0,
                total_missing_reservations: 0,
                total_zero_quantity_lines: 0,
                total_mixed_uom_orders: 0,
                total_exceptions_count: 0,
            };

            return NextResponse.json<TrackingApiResponse>({
                success: true,
                data: [],
                totalCount: 0,
                page: 0,
                pageSize,
                totalPages: 0,
                metrics: emptyMetrics,
                branches,
            });
        }

        const orderIds: number[] = soRows.map((o: { order_id: number }) => Number(o.order_id));
        const customerCodes: string[] = Array.from(new Set(soRows.map((o: { customer_code?: string }) => o.customer_code).filter(Boolean)));

        // 3. Batch fetch Customer names, Cancellation requests, and Order Details
        const [custRes, cancelReqRes, sodRes] = await Promise.all([
            customerCodes.length > 0
                ? fetch(
                      `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${customerCodes.map((c) => encodeURIComponent(c)).join(",")}&limit=-1&fields=customer_code,customer_name`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            fetch(
                `${DIRECTUS_URL}/items/sales_order_cancellation_requests?filter[order_id][_in]=${orderIds.join(",")}&filter[request_status][_eq]=Approved&limit=-1&fields=order_id,request_status`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_in]=${orderIds.join(",")}&limit=-1&fields=detail_id,order_id,product_id,ordered_quantity,allocated_quantity,served_quantity,remarks`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
        ]);

        const customerMap = new Map<string, string>();
        if (custRes && custRes.ok) {
            const custJson = await custRes.json();
            for (const c of custJson.data || []) {
                if (c.customer_code) customerMap.set(c.customer_code, c.customer_name || c.customer_code);
            }
        }

        const cancelledOrderIds = new Set<number>();
        if (cancelReqRes && cancelReqRes.ok) {
            const cJson = await cancelReqRes.json();
            for (const r of cJson.data || []) {
                cancelledOrderIds.add(Number(r.order_id));
            }
        }

        const sodRows = sodRes && sodRes.ok ? (await sodRes.json()).data || [] : [];
        const detailIds: number[] = sodRows.map((d: { detail_id: number }) => Number(d.detail_id));
        const productIds: number[] = Array.from(new Set(sodRows.map((d: { product_id: number }) => Number(d.product_id))));

        // 4. Batch fetch Products, Reservations, and Consolidator Details
        const productMap = new Map<number, { product_id: number; product_code: string; product_name: string; uom: string }>();
        const reservationMap = new Map<number, LotReservationRef[]>();
        let consolidatorDetailRows: Array<{
            id: number;
            consolidator_id: number;
            sales_order_detail_id?: number | null;
            product_id: number;
            ordered_quantity: number;
            applied_quantity: number;
            picked_quantity: number;
            picked_at?: string | null;
            picked_by?: unknown;
        }> = [];

        if (detailIds.length > 0) {
            const [prodRes, resvRes, consolDetailRes] = await Promise.all([
                productIds.length > 0
                    ? fetch(
                          `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${productIds.join(",")}&limit=-1&fields=product_id,product_code,product_name,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name`,
                          { headers: directusHeaders, cache: "no-store" }
                      ).catch(() => null)
                    : Promise.resolve(null),
                fetch(
                    `${DIRECTUS_URL}/items/sales_order_reservation?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&limit=-1&fields=reservation_id,sales_order_detail_id,inventory_lot_id.inventory_lot_id,inventory_lot_id.batch_no,inventory_lot_id.expiry_date,inventory_lot_id.lot_id.lot_name,reserved_quantity,picked_quantity,status,created_at`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
                fetch(
                    `${DIRECTUS_URL}/items/consolidator_details?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&limit=-1&fields=id,consolidator_id,sales_order_detail_id,product_id,ordered_quantity,applied_quantity,picked_quantity,picked_at,picked_by.user_fname,picked_by.user_lname`,
                    { headers: directusHeaders, cache: "no-store" }
                ).catch(() => null),
            ]);

            if (prodRes && prodRes.ok) {
                const pJson = await prodRes.json();
                for (const p of pJson.data || []) {
                    const uom =
                        typeof p.unit_of_measurement === "object" && p.unit_of_measurement
                            ? p.unit_of_measurement.unit_shortcut || p.unit_of_measurement.unit_name || "pcs"
                            : typeof p.unit_of_measurement === "string"
                            ? p.unit_of_measurement
                            : "pcs";
                    productMap.set(Number(p.product_id), {
                        product_id: Number(p.product_id),
                        product_code: p.product_code || `PRD-${p.product_id}`,
                        product_name: p.product_name || `Product #${p.product_id}`,
                        uom,
                    });
                }
            }

            if (resvRes && resvRes.ok) {
                const rJson = await resvRes.json();
                const rawRows: RawDirectusReservation[] = rJson.data || [];

                // Group by sales_order_detail_id to evaluate initial planning vs added floor lots
                const detailRowsMap = new Map<number, RawDirectusReservation[]>();
                for (const r of rawRows) {
                    const dId = Number(r.sales_order_detail_id);
                    const arr = detailRowsMap.get(dId) || [];
                    arr.push(r);
                    detailRowsMap.set(dId, arr);
                }

                for (const [dId, dRows] of detailRowsMap.entries()) {
                    // Sort by reservation_id ascending so earliest allocation comes first
                    dRows.sort((a, b) => Number(a.reservation_id) - Number(b.reservation_id));
                    const earliestTime = dRows[0]?.created_at ? new Date(dRows[0].created_at).getTime() : null;

                    for (let i = 0; i < dRows.length; i++) {
                        const r = dRows[i];
                        const rawReserved = Number(r.reserved_quantity) || 0;
                        const rawPicked = Number(r.picked_quantity) || 0;
                        const rowTime = r.created_at ? new Date(r.created_at).getTime() : null;

                        const isSubstitutedLot = rawReserved === 0 && rawPicked > 0;
                        const isAddedLot = isSubstitutedLot || (i > 0 && (
                            (rowTime && earliestTime && rowTime > earliestTime + 5000) ||
                            (rawReserved === rawPicked && rawPicked > 0 && Number(dRows[0].picked_quantity || 0) < Number(dRows[0].reserved_quantity || 0))
                        ));
                        const isPickExceeds = rawReserved > 0 && rawPicked > rawReserved && !isAddedLot;
                        const effectiveAlloc = isPickExceeds ? rawPicked : (isSubstitutedLot ? rawPicked : rawReserved);

                        let lotNo = "-";
                        let batchNo = "-";
                        let expiryDate: string | null = null;
                        let invLotId = 0;

                        if (typeof r.inventory_lot_id === "object" && r.inventory_lot_id) {
                            invLotId = Number(r.inventory_lot_id.inventory_lot_id || 0);
                            batchNo = r.inventory_lot_id.batch_no || "-";
                            expiryDate = r.inventory_lot_id.expiry_date || null;
                            if (typeof r.inventory_lot_id.lot_id === "object" && r.inventory_lot_id.lot_id) {
                                lotNo = r.inventory_lot_id.lot_id.lot_name || "-";
                            } else if (r.inventory_lot_id.lot_id) {
                                lotNo = `Lot #${r.inventory_lot_id.lot_id}`;
                            }
                        } else if (r.inventory_lot_id) {
                            invLotId = Number(r.inventory_lot_id);
                            lotNo = `Lot #${r.inventory_lot_id}`;
                        }

                        const resvRef: LotReservationRef = {
                            reservation_id: Number(r.reservation_id),
                            sales_order_detail_id: dId,
                            inventory_lot_id: invLotId,
                            lot_number: lotNo,
                            batch_no: batchNo,
                            expiry_date: expiryDate,
                            reserved_quantity: rawReserved,
                            picked_quantity: rawPicked,
                            effective_allocated_quantity: effectiveAlloc,
                            status: r.status || "Reserved",
                            is_pick_exceeds_reserve: isPickExceeds,
                            is_substituted_lot: isSubstitutedLot,
                            is_added_lot: isAddedLot,
                            created_at: r.created_at || null,
                        };

                        const arr = reservationMap.get(dId) || [];
                        arr.push(resvRef);
                        reservationMap.set(dId, arr);
                    }
                }
            }

            if (consolDetailRes && consolDetailRes.ok) {
                const cJson = await consolDetailRes.json();
                consolidatorDetailRows = cJson.data || [];
            }
        }

        // 5. Fetch Parent Consolidation Batches
        const consolidatorMap = new Map<number, { id: number; consolidator_no: string; status: string; branch_id: number; is_delete: boolean }>();
        const parentConsolIds = Array.from(new Set(consolidatorDetailRows.map((cd) => Number(cd.consolidator_id)).filter(Boolean)));

        if (parentConsolIds.length > 0) {
            const batchRes = await fetch(
                `${DIRECTUS_URL}/items/consolidator?filter[id][_in]=${parentConsolIds.join(",")}&limit=-1&fields=id,consolidator_no,status,branch_id,is_delete,deleted_at`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null);

            if (batchRes && batchRes.ok) {
                const bJson = await batchRes.json();
                for (const b of bJson.data || []) {
                    const isDel = isTruthyDelete(b.is_delete) || Boolean(b.deleted_at);
                    consolidatorMap.set(Number(b.id), {
                        id: Number(b.id),
                        consolidator_no: b.consolidator_no || `BATCH-${b.id}`,
                        status: b.status || "Pending",
                        branch_id: Number(b.branch_id),
                        is_delete: isDel,
                    });
                }
            }
        }

        // Map consolidation batches per sales order detail
        const validStatuses = new Set(["Draft", "Pending", "Picking", "Picked", "Approved", "Audited", "Completed"]);
        const consolBatchMap = new Map<number, ConsolidationBatchRef[]>();

        for (const cd of consolidatorDetailRows) {
            const dId = Number(cd.sales_order_detail_id);
            if (!dId) continue;
            const parent = consolidatorMap.get(Number(cd.consolidator_id));
            if (!parent) continue;

            if (parent.is_delete) continue;
            if (!validStatuses.has(parent.status)) continue;

            let pickedByName = "-";
            if (typeof cd.picked_by === "object" && cd.picked_by) {
                const pb = cd.picked_by as { user_fname?: string; user_lname?: string };
                pickedByName = [pb.user_fname, pb.user_lname].filter(Boolean).join(" ") || "-";
            }

            const batchRef: ConsolidationBatchRef = {
                id: Number(cd.id),
                consolidator_id: parent.id,
                consolidator_no: parent.consolidator_no,
                sales_order_detail_id: dId,
                batch_status: parent.status,
                applied_quantity: Number(cd.applied_quantity) || 0,
                picked_quantity: Number(cd.picked_quantity) || 0,
                picked_at: cd.picked_at || null,
                picked_by_name: pickedByName,
            };

            const arr = consolBatchMap.get(dId) || [];
            arr.push(batchRef);
            consolBatchMap.set(dId, arr);
        }

        // Group order details by order_id
        const orderLinesMap = new Map<number, typeof sodRows>();
        for (const sod of sodRows) {
            const oId = Number(sod.order_id);
            const arr = orderLinesMap.get(oId) || [];
            arr.push(sod);
            orderLinesMap.set(oId, arr);
        }

        // 6. Assemble Order Items
        const assembledItems: OrderTrackingItem[] = [];

        for (const so of soRows) {
            const oId = Number(so.order_id);
            const isOrderCancelled =
                Boolean(so.isCancelled) ||
                so.order_status === "Cancelled" ||
                cancelledOrderIds.has(oId);

            const sodList = orderLinesMap.get(oId) || [];
            const lines: OrderTrackingLineItem[] = [];
            const uomSet = new Set<string>();

            for (const sod of sodList) {
                const dId = Number(sod.detail_id);
                const pId = Number(sod.product_id);
                const prod = productMap.get(pId) || {
                    product_id: pId,
                    product_code: `PRD-${pId}`,
                    product_name: `Product #${pId}`,
                    uom: "pcs",
                };
                uomSet.add(prod.uom);

                const orderedQty = Number(sod.ordered_quantity) || 0;
                const storedAllocQty = Number(sod.allocated_quantity) || 0;

                const reservations = reservationMap.get(dId) || [];
                const batches = consolBatchMap.get(dId) || [];

                const activeReservations = reservations.filter((r) => ["Reserved", "Picked", "Consumed"].includes(r.status));
                const rawDerivedAlloc = activeReservations.reduce((sum, r) => sum + r.effective_allocated_quantity, 0);
                const hasAddedOrSubstituted = activeReservations.some((r) => r.is_added_lot || r.is_substituted_lot);
                const derivedAllocQty = (hasAddedOrSubstituted && orderedQty > 0 && rawDerivedAlloc > orderedQty)
                    ? (storedAllocQty > 0 && storedAllocQty <= orderedQty ? storedAllocQty : orderedQty)
                    : rawDerivedAlloc;

                const appliedConsolQty = batches.reduce((sum, b) => sum + b.applied_quantity, 0);
                const pickedConsolQty = batches.reduce((sum, b) => sum + b.picked_quantity, 0);
                const approvedBatches = batches.filter((b) => ["Approved", "Audited", "Completed"].includes(b.batch_status));
                const approvedConsolQty = approvedBatches.reduce((sum, b) => sum + (b.picked_quantity || b.applied_quantity), 0);

                const remainingToAlloc = isOrderCancelled ? 0 : Math.max(0, orderedQty - derivedAllocQty);
                const isExcessAlloc = !isOrderCancelled && derivedAllocQty > orderedQty && orderedQty > 0;
                const excessAllocQty = isExcessAlloc ? derivedAllocQty - orderedQty : 0;

                let allocStatus: AllocationStatus = "Not Started";
                if (isExcessAlloc) {
                    allocStatus = "Excess";
                } else if (orderedQty > 0 && derivedAllocQty >= orderedQty) {
                    allocStatus = "Complete";
                } else if (derivedAllocQty > 0) {
                    allocStatus = "Partial";
                }

                const remainingToConsolPhys = isOrderCancelled ? 0 : Math.max(0, orderedQty - pickedConsolQty);
                const remainingToPlanGap = isOrderCancelled ? 0 : Math.max(0, orderedQty - appliedConsolQty);
                const isExcessConsol = !isOrderCancelled && pickedConsolQty > orderedQty && orderedQty > 0;
                const excessConsolQty = isExcessConsol ? pickedConsolQty - orderedQty : 0;

                let consolStatus: ConsolidationStatus = "Not Started";
                if (isExcessConsol) {
                    consolStatus = "Excess";
                } else if (orderedQty > 0 && pickedConsolQty >= orderedQty) {
                    consolStatus = "Complete";
                } else if (pickedConsolQty > 0) {
                    consolStatus = "Partial";
                }

                let lineStage: OrderStage = "Awaiting Allocation";
                if (
                    ["Picked", "For Invoicing", "Audited", "Completed", "For Loading", "For Shipping", "En Route", "Delivered"].includes(so.order_status) ||
                    (orderedQty > 0 && pickedConsolQty >= orderedQty)
                ) {
                    lineStage = "Fully Picked";
                } else if (pickedConsolQty > 0 || so.order_status === "For Picking") {
                    lineStage = "In Picking";
                } else if (derivedAllocQty >= orderedQty && orderedQty > 0) {
                    lineStage = "Ready for Picking";
                } else {
                    lineStage = "Awaiting Allocation";
                }

                const isDiscrepancy = derivedAllocQty !== storedAllocQty;
                const isPickExceeds = activeReservations.some((r) => r.is_pick_exceeds_reserve);
                const isMissingReservations = storedAllocQty > 0 && activeReservations.length === 0;
                const isZeroQuantity = orderedQty === 0;

                lines.push({
                    detail_id: dId,
                    order_id: oId,
                    product_id: pId,
                    product_code: prod.product_code,
                    product_name: prod.product_name,
                    uom: prod.uom,
                    ordered_quantity: orderedQty,
                    allocated_quantity: derivedAllocQty,
                    derived_allocated_quantity: derivedAllocQty,
                    stored_allocated_quantity: storedAllocQty,
                    remaining_to_allocate: remainingToAlloc,
                    allocation_status: allocStatus,
                    is_excess_allocation: isExcessAlloc,
                    excess_allocation_quantity: excessAllocQty,
                    applied_consolidation_quantity: appliedConsolQty,
                    picked_consolidation_quantity: pickedConsolQty,
                    approved_consolidation_quantity: approvedConsolQty,
                    remaining_to_consolidate_physical: remainingToConsolPhys,
                    remaining_to_plan_gap: remainingToPlanGap,
                    consolidation_status: consolStatus,
                    stage: lineStage,
                    is_excess_consolidation: isExcessConsol,
                    excess_consolidation_quantity: excessConsolQty,
                    is_discrepancy: isDiscrepancy,
                    is_pick_exceeds_reserve: isPickExceeds,
                    is_missing_reservations: isMissingReservations,
                    is_zero_quantity: isZeroQuantity,
                    is_cancelled: isOrderCancelled,
                    reservations,
                    consolidation_batches: batches,
                });
            }

            const isMixedUom = uomSet.size > 1;
            const uomSummary = isMixedUom ? "Mixed UOM" : uomSet.values().next().value || "pcs";

            const totalOrderedQty = lines.reduce((sum, l) => sum + l.ordered_quantity, 0);
            const totalAllocQty = lines.reduce((sum, l) => sum + l.derived_allocated_quantity, 0);
            const totalStoredAllocQty = lines.reduce((sum, l) => sum + l.stored_allocated_quantity, 0);
            const totalPickedQty = lines.reduce((sum, l) => sum + l.picked_consolidation_quantity, 0);
            const totalApprovedConsolQty = lines.reduce((sum, l) => sum + l.approved_consolidation_quantity, 0);
            const totalAppliedQty = lines.reduce((sum, l) => sum + l.applied_consolidation_quantity, 0);
            const totalRemainingAlloc = lines.reduce((sum, l) => sum + l.remaining_to_allocate, 0);
            const totalRemainingConsol = lines.reduce((sum, l) => sum + l.remaining_to_consolidate_physical, 0);

            // Quantity-weighted rates
            const allocRate = totalOrderedQty > 0 ? (totalAllocQty / totalOrderedQty) * 100 : 0;
            const physicalConsolRate = totalOrderedQty > 0 ? (totalPickedQty / totalOrderedQty) * 100 : 0;
            const plannedConsolRate = totalOrderedQty > 0 ? (totalAppliedQty / totalOrderedQty) * 100 : 0;

            let overallAllocStatus: AllocationStatus = "Not Started";
            if (lines.length > 0 && lines.every((l) => ["Complete", "Excess"].includes(l.allocation_status))) {
                overallAllocStatus = lines.some((l) => l.allocation_status === "Excess") ? "Excess" : "Complete";
            } else if (totalAllocQty > 0) {
                overallAllocStatus = "Partial";
            }

            let overallConsolStatus: ConsolidationStatus = "Not Started";
            if (lines.length > 0 && lines.every((l) => ["Complete", "Excess"].includes(l.consolidation_status))) {
                overallConsolStatus = lines.some((l) => l.consolidation_status === "Excess") ? "Excess" : "Complete";
            } else if (totalPickedQty > 0) {
                overallConsolStatus = "Partial";
            }

            // Determine unified Order Stage
            let orderStage: OrderStage = "Awaiting Allocation";
            if (
                ["Picked", "For Invoicing", "Audited", "Completed", "For Loading", "For Shipping", "En Route", "Delivered"].includes(so.order_status) ||
                (totalOrderedQty > 0 && totalPickedQty >= totalOrderedQty)
            ) {
                orderStage = "Fully Picked";
            } else if (
                so.order_status === "For Picking" ||
                (totalPickedQty > 0 && totalPickedQty < totalOrderedQty)
            ) {
                orderStage = "In Picking";
            } else if (
                (totalAllocQty >= totalOrderedQty && totalOrderedQty > 0) ||
                lines.some((l) => l.consolidation_batches.some((b) => ["Draft", "Pending"].includes(b.batch_status)))
            ) {
                orderStage = "Ready for Picking";
            } else {
                orderStage = "Awaiting Allocation";
            }

            const branchObj = branchMap.get(Number(so.branch_id));
            const branchName = branchObj ? branchObj.branch_name : `Branch #${so.branch_id}`;
            const branchCode = branchObj ? branchObj.branch_code : "";

            const customerName = customerMap.get(so.customer_code) || so.customer_code || "-";

            const exceptionsSummary = {
                has_discrepancy: lines.some((l) => l.is_discrepancy),
                has_inconsistent_pick: lines.some((l) => l.is_pick_exceeds_reserve),
                has_substituted_lot: lines.some((l) => l.reservations.some((r) => r.is_substituted_lot && !r.is_added_lot)),
                has_added_lot: lines.some((l) => l.reservations.some((r) => r.is_added_lot)),
                has_excess_allocation: lines.some((l) => l.is_excess_allocation),
                has_excess_consolidation: lines.some((l) => l.is_excess_consolidation),
                has_missing_reservations: lines.some((l) => l.is_missing_reservations),
                has_zero_quantity: lines.some((l) => l.is_zero_quantity),
                is_mixed_uom: isMixedUom,
                is_cancelled: isOrderCancelled,
            };

            assembledItems.push({
                order_id: oId,
                order_no: so.order_no,
                po_no: so.po_no || "N/A",
                customer_code: so.customer_code || "-",
                customer_name: customerName,
                branch_id: Number(so.branch_id),
                branch_name: branchName,
                branch_code: branchCode,
                order_date: so.order_date,
                delivery_date: so.delivery_date,
                order_status: so.order_status,
                stage: orderStage,
                is_cancelled: isOrderCancelled,
                line_count: lines.length,
                uom_summary: uomSummary,
                total_ordered_quantity: totalOrderedQty,
                total_allocated_quantity: totalAllocQty,
                total_stored_allocated_quantity: totalStoredAllocQty,
                total_physical_picked_quantity: totalPickedQty,
                total_approved_consolidation_quantity: totalApprovedConsolQty,
                total_planned_applied_quantity: totalAppliedQty,
                total_remaining_to_allocate: totalRemainingAlloc,
                total_remaining_to_consolidate: totalRemainingConsol,
                allocation_rate: allocRate,
                physical_consolidation_rate: physicalConsolRate,
                planned_consolidation_rate: plannedConsolRate,
                overall_allocation_status: overallAllocStatus,
                overall_consolidation_status: overallConsolStatus,
                exceptions: exceptionsSummary,
                lines,
            });
        }

        // 7. Filtering (Search, Status, Stage, Exceptions)
        let filteredItems = assembledItems;

        if (search) {
            filteredItems = filteredItems.filter(
                (item) =>
                    item.order_no.toLowerCase().includes(search) ||
                    (item.po_no && item.po_no.toLowerCase().includes(search)) ||
                    item.customer_code.toLowerCase().includes(search) ||
                    item.customer_name.toLowerCase().includes(search)
            );
        }

        if (stageFilter !== "All") {
            filteredItems = filteredItems.filter((item) => item.stage === stageFilter);
        }

        if (allocFilter !== "All") {
            filteredItems = filteredItems.filter((item) => item.overall_allocation_status === allocFilter);
        }

        if (consolFilter !== "All") {
            filteredItems = filteredItems.filter((item) => item.overall_consolidation_status === consolFilter);
        }

        if (exceptionsOnly) {
            filteredItems = filteredItems.filter(
                (item) =>
                    item.exceptions.has_discrepancy ||
                    item.exceptions.has_inconsistent_pick ||
                    item.exceptions.has_excess_allocation ||
                    item.exceptions.has_excess_consolidation ||
                    item.exceptions.has_missing_reservations ||
                    item.exceptions.has_zero_quantity ||
                    item.exceptions.is_mixed_uom
            );
        }

        // 8. Compute Quantity-Weighted System Metrics across all matching records
        let grandOrderedQty = 0;
        let grandAllocQty = 0;
        let grandPickedQty = 0;
        let grandAppliedQty = 0;

        let stageAwaitingAllocation = 0;
        let stageReadyForPicking = 0;
        let stageInPicking = 0;
        let stageFullyPicked = 0;

        let fullyAllocCount = 0;
        let partiallyAllocCount = 0;
        let notStartedAllocCount = 0;

        let fullyConsolCount = 0;
        let partiallyConsolCount = 0;
        let notStartedConsolCount = 0;

        let totalDiscrepancies = 0;
        let totalInconsistentPicks = 0;
        let totalExcessAlloc = 0;
        let totalExcessConsol = 0;
        let totalMissingResv = 0;
        let totalZeroQty = 0;
        let totalMixedUom = 0;
        let totalExceptionsCount = 0;

        for (const item of filteredItems) {
            grandOrderedQty += item.total_ordered_quantity;
            grandAllocQty += item.total_allocated_quantity;
            grandPickedQty += item.total_physical_picked_quantity;
            grandAppliedQty += item.total_planned_applied_quantity;

            if (item.stage === "Awaiting Allocation") stageAwaitingAllocation++;
            else if (item.stage === "Ready for Picking") stageReadyForPicking++;
            else if (item.stage === "In Picking") stageInPicking++;
            else if (item.stage === "Fully Picked") stageFullyPicked++;

            if (["Complete", "Excess"].includes(item.overall_allocation_status)) fullyAllocCount++;
            else if (item.overall_allocation_status === "Partial") partiallyAllocCount++;
            else notStartedAllocCount++;

            if (["Complete", "Excess"].includes(item.overall_consolidation_status)) fullyConsolCount++;
            else if (item.overall_consolidation_status === "Partial") partiallyConsolCount++;
            else notStartedConsolCount++;

            if (item.exceptions.has_discrepancy) totalDiscrepancies++;
            if (item.exceptions.has_inconsistent_pick) totalInconsistentPicks++;
            if (item.exceptions.has_excess_allocation) totalExcessAlloc++;
            if (item.exceptions.has_excess_consolidation) totalExcessConsol++;
            if (item.exceptions.has_missing_reservations) totalMissingResv++;
            if (item.exceptions.has_zero_quantity) totalZeroQty++;
            if (item.exceptions.is_mixed_uom) totalMixedUom++;

            const hasAnyEx =
                item.exceptions.has_discrepancy ||
                item.exceptions.has_inconsistent_pick ||
                item.exceptions.has_excess_allocation ||
                item.exceptions.has_excess_consolidation ||
                item.exceptions.has_missing_reservations ||
                item.exceptions.has_zero_quantity ||
                item.exceptions.is_mixed_uom;

            if (hasAnyEx) totalExceptionsCount++;
        }

        const metrics: TrackingMetrics = {
            total_orders: filteredItems.length,
            overall_allocation_rate: grandOrderedQty > 0 ? (grandAllocQty / grandOrderedQty) * 100 : 0,
            overall_physical_consolidation_rate: grandOrderedQty > 0 ? (grandPickedQty / grandOrderedQty) * 100 : 0,
            overall_planned_consolidation_rate: grandOrderedQty > 0 ? (grandAppliedQty / grandOrderedQty) * 100 : 0,
            stage_awaiting_allocation_count: stageAwaitingAllocation,
            stage_ready_for_picking_count: stageReadyForPicking,
            stage_in_picking_count: stageInPicking,
            stage_fully_picked_count: stageFullyPicked,
            fully_allocated_count: fullyAllocCount,
            partially_allocated_count: partiallyAllocCount,
            not_started_allocation_count: notStartedAllocCount,
            fully_consolidated_count: fullyConsolCount,
            partially_consolidated_count: partiallyConsolCount,
            not_started_consolidation_count: notStartedConsolCount,
            total_discrepancies: totalDiscrepancies,
            total_inconsistent_picks: totalInconsistentPicks,
            total_excess_allocations: totalExcessAlloc,
            total_excess_consolidations: totalExcessConsol,
            total_missing_reservations: totalMissingResv,
            total_zero_quantity_lines: totalZeroQty,
            total_mixed_uom_orders: totalMixedUom,
            total_exceptions_count: totalExceptionsCount,
        };

        // 9. Pagination
        const totalCount = filteredItems.length;
        const totalPages = Math.ceil(totalCount / pageSize);
        const paginatedData = filteredItems.slice(page * pageSize, (page + 1) * pageSize);

        return NextResponse.json<TrackingApiResponse>({
            success: true,
            data: paginatedData,
            totalCount,
            page,
            pageSize,
            totalPages,
            metrics,
            branches,
        });
    } catch (err) {
        console.error("[Order Allocation Tracking List API] Error:", err);
        return NextResponse.json(
            { success: false, message: "Internal server error while loading order tracking records" },
            { status: 500 }
        );
    }
}
