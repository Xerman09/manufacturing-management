/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { eligibleDashboardBranches } from "@/modules/manufacturing-management/operations-dashboard/utils/branches";
import { materialStockShortage } from "@/modules/manufacturing-management/operations-dashboard/utils/shortages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNumber(val: any, fallback = 0): number {
    if (val === null || val === undefined || val === "") return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
}

function safeString(val: any, fallback = ""): string {
    if (val === null || val === undefined) return fallback;
    return String(val).trim();
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const branchIdParam = searchParams.get("branchId");

        // 1. Fetch authorized operational branches (excluding bad stock branches)
        let branches;
        try {
            const branchesRes = await fetch(
                `${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code,isActive,isBadStock&filter[isActive][_eq]=1&sort=branch_name,branch_code,id`,
                { headers, cache: "no-store" }
            );
            if (!branchesRes.ok) throw new Error("Branch lookup failed");
            const bData = await branchesRes.json();
            if (!Array.isArray(bData?.data)) throw new Error("Invalid branch lookup response");
            branches = eligibleDashboardBranches(bData.data);
        } catch (e) {
            console.error("[Operations Dashboard] Error fetching branches:", e);
            return NextResponse.json({ error: "Unable to load branches. Retry the dashboard." }, { status: 502 });
        }
        if (branchIdParam && branchIdParam !== "all" && !branches.some(branch => String(branch.id) === branchIdParam)) {
            return NextResponse.json({ error: "This branch is unavailable or inactive. Reset the branch filter to continue." }, { status: 400 });
        }

        // 2. Fetch Work Centers from `manufacturing_work_centers`
        const workCenterMap = new Map<number, string>();
        try {
            const wcRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name,is_active`,
                { headers, cache: "no-store" }
            );
            if (wcRes.ok) {
                const wcData = await wcRes.json();
                const wcList = Array.isArray(wcData?.data) ? wcData.data : [];
                wcList.forEach((wc: any) => {
                    if (wc.work_center_id) {
                        workCenterMap.set(Number(wc.work_center_id), wc.work_center_name || `Work Center #${wc.work_center_id}`);
                    }
                });
            }
        } catch (e) {
            console.error("[Operations Dashboard] Error fetching work centers:", e);
        }

        // 3. Fetch Sales Orders (from official `sales_order` table)
        let salesOrders: any[] = [];
        try {
            const soUrl = new URL(`${DIRECTUS_URL}/items/sales_order`);
            soUrl.searchParams.set("limit", "250");
            soUrl.searchParams.set(
                "fields",
                "order_id,order_no,po_no,customer_code,branch_id,order_status,total_amount,net_amount,order_date,delivery_date,created_date,isCancelled"
            );
            soUrl.searchParams.set("sort", "-created_date");
            if (branchIdParam && branchIdParam !== "all") {
                soUrl.searchParams.set("filter[branch_id][_eq]", branchIdParam);
            }
            const soRes = await fetch(soUrl.toString(), { headers, cache: "no-store" });
            if (soRes.ok) {
                const soData = await soRes.json();
                salesOrders = Array.isArray(soData?.data) ? soData.data : [];
            }
        } catch (e) {
            console.error("[Operations Dashboard] Error fetching sales_order:", e);
        }

        // 4. Resolve Customer Names for Sales Orders
        const customerCodes = Array.from(
            new Set(salesOrders.map((so) => safeString(so.customer_code)).filter(Boolean))
        );
        const customerNameMap = new Map<string, string>();
        if (customerCodes.length > 0) {
            try {
                const custChunks: string[][] = [];
                for (let i = 0; i < customerCodes.length; i += 50) {
                    custChunks.push(customerCodes.slice(i, i + 50));
                }
                await Promise.all(
                    custChunks.map(async (chunk) => {
                        const custRes = await fetch(
                            `${DIRECTUS_URL}/items/customer?filter[customer_code][_in]=${chunk.map((c) => encodeURIComponent(c)).join(",")}&limit=-1&fields=customer_code,customer_name`,
                            { headers, cache: "no-store" }
                        );
                        if (custRes.ok) {
                            const cData = await custRes.json();
                            if (Array.isArray(cData?.data)) {
                                cData.data.forEach((c: any) => {
                                    if (c.customer_code) {
                                        customerNameMap.set(c.customer_code, c.customer_name || c.customer_code);
                                    }
                                });
                            }
                        }
                    })
                );
            } catch (e) {
                console.error("[Operations Dashboard] Error resolving customer names:", e);
            }
        }

        // 5. Fetch Products (for name and SKU matching)
        let products: any[] = [];
        try {
            const prodRes = await fetch(
                `${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,product_type,cost_per_unit,price_per_unit,maintaining_quantity,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut`,
                { headers, cache: "no-store" }
            );
            if (prodRes.ok) {
                const prodData = await prodRes.json();
                products = Array.isArray(prodData?.data) ? prodData.data : [];
            }
        } catch (e) {
            console.error("[Operations Dashboard] Error fetching products:", e);
        }

        const prodMap = new Map<number, any>();
        products.forEach((p) => {
            prodMap.set(safeNumber(p.product_id), p);
        });

        // 6. Fetch Manufacturing Job Orders (from official `manufacturing_job_orders` table)
        let jobOrders: any[] = [];
        try {
            const joUrl = new URL(`${DIRECTUS_URL}/items/manufacturing_job_orders`);
            joUrl.searchParams.set("limit", "250");
            joUrl.searchParams.set(
                "fields",
                "job_order_id,job_order_no,parent_job_order_id,product_id,branch_id,primary_work_center_id,target_quantity,actual_quantity_produced,completed_quantity,rejected_quantity,status,start_date,end_date,created_at,cancelled_at,closed_at"
            );
            joUrl.searchParams.set("sort", "-job_order_id");
            if (branchIdParam && branchIdParam !== "all") {
                joUrl.searchParams.set("filter[branch_id][_eq]", branchIdParam);
            }
            const joRes = await fetch(joUrl.toString(), { headers, cache: "no-store" });
            if (joRes.ok) {
                const joData = await joRes.json();
                jobOrders = Array.isArray(joData?.data) ? joData.data : [];
            }
        } catch (e) {
            console.error("[Operations Dashboard] Error fetching manufacturing_job_orders:", e);
        }

        // 7. Fetch QA Records (from `manufacturing_job_order_qa_records`)
        let qaRecords: any[] = [];
        try {
            const qaRes = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?limit=100&sort=-inspected_at&fields=qa_record_id,job_order_id,is_passed,inspected_at,remarks`,
                { headers, cache: "no-store" }
            );
            if (qaRes.ok) {
                const qData = await qaRes.json();
                qaRecords = Array.isArray(qData?.data) ? qData.data : [];
            }
        } catch (e) {
            console.error("[Operations Dashboard] Error fetching QA records:", e);
        }

        // 8. Fetch Inventory Movements for Stock on Hand calculation
        let movements: any[] = [];
        try {
            const moveUrl = new URL(`${DIRECTUS_URL}/items/inventory_movements`);
            moveUrl.searchParams.set("limit", "-1");
            moveUrl.searchParams.set("fields", "product_id,quantity,branch_id");
            if (branchIdParam && branchIdParam !== "all") {
                moveUrl.searchParams.set("filter[branch_id][_eq]", branchIdParam);
            }
            const moveRes = await fetch(moveUrl.toString(), { headers, cache: "no-store" });
            if (moveRes.ok) {
                const mData = await moveRes.json();
                movements = Array.isArray(mData?.data) ? mData.data : [];
            }
        } catch (e) {
            console.error("[Operations Dashboard] Error fetching inventory movements:", e);
        }

        // Calculate Stock per Product
        const stockMap = new Map<number, number>();
        movements.forEach((m) => {
            const pid = typeof m.product_id === "object" ? m.product_id?.product_id : m.product_id;
            const pNum = safeNumber(pid);
            if (pNum > 0) {
                const cur = stockMap.get(pNum) || 0;
                stockMap.set(pNum, cur + safeNumber(m.quantity));
            }
        });

        // -------------------------------------------------------------
        // Queue 1: Orders Awaiting Approval
        // -------------------------------------------------------------
        const approvalStatuses = ["draft", "pending", "for approval", "for_approval", "submitted"];
        const ordersAwaitingApproval = salesOrders
            .filter((so) => {
                const st = safeString(so.order_status).toLowerCase();
                const isCancelled = so.isCancelled === true || so.isCancelled === 1 || st === "cancelled" || st === "for cancellation";
                return !isCancelled && approvalStatuses.includes(st);
            })
            .map((so) => {
                const custName = customerNameMap.get(so.customer_code) || so.customer_code || "General Customer";
                return {
                    id: so.order_id,
                    orderNumber: so.order_no || `SO-${so.order_id}`,
                    customerName: custName,
                    totalAmount: safeNumber(so.total_amount || so.net_amount),
                    submittedDate: so.created_date || so.order_date || new Date().toISOString(),
                    approvalStatus: so.order_status || "For Approval",
                    branchId: so.branch_id,
                    actionUrl: `/mm/sales-and-fulfillment/sales-order?order_id=${so.order_id}`,
                };
            });

        // -------------------------------------------------------------
        // Queue 2: Active Job Orders & WIP
        // -------------------------------------------------------------
        const activeJobOrdersList: any[] = [];
        const remainingWipList: any[] = [];
        let totalWipQty = 0;

        const terminalStatuses = ["closed", "cancelled", "completed", "voided", "finished"];

        jobOrders.forEach((jo) => {
            const st = safeString(jo.status).toLowerCase();
            const isClosed = terminalStatuses.includes(st) || jo.closed_at || jo.cancelled_at;
            if (isClosed) return;

            const targetQty = safeNumber(jo.target_quantity, 1);
            const compQty = safeNumber(jo.completed_quantity || jo.actual_quantity_produced, 0);
            const remaining = Math.max(0, targetQty - compQty);
            const pct = Math.min(100, Math.round((compQty / (targetQty || 1)) * 100));

            const prod = prodMap.get(safeNumber(jo.product_id));
            const prodName = prod?.product_name || `Product #${jo.product_id}`;

            // Resolve actual work center name from manufacturing_work_centers
            const wcName = workCenterMap.get(safeNumber(jo.primary_work_center_id)) || "General Assembly";

            activeJobOrdersList.push({
                joId: jo.job_order_id,
                joNumber: jo.job_order_no || `JO-${jo.job_order_id}`,
                productName: prodName,
                quantity: targetQty,
                completedQuantity: compQty,
                progressPercentage: pct,
                currentStation: wcName,
                targetDueDate: jo.end_date || jo.start_date || null,
                status: jo.status || "In Progress",
                actionUrl: `/mm/planning-engineering?jo_id=${jo.job_order_id}`,
            });

            if (remaining > 0) {
                totalWipQty += remaining;
                remainingWipList.push({
                    taskId: `WIP-${jo.job_order_id}`,
                    joNumber: jo.job_order_no || `JO-${jo.job_order_id}`,
                    productName: prodName,
                    stationName: wcName,
                    wipQuantity: remaining,
                    lastMovement: jo.created_at || new Date().toISOString(),
                    status: jo.status || "In Progress",
                    actionUrl: `/mm/shop-floor-and-quality/work-in-progress?jo_id=${jo.job_order_id}`,
                });
            }
        });

        // -------------------------------------------------------------
        // Queue 3: Material Shortages
        // -------------------------------------------------------------
        const materialShortagesList: any[] = [];
        products.forEach((prod) => {
            const pid = safeNumber(prod.product_id);
            const onHand = stockMap.get(pid) || 0;
            const shortage = materialStockShortage(prod.maintaining_quantity, onHand);
            if (shortage) {
                materialShortagesList.push({
                    joId: `SHORTAGE-${pid}`,
                    joNumber: "Stock Alert",
                    productName: prod.product_name || `SKU-${pid}`,
                    componentName: prod.product_name || `SKU-${pid}`,
                    componentCode: prod.product_code || `SKU-${pid}`,
                    requiredQty: shortage.requiredQty,
                    onHandQty: onHand,
                    shortageQty: shortage.shortageQty,
                    uom: safeString(prod.unit_of_measurement?.unit_shortcut) || safeString(prod.unit_of_measurement?.unit_name) || "UOM unavailable",
                    actionUrl: `/mm/material-staging`,
                });
            }
        });

        // -------------------------------------------------------------
        // Queue 4: QA Inspection Backlog
        // -------------------------------------------------------------
        const pendingQaList: any[] = [];
        jobOrders.forEach((jo) => {
            const st = safeString(jo.status).toLowerCase();
            if (st.includes("qa") || st.includes("inspect") || st.includes("hold")) {
                const prod = prodMap.get(safeNumber(jo.product_id));
                pendingQaList.push({
                    inspectionId: jo.job_order_id,
                    lotNumber: jo.job_order_no || `JO-${jo.job_order_id}`,
                    productName: prod?.product_name || `Product #${jo.product_id}`,
                    inspectionType: "In-Process / Final QA",
                    quantity: safeNumber(jo.target_quantity, 1),
                    submissionDate: jo.created_at || new Date().toISOString(),
                    status: jo.status || "QA Verification",
                    actionUrl: `/mm/shop-floor-and-quality/qa-receiving-inspections?jo_id=${jo.job_order_id}`,
                });
            }
        });

        // Include any failed QA inspection records
        qaRecords.forEach((qr) => {
            if (qr.is_passed === false || qr.is_passed === 0) {
                pendingQaList.push({
                    inspectionId: qr.qa_record_id,
                    lotNumber: `QA-REC-${qr.qa_record_id}`,
                    productName: `Job Order #${qr.job_order_id}`,
                    inspectionType: "Step QA Check",
                    quantity: 1,
                    submissionDate: qr.inspected_at || new Date().toISOString(),
                    status: "QA Non-Conformance",
                    actionUrl: `/mm/shop-floor-and-quality/qa-receiving-inspections?qa_record_id=${qr.qa_record_id}`,
                });
            }
        });

        // -------------------------------------------------------------
        // Queue 5: Fulfillment / Ready to Dispatch
        // -------------------------------------------------------------
        const fulfillmentStatuses = [
            "for loading",
            "for shipping",
            "en route",
            "dispatched",
            "for picking",
            "for invoicing",
            "partially delivered",
            "in production",
        ];
        const fulfillmentList = salesOrders
            .filter((so) => {
                const st = safeString(so.order_status).toLowerCase();
                const isCancelled = so.isCancelled === true || so.isCancelled === 1 || st === "cancelled";
                return !isCancelled && fulfillmentStatuses.includes(st);
            })
            .map((so) => {
                const custName = customerNameMap.get(so.customer_code) || so.customer_code || "General Customer";
                return {
                    fulfillmentId: so.order_id,
                    soNumber: so.order_no || `SO-${so.order_id}`,
                    customerName: custName,
                    quantity: 1,
                    readySince: so.delivery_date || so.order_date || so.created_date || new Date().toISOString(),
                    shippingStatus: so.order_status || "In Fulfillment",
                    actionUrl: `/mm/sales-and-fulfillment/sales-order-fulfillment?order_id=${so.order_id}`,
                };
            });

        // -------------------------------------------------------------
        // Exceptions Engine
        // -------------------------------------------------------------
        const exceptions: any[] = [];
        const now = new Date().getTime();

        // 1. Overdue Production
        activeJobOrdersList.forEach((jo) => {
            if (jo.targetDueDate) {
                const dueTime = new Date(jo.targetDueDate).getTime();
                if (!isNaN(dueTime) && dueTime < now) {
                    exceptions.push({
                        id: `EXC-JO-${jo.joId}`,
                        title: `Overdue Production: ${jo.joNumber}`,
                        description: `Job order for ${jo.productName} is past due date (${new Date(jo.targetDueDate).toLocaleDateString()}) with ${jo.quantity - jo.completedQuantity} units pending.`,
                        sourceModule: "Job Orders",
                        referenceNumber: jo.joNumber,
                        severity: "CRITICAL",
                        occurredAt: jo.targetDueDate,
                        actionUrl: jo.actionUrl,
                        actionLabel: "Open Job Order",
                    });
                }
            }
        });

        // 2. Critical Stock Shortages (Negative on-hand or zero)
        materialShortagesList
            .filter((item) => item.onHandQty <= 0)
            .slice(0, 20)
            .forEach((item, idx) => {
                exceptions.push({
                    id: `EXC-MAT-${idx}`,
                    title: `Critical Stockout: ${item.componentName}`,
                    description: item.requiredQty === null
                        ? `Current on-hand stock is ${item.onHandQty} ${item.uom}. Maintaining quantity is not set; shortage is not calculated. Configure maintaining quantity and investigate negative stock.`
                        : `Current on-hand stock is ${item.onHandQty} ${item.uom}. Configured maintaining quantity is ${item.requiredQty} ${item.uom}; shortage is ${item.shortageQty} ${item.uom}.`,
                    sourceModule: "Material Staging",
                    referenceNumber: item.componentCode,
                    severity: "WARNING",
                    occurredAt: new Date().toISOString(),
                    actionUrl: item.actionUrl,
                    actionLabel: "View Material Staging",
                });
            });

        // 3. QA Holds / Non-conformance
        pendingQaList.slice(0, 15).forEach((qa) => {
            exceptions.push({
                id: `EXC-QA-${qa.inspectionId}`,
                title: `QA Verification Required: ${qa.lotNumber}`,
                description: `${qa.productName} is in ${qa.status} status awaiting quality signoff.`,
                sourceModule: "Manufacturing QA",
                referenceNumber: qa.lotNumber,
                severity: "INFO",
                occurredAt: qa.submissionDate,
                actionUrl: qa.actionUrl,
                actionLabel: "Review QA",
            });
        });

        const totals = {
            ordersAwaitingApproval: ordersAwaitingApproval.length,
            materialShortages: materialShortagesList.length,
            activeJobOrders: activeJobOrdersList.length,
            activeWipJobs: remainingWipList.length, // Queue task count for donut chart
            remainingWipQuantity: totalWipQty,     // Physical piece count for KPI card
            pendingQaInspections: pendingQaList.length,
            readyForFulfillment: fulfillmentList.length,
        };

        const nowFormatted = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });

        return NextResponse.json({
            refreshTime: nowFormatted,
            totals,
            branches,
            queues: {
                ordersAwaitingApproval,
                materialShortages: materialShortagesList,
                activeJobOrders: activeJobOrdersList,
                remainingWip: remainingWipList,
                pendingQa: pendingQaList,
                fulfillmentQueue: fulfillmentList,
            },
            exceptions,
        });
    } catch (error: any) {
        console.error("[Operations Dashboard API Error]:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to process operations dashboard query." },
            { status: 500 }
        );
    }
}
