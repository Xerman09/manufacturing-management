import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { LifecycleMilestone, MilestoneStage, StageDuration } from "@/modules/manufacturing-management/sales-and-fulfillment/customer-order-lead-time-tracker/types";

interface RawSalesOrder {
    order_id: number;
    order_no: string;
    po_no: string;
    customer_code: string;
    branch_id: number;
    order_date: string;
    delivery_date: string | null;
    order_status: string;
    created_date: string | null;
    draft_at: string | null;
    pending_date: string | null;
    for_approval_at: string | null;
    for_consolidation_at: string | null;
    for_production_at: string | null;
    for_picking_at: string | null;
    for_invoicing_at: string | null;
    for_loading_at: string | null;
    for_shipping_at: string | null;
    en_route_at: string | null;
    delivered_at: string | null;
    on_hold_at: string | null;
    cancelled_at: string | null;
    not_fulfilled_at: string | null;
    isDelivered: boolean | number | null;
    isCancelled: boolean | number | null;
}

interface RawBranch {
    id: number | string;
    branch_name: string;
    branch_code: string;
}

interface RawCustomer {
    id: number | string;
    customer_code: string;
    customer_name: string;
}

interface RawSalesInvoice {
    invoice_id: number;
    order_id: string | number;
    invoice_no: string;
    invoice_date: string | null;
    dispatch_date: string | null;
    created_date: string | null;
    transaction_status: string;
}

function formatHumanDuration(hours: number): string {
    if (isNaN(hours) || hours === null || hours === undefined) return "0m";
    const isNeg = hours < 0;
    const totalSeconds = Math.round(Math.abs(hours) * 3600);

    const days = Math.floor(totalSeconds / 86400);
    const remSecondsAfterDays = totalSeconds % 86400;
    const remHours = Math.floor(remSecondsAfterDays / 3600);
    const remMinutes = Math.floor((remSecondsAfterDays % 3600) / 60);
    const remSeconds = remSecondsAfterDays % 60;

    let formatted = "";
    if (days > 0) {
        formatted = remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
    } else if (remHours > 0) {
        formatted = remMinutes > 0 ? `${remHours}h ${remMinutes}m` : `${remHours}h`;
    } else if (remMinutes > 0) {
        formatted = `${remMinutes}m`;
    } else {
        formatted = `${remSeconds}s`;
    }

    return isNeg ? `-${formatted}` : formatted;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const branchIdParam = searchParams.get("branchId");
        const customerCodeParam = (searchParams.get("customerCode") || "").trim();
        const statusParam = searchParams.get("status") || "All";
        const startDateParam = searchParams.get("startDate");
        const endDateParam = searchParams.get("endDate");
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));

        const now = new Date();

        // 1. Fetch Sales Orders concurrently with master tables
        const [ordersRes, branchesRes, customersRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/sales_order?limit=250&sort=-order_id&fields=order_id,order_no,po_no,customer_code,branch_id,order_date,delivery_date,order_status,created_date,draft_at,pending_date,for_approval_at,for_consolidation_at,for_production_at,for_picking_at,for_invoicing_at,for_loading_at,for_shipping_at,en_route_at,delivered_at,on_hold_at,cancelled_at,not_fulfilled_at,isDelivered,isCancelled`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/customer?limit=-1&fields=id,customer_code,customer_name`, {
                headers,
                cache: "no-store",
            }).catch(() => null),
        ]);

        const rawOrders: RawSalesOrder[] = ordersRes && ordersRes.ok ? (await ordersRes.json()).data || [] : [];
        const rawBranches: RawBranch[] = branchesRes && branchesRes.ok ? (await branchesRes.json()).data || [] : [];
        const rawCustomers: RawCustomer[] = customersRes && customersRes.ok ? (await customersRes.json()).data || [] : [];

        // Build lookup maps
        const branchMap = new Map<number, { name: string; code: string }>();
        for (const b of rawBranches) {
            branchMap.set(Number(b.id), { name: b.branch_name || "Unknown Branch", code: b.branch_code || "" });
        }

        const customerMap = new Map<string, string>();
        for (const c of rawCustomers) {
            if (c.customer_code) {
                customerMap.set(String(c.customer_code), c.customer_name || String(c.customer_code));
            }
        }

        // Candidate order IDs for deep milestone lookup
        const orderIds = rawOrders.map((o) => o.order_id);

        // 2. Fetch linked Sales Invoices
        let invoices: RawSalesInvoice[] = [];

        if (orderIds.length > 0) {
            const invRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[order_id][_in]=${orderIds.slice(0, 100).join(",")}&fields=invoice_id,order_id,invoice_no,invoice_date,dispatch_date,created_date,transaction_status&limit=-1`, {
                headers,
                cache: "no-store",
            }).catch(() => null);

            if (invRes && invRes.ok) {
                invoices = (await invRes.json()).data || [];
            }
        }

        // Map invoices to order_id
        const orderInvoicesMap = new Map<string, RawSalesInvoice[]>();
        for (const inv of invoices) {
            const key = String(inv.order_id);
            if (!orderInvoicesMap.has(key)) orderInvoicesMap.set(key, []);
            orderInvoicesMap.get(key)!.push(inv);
        }

        // 3. Process each order and construct milestone timeline
        const processedItems = rawOrders.map((order) => {
            const orderIdStr = String(order.order_id);
            const branch = branchMap.get(Number(order.branch_id));
            const customerName = customerMap.get(order.customer_code) || order.customer_code || "Unknown Customer";

            // Timestamps
            const creationTimeStr = order.created_date || (order.order_date ? `${order.order_date}T00:00:00Z` : order.draft_at);
            const creationTime = creationTimeStr ? new Date(creationTimeStr) : new Date();

            const forApprovalTimeStr = order.for_approval_at;
            const approvalTimeStr = order.for_consolidation_at;
            const consolidationTimeStr = order.for_picking_at || order.for_production_at;
            const pickingTimeStr = order.for_invoicing_at || order.for_loading_at;

            // Invoicing timestamp from linked invoices or sales_order column
            const linkedInvoices = orderInvoicesMap.get(orderIdStr) || [];
            const earliestInvoice = [...linkedInvoices].sort((a, b) => {
                const dateA = a.created_date || a.invoice_date || 0;
                const dateB = b.created_date || b.invoice_date || 0;
                return new Date(dateA).getTime() - new Date(dateB).getTime();
            })[0];
            const invoicingTimeStr = earliestInvoice?.created_date || earliestInvoice?.invoice_date || order.for_shipping_at;
            const dispatchTimeStr = earliestInvoice?.dispatch_date || order.en_route_at;

            const isCompleted = order.order_status === "Delivered" || Boolean(order.isDelivered) || Boolean(order.delivered_at);
            const isCancelled = order.order_status === "Cancelled" || Boolean(order.isCancelled) || Boolean(order.cancelled_at);
            const isPartial = order.order_status === "Partially Delivered";

            // Delivery timestamp with fallbacks for delivered orders
            const finalDeliveryTimeStr =
                order.delivered_at ||
                (isCompleted ? order.en_route_at || earliestInvoice?.dispatch_date : null);

            // First delivery estimation from dispatch stop or early milestone
            const firstDeliveryTimeStr = isPartial || isCompleted ? (finalDeliveryTimeStr || dispatchTimeStr) : null;

            // Calculate overall duration
            let totalLeadTimeHours: number | null = null;
            let totalLeadTimeFormatted: string | null = null;
            let ongoingAgeHours: number | null = null;
            let ongoingAgeFormatted: string | null = null;

            if (isCompleted && (finalDeliveryTimeStr || creationTimeStr)) {
                const deliveryTimeMs = finalDeliveryTimeStr ? new Date(finalDeliveryTimeStr).getTime() : now.getTime();
                const diffMs = deliveryTimeMs - creationTime.getTime();
                totalLeadTimeHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
                totalLeadTimeFormatted = formatHumanDuration(totalLeadTimeHours);
            } else if (!isCancelled) {
                const diffMs = now.getTime() - creationTime.getTime();
                ongoingAgeHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
                ongoingAgeFormatted = formatHumanDuration(ongoingAgeHours);
            }

            // Build Milestones Sequence
            const milestones: LifecycleMilestone[] = [
                {
                    id: `m-create-${order.order_id}`,
                    stage: "ORDER_CREATED",
                    stageName: "Order Created",
                    timestamp: creationTimeStr,
                    status: "Completed",
                    referenceDocumentNo: order.order_no,
                    referenceModule: "Sales Order",
                },
                {
                    id: `m-submit-${order.order_id}`,
                    stage: "FOR_APPROVAL",
                    stageName: "Submitted for Approval",
                    timestamp: forApprovalTimeStr,
                    status: forApprovalTimeStr ? "Completed" : (isCompleted ? "Skipped" : "Pending"),
                    referenceDocumentNo: order.order_no,
                    referenceModule: "Sales Order",
                },
                {
                    id: `m-appr-${order.order_id}`,
                    stage: "APPROVED_FOR_CONSOLIDATION",
                    stageName: "Approved for Fulfillment",
                    timestamp: approvalTimeStr,
                    status: approvalTimeStr ? "Completed" : (isCompleted ? "Skipped" : "Pending"),
                    referenceDocumentNo: order.order_no,
                    referenceModule: "Sales Order",
                },
                {
                    id: `m-cons-${order.order_id}`,
                    stage: "CONSOLIDATION_PLANNED",
                    stageName: "Consolidation Planned",
                    timestamp: consolidationTimeStr,
                    status: consolidationTimeStr ? "Completed" : (isCompleted ? "Skipped" : "Pending"),
                    referenceDocumentNo: order.order_no,
                    referenceModule: "Consolidation",
                },
                {
                    id: `m-pick-${order.order_id}`,
                    stage: "PICKING_COMPLETED",
                    stageName: "Picking Completed",
                    timestamp: pickingTimeStr,
                    status: pickingTimeStr ? "Completed" : (isCompleted ? "Skipped" : "Pending"),
                    referenceDocumentNo: order.order_no,
                    referenceModule: "Picking & Staging",
                },
                {
                    id: `m-inv-${order.order_id}`,
                    stage: "INVOICED",
                    stageName: "Invoiced",
                    timestamp: invoicingTimeStr,
                    status: invoicingTimeStr ? "Completed" : (isCompleted ? "Skipped" : "Pending"),
                    referenceDocumentNo: earliestInvoice?.invoice_no || undefined,
                    referenceModule: "Invoicing",
                },
                {
                    id: `m-disp-${order.order_id}`,
                    stage: "DISPATCHED",
                    stageName: "Dispatched",
                    timestamp: dispatchTimeStr,
                    status: dispatchTimeStr ? "Completed" : (isCompleted ? "Skipped" : "Pending"),
                    referenceDocumentNo: earliestInvoice?.invoice_no || undefined,
                    referenceModule: "Logistics Dispatch",
                },
                {
                    id: `m-first-${order.order_id}`,
                    stage: "FIRST_DELIVERY",
                    stageName: "First Delivery Drop",
                    timestamp: firstDeliveryTimeStr,
                    status: firstDeliveryTimeStr ? "Completed" : (isCompleted ? "Completed" : "Pending"),
                    referenceDocumentNo: earliestInvoice?.invoice_no || undefined,
                    referenceModule: "Fulfillment & Deliveries",
                },
                {
                    id: `m-deliv-${order.order_id}`,
                    stage: "FINAL_DELIVERY",
                    stageName: "Final Delivery Confirmation",
                    timestamp: finalDeliveryTimeStr,
                    status: isCompleted ? "Completed" : "Pending",
                    referenceDocumentNo: order.order_no,
                    referenceModule: "Customer Sign-off",
                },
            ];

            // Build Stage Durations & Anomaly detection
            const stages: StageDuration[] = [];
            const missingMilestonesList: string[] = [];
            let hasNegativeDurations = false;

            for (let i = 0; i < milestones.length - 1; i++) {
                const curr = milestones[i];
                const next = milestones[i + 1];

                if (curr.timestamp && next.timestamp) {
                    const fromT = new Date(curr.timestamp).getTime();
                    const toT = new Date(next.timestamp).getTime();
                    const diffHours = (toT - fromT) / (1000 * 60 * 60);
                    const isNeg = diffHours < 0;
                    if (isNeg) hasNegativeDurations = true;

                    stages.push({
                        fromStage: curr.stage,
                        toStage: next.stage,
                        stageLabel: `${curr.stageName} → ${next.stageName}`,
                        durationHours: Math.round(diffHours * 10) / 10,
                        durationFormatted: formatHumanDuration(diffHours),
                        isNegative: isNeg,
                        isDelayed: diffHours > 48,
                    });
                } else if (isCompleted && !curr.timestamp) {
                    missingMilestonesList.push(curr.stageName);
                }
            }

            // Determine reporting status
            let reportingStatus: "Open" | "Completed" | "Cancelled" | "Missing Milestone" = "Open";
            if (isCancelled) {
                reportingStatus = "Cancelled";
            } else if (isCompleted) {
                reportingStatus = "Completed";
            } else if (missingMilestonesList.length > 0) {
                reportingStatus = "Missing Milestone";
            }

            // Determine current active stage
            let currentStage: MilestoneStage = "ORDER_CREATED";
            let currentStageLabel = "Order Created";
            for (let i = milestones.length - 1; i >= 0; i--) {
                if (milestones[i].timestamp) {
                    currentStage = milestones[i].stage;
                    currentStageLabel = milestones[i].stageName;
                    break;
                }
            }

            return {
                orderId: order.order_id,
                orderNo: order.order_no,
                poNo: order.po_no,
                customerCode: order.customer_code,
                customerName,
                branchId: order.branch_id,
                branchName: branch?.name || `Branch #${order.branch_id}`,
                branchCode: branch?.code || "",
                orderDate: order.order_date,
                promisedDate: order.delivery_date,
                transactionStatus: order.order_status,
                reportingStatus,

                creationTimestamp: creationTimeStr || "",
                forApprovalTimestamp: forApprovalTimeStr,
                approvalTimestamp: approvalTimeStr,
                consolidationTimestamp: consolidationTimeStr,
                pickingTimestamp: pickingTimeStr,
                invoicingTimestamp: invoicingTimeStr,
                dispatchTimestamp: dispatchTimeStr,
                firstDeliveryTimestamp: firstDeliveryTimeStr,
                finalDeliveryTimestamp: finalDeliveryTimeStr,

                totalLeadTimeHours,
                totalLeadTimeFormatted,
                ongoingAgeHours,
                ongoingAgeFormatted,

                currentStage,
                currentStageLabel,
                hasMissingMilestones: missingMilestonesList.length > 0,
                missingMilestonesList,
                hasNegativeDurations,
                isPartialDelivery: isPartial,

                stages,
                milestones,
            };
        });

        // 4. Filtering
        let filtered = processedItems;

        if (search) {
            filtered = filtered.filter(
                (item) =>
                    item.orderNo?.toLowerCase().includes(search) ||
                    item.poNo?.toLowerCase().includes(search) ||
                    item.customerName?.toLowerCase().includes(search) ||
                    item.customerCode?.toLowerCase().includes(search)
            );
        }

        if (branchIdParam && branchIdParam !== "all") {
            const bId = Number(branchIdParam);
            if (!isNaN(bId) && bId > 0) {
                filtered = filtered.filter((item) => Number(item.branchId) === bId);
            }
        }

        if (customerCodeParam && customerCodeParam !== "all") {
            filtered = filtered.filter((item) => item.customerCode === customerCodeParam);
        }

        if (statusParam && statusParam !== "All") {
            if (statusParam === "Completed") {
                filtered = filtered.filter((item) => item.reportingStatus === "Completed");
            } else if (statusParam === "Missing Milestone") {
                filtered = filtered.filter((item) => item.hasMissingMilestones || item.reportingStatus === "Missing Milestone");
            } else {
                filtered = filtered.filter((item) => item.reportingStatus === statusParam);
            }
        }

        if (startDateParam) {
            const start = new Date(startDateParam).getTime();
            filtered = filtered.filter((item) => new Date(item.creationTimestamp).getTime() >= start);
        }
        if (endDateParam) {
            const end = new Date(endDateParam).getTime() + 86400000;
            filtered = filtered.filter((item) => new Date(item.creationTimestamp).getTime() <= end);
        }

        // 5. Aggregate KPIs
        const totalTrackedOrders = processedItems.length;
        const completedOrders = processedItems.filter((i) => i.reportingStatus === "Completed");
        const openOrders = processedItems.filter((i) => i.reportingStatus === "Open");
        const missingMilestoneOrders = processedItems.filter((i) => i.hasMissingMilestones || i.reportingStatus === "Missing Milestone");
        const negativeOrders = processedItems.filter((i) => i.hasNegativeDurations);

        const totalCompletedHours = completedOrders.reduce((sum, item) => sum + (item.totalLeadTimeHours || 0), 0);
        const averageLeadTimeDays =
            completedOrders.length > 0 ? Math.round((totalCompletedHours / completedOrders.length / 24) * 10) / 10 : 0;

        const kpis = {
            totalTrackedOrders,
            averageLeadTimeDays,
            openOrdersCount: openOrders.length,
            completedOrdersCount: completedOrders.length,
            flaggedMissingMilestonesCount: missingMilestoneOrders.length,
            negativeDurationCount: negativeOrders.length,
        };

        // 6. Pagination
        const total = filtered.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        const startIndex = (page - 1) * pageSize;
        const paginatedData = filtered.slice(startIndex, startIndex + pageSize);

        // Branch and customer select options
        const branches = rawBranches.map((b) => ({
            id: Number(b.id),
            branch_name: b.branch_name,
            branch_code: b.branch_code,
        }));

        const customers = Array.from(customerMap.entries()).map(([customer_code, customer_name]) => ({
            customer_code,
            customer_name,
        }));

        return NextResponse.json({
            data: paginatedData,
            kpis,
            branches,
            customers,
            total,
            page,
            pageSize,
            totalPages,
        });
    } catch (err: unknown) {
        console.error("[Customer Order Lead Time Tracker API Error]:", err);
        const details = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
            { error: "Internal server error fetching customer order lead time data", details },
            { status: 500 }
        );
    }
}
