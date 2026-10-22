// src/app/api/manufacturing/sales-and-fulfillment/order-allocation-and-consolidation-tracking/[orderId]/route.ts

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

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ orderId: string }> }
) {
    try {
        const { orderId } = await context.params;
        const oId = Number(orderId);

        if (!orderId || isNaN(oId)) {
            return NextResponse.json(
                { success: false, message: "Valid orderId is required" },
                { status: 400 }
            );
        }

        // 1. Fetch Order Header
        const soRes = await fetch(
            `${DIRECTUS_URL}/items/sales_order/${oId}?fields=order_id,order_no,po_no,customer_code,branch_id,order_date,delivery_date,order_status,isCancelled`,
            { headers: directusHeaders, cache: "no-store" }
        );

        if (!soRes.ok) {
            return NextResponse.json(
                { success: false, message: `Sales order #${orderId} not found` },
                { status: 404 }
            );
        }

        const so = (await soRes.json()).data;
        if (!so) {
            return NextResponse.json(
                { success: false, message: `Sales order #${orderId} not found` },
                { status: 404 }
            );
        }

        // 2. Fetch Customer, Branch, Cancellation Request, and Order Lines in parallel
        const [custRes, branchRes, cancelReqRes, sodRes] = await Promise.all([
            so.customer_code
                ? fetch(
                      `${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${encodeURIComponent(
                          so.customer_code
                      )}&limit=1&fields=customer_code,customer_name`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            so.branch_id
                ? fetch(
                      `${DIRECTUS_URL}/items/branches/${so.branch_id}?fields=id,branch_name,branch_code`,
                      { headers: directusHeaders, cache: "no-store" }
                  ).catch(() => null)
                : Promise.resolve(null),
            fetch(
                `${DIRECTUS_URL}/items/sales_order_cancellation_requests?filter[order_id][_eq]=${oId}&filter[request_status][_eq]=Approved&limit=1&fields=order_id,request_status`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[order_id][_eq]=${oId}&limit=-1&fields=detail_id,order_id,product_id,ordered_quantity,allocated_quantity,served_quantity,remarks`,
                { headers: directusHeaders, cache: "no-store" }
            ).catch(() => null),
        ]);

        let customerName = so.customer_code;
        if (custRes && custRes.ok) {
            const custJson = await custRes.json();
            if (custJson.data?.[0]?.customer_name) {
                customerName = custJson.data[0].customer_name;
            }
        }

        let branchName = `Branch #${so.branch_id}`;
        let branchCode = "";
        if (branchRes && branchRes.ok) {
            const bJson = await branchRes.json();
            if (bJson.data?.branch_name) {
                branchName = bJson.data.branch_name;
            }
            if (bJson.data?.branch_code) {
                branchCode = bJson.data.branch_code;
            }
        }

        const isOrderCancelled: boolean =
            Boolean(so.isCancelled) ||
            so.order_status === "Cancelled" ||
            Boolean(cancelReqRes && cancelReqRes.ok && (await cancelReqRes.json()).data?.length > 0);

        const sodRows = sodRes && sodRes.ok ? (await sodRes.json()).data || [] : [];
        const detailIds: number[] = sodRows.map((d: { detail_id: number }) => Number(d.detail_id));
        const productIds: number[] = Array.from(new Set(sodRows.map((d: { product_id: number }) => Number(d.product_id))));

        // 3. Fetch Products, Reservations, and Consolidation Details
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

        // 4. Fetch Parent Consolidation Batches to enforce branch scope and qualifying statuses
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

        // 5. Build Consolidation Batches Map per sales order detail
        const validStatuses = new Set(["Draft", "Pending", "Picking", "Picked", "Approved", "Audited", "Completed"]);
        const consolBatchMap = new Map<number, ConsolidationBatchRef[]>();

        for (const cd of consolidatorDetailRows) {
            const dId = Number(cd.sales_order_detail_id);
            if (!dId) continue;
            const parent = consolidatorMap.get(Number(cd.consolidator_id));
            if (!parent) continue;

            // Enforce deletion filter and status inclusion
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

        // 6. Assemble Line Tracking Data
        const lines: OrderTrackingLineItem[] = [];
        const uomSet = new Set<string>();

        for (const sod of sodRows) {
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

            // Active reservations: status IN ('Reserved', 'Picked', 'Consumed')
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

            // Allocation balances and status
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

            // Consolidation balances and status (based on physical pick)
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

            // Exceptions
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

        const result: OrderTrackingItem = {
            order_id: oId,
            order_no: so.order_no,
            po_no: so.po_no || "N/A",
            customer_code: so.customer_code,
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
        };

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error("[Single Order Allocation Tracking API] Error:", err);
        return NextResponse.json(
            { success: false, message: "Internal server error while loading order detail" },
            { status: 500 }
        );
    }
}
