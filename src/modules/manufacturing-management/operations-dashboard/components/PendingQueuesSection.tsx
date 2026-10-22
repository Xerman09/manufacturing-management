"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
    ExternalLink,
    Search,
    CheckCircle2,
    Clock,
    FileSpreadsheet,
    AlertCircle,
    ArrowRight,
} from "lucide-react";
import {
    OperationsDashboardData,
    QueueTabKey,
} from "../types/operations-dashboard.types";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

interface PendingQueuesSectionProps {
    data: OperationsDashboardData | null;
    activeTab: QueueTabKey;
    onSelectTab: (tab: QueueTabKey) => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
}

export const PendingQueuesSection: React.FC<PendingQueuesSectionProps> = ({
    data,
    activeTab,
    onSelectTab,
    searchQuery,
    onSearchChange,
}) => {
    const queues = data?.queues;
    const query = searchQuery.trim().toLowerCase();

    // Local pagination state
    const [pageIndex, setPageIndex] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);

    const tabs: Array<{ key: QueueTabKey; label: string; count: number }> = [
        {
            key: "approvals",
            label: "Orders Awaiting Approval",
            count: queues?.ordersAwaitingApproval?.length ?? 0,
        },
        {
            key: "shortages",
            label: "Material Shortages",
            count: queues?.materialShortages?.length ?? 0,
        },
        {
            key: "active_jos",
            label: "Active Job Orders",
            count: queues?.activeJobOrders?.length ?? 0,
        },
        {
            key: "wip",
            label: "Remaining WIP",
            count: queues?.remainingWip?.length ?? 0,
        },
        {
            key: "qa",
            label: "QA Queues",
            count: queues?.pendingQa?.length ?? 0,
        },
        {
            key: "fulfillment",
            label: "Fulfillment Queues",
            count: queues?.fulfillmentQueue?.length ?? 0,
        },
    ];

    // Reset pagination to page 1 on tab or search change
    const handleTabChange = (key: QueueTabKey) => {
        onSelectTab(key);
        setPageIndex(1);
    };

    const handleSearchChange = (q: string) => {
        onSearchChange(q);
        setPageIndex(1);
    };

    // Filtered lists
    const filteredApprovals = useMemo(() => {
        return (queues?.ordersAwaitingApproval || []).filter(
            (o) =>
                !query ||
                o.orderNumber.toLowerCase().includes(query) ||
                o.customerName.toLowerCase().includes(query)
        );
    }, [queues?.ordersAwaitingApproval, query]);

    const filteredShortages = useMemo(() => {
        return (queues?.materialShortages || []).filter(
            (m) =>
                !query ||
                m.componentName.toLowerCase().includes(query) ||
                m.componentCode.toLowerCase().includes(query)
        );
    }, [queues?.materialShortages, query]);

    const filteredJobOrders = useMemo(() => {
        return (queues?.activeJobOrders || []).filter(
            (j) =>
                !query ||
                j.joNumber.toLowerCase().includes(query) ||
                j.productName.toLowerCase().includes(query)
        );
    }, [queues?.activeJobOrders, query]);

    const filteredWip = useMemo(() => {
        return (queues?.remainingWip || []).filter(
            (w) =>
                !query ||
                w.joNumber.toLowerCase().includes(query) ||
                w.productName.toLowerCase().includes(query)
        );
    }, [queues?.remainingWip, query]);

    const filteredQa = useMemo(() => {
        return (queues?.pendingQa || []).filter(
            (q) =>
                !query ||
                q.lotNumber.toLowerCase().includes(query) ||
                q.productName.toLowerCase().includes(query)
        );
    }, [queues?.pendingQa, query]);

    const filteredFulfillment = useMemo(() => {
        return (queues?.fulfillmentQueue || []).filter(
            (f) =>
                !query ||
                f.soNumber.toLowerCase().includes(query) ||
                f.customerName.toLowerCase().includes(query)
        );
    }, [queues?.fulfillmentQueue, query]);

    // Active tab's current total & paginated slice
    const { currentList, currentTotal } = useMemo(() => {
        switch (activeTab) {
            case "approvals":
                return { currentList: filteredApprovals, currentTotal: filteredApprovals.length };
            case "shortages":
                return { currentList: filteredShortages, currentTotal: filteredShortages.length };
            case "active_jos":
                return { currentList: filteredJobOrders, currentTotal: filteredJobOrders.length };
            case "wip":
                return { currentList: filteredWip, currentTotal: filteredWip.length };
            case "qa":
                return { currentList: filteredQa, currentTotal: filteredQa.length };
            case "fulfillment":
                return { currentList: filteredFulfillment, currentTotal: filteredFulfillment.length };
            default:
                return { currentList: [], currentTotal: 0 };
        }
    }, [
        activeTab,
        filteredApprovals,
        filteredShortages,
        filteredJobOrders,
        filteredWip,
        filteredQa,
        filteredFulfillment,
    ]);

    const startIndex = (pageIndex - 1) * pageSize;
    const paginatedItems = currentList.slice(startIndex, startIndex + pageSize);

    return (
        <div className="bg-card border border-border/80 rounded-xl overflow-hidden shadow-xs">
            {/* Header with Searchbar at START (LEFT) followed by Queue Tabs */}
            <div className="flex flex-col lg:flex-row lg:items-center border-b border-border bg-muted/20 px-4 py-2.5 gap-3">
                {/* Searchbar Aligned at Start */}
                <div className="relative w-full lg:w-72 shrink-0">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search current queue..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary h-8"
                    />
                </div>

                {/* Vertical separator on large screens */}
                <div className="hidden lg:block h-5 w-[1px] bg-border shrink-0" />

                {/* Queue Tabs */}
                <div className="flex gap-1 overflow-x-auto shrink-0 pb-1 lg:pb-0 items-center">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => handleTabChange(tab.key)}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-xs"
                                        : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70"
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span
                                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                        isActive
                                            ? "bg-primary-foreground/20 text-primary-foreground"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {tab.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Queue Content Table */}
            <div className="overflow-x-auto min-h-[240px]">
                {/* 1. Orders Awaiting Approval */}
                {activeTab === "approvals" && (
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 border-b border-border/70 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Order #</th>
                                <th className="px-4 py-3">Customer</th>
                                <th className="px-4 py-3">Submitted At</th>
                                <th className="px-4 py-3 text-right">Total Amount</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {(paginatedItems as typeof filteredApprovals).map((order) => (
                                <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-foreground">
                                        {order.orderNumber}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {order.customerName}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {new Date(order.submittedDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                                        ₱{order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                            <Clock className="h-2.5 w-2.5" /> {order.approvalStatus}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={order.actionUrl}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all shadow-xs"
                                        >
                                            Review <ArrowRight className="h-3 w-3" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {filteredApprovals.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                                        No sales orders awaiting approval.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}

                {/* 2. Material Shortages */}
                {activeTab === "shortages" && (
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 border-b border-border/70 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Component / Material</th>
                                <th className="px-4 py-3">SKU Code</th>
                                <th className="px-4 py-3 text-right">On Hand</th>
                                <th className="px-4 py-3 text-right">Threshold</th>
                                <th className="px-4 py-3 text-right">Shortage</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {(paginatedItems as typeof filteredShortages).map((shortage, idx) => (
                                <tr key={idx} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-foreground">
                                        {shortage.componentName}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-muted-foreground">
                                        {shortage.componentCode}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-foreground">
                                        {shortage.onHandQty} {shortage.uom}
                                    </td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">
                                        {shortage.requiredQty} {shortage.uom}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400">
                                        -{shortage.shortageQty} {shortage.uom}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={shortage.actionUrl}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-all shadow-xs"
                                        >
                                            Stage Material <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {filteredShortages.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                                        No component stock shortages detected.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}

                {/* 3. Active Job Orders */}
                {activeTab === "active_jos" && (
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 border-b border-border/70 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Job Order #</th>
                                <th className="px-4 py-3">Finished Good</th>
                                <th className="px-4 py-3">Target Date</th>
                                <th className="px-4 py-3 text-right">Completed / Planned</th>
                                <th className="px-4 py-3">Progress</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {(paginatedItems as typeof filteredJobOrders).map((jo) => (
                                <tr key={jo.joId} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-foreground">
                                        {jo.joNumber}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground font-medium">
                                        {jo.productName}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {jo.targetDueDate
                                            ? new Date(jo.targetDueDate).toLocaleDateString()
                                            : "No target set"}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-foreground">
                                        {jo.completedQuantity} / {jo.quantity}
                                    </td>
                                    <td className="px-4 py-3 w-36">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                                <div
                                                    className="bg-primary h-full rounded-full transition-all"
                                                    style={{ width: `${jo.progressPercentage}%` }}
                                                />
                                            </div>
                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                {jo.progressPercentage}%
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={jo.actionUrl}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all shadow-xs"
                                        >
                                            Track <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {filteredJobOrders.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        <FileSpreadsheet className="h-6 w-6 text-muted-foreground/60 mx-auto mb-1" />
                                        No active job orders currently running.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}

                {/* 4. Remaining WIP */}
                {activeTab === "wip" && (
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 border-b border-border/70 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Task / Ref</th>
                                <th className="px-4 py-3">JO Ref</th>
                                <th className="px-4 py-3">Product</th>
                                <th className="px-4 py-3">Station</th>
                                <th className="px-4 py-3 text-right">Remaining WIP</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {(paginatedItems as typeof filteredWip).map((wip) => (
                                <tr key={wip.taskId} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-foreground">
                                        {wip.taskId}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {wip.joNumber}
                                    </td>
                                    <td className="px-4 py-3 text-foreground font-medium">
                                        {wip.productName}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {wip.stationName}
                                    </td>
                                    <td className="px-4 py-3 text-right font-black text-indigo-600 dark:text-indigo-400">
                                        {wip.wipQuantity.toLocaleString()} units
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={wip.actionUrl}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 transition-all shadow-xs"
                                        >
                                            Terminal <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {filteredWip.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                                        No lingering WIP queued at workstations.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}

                {/* 5. QA Queues */}
                {activeTab === "qa" && (
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 border-b border-border/70 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Lot / Batch #</th>
                                <th className="px-4 py-3">Product Name</th>
                                <th className="px-4 py-3">Inspection Type</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {(paginatedItems as typeof filteredQa).map((qa) => (
                                <tr key={qa.inspectionId} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-foreground">
                                        {qa.lotNumber}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground font-medium">
                                        {qa.productName}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {qa.inspectionType}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                            <AlertCircle className="h-2.5 w-2.5" /> {qa.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={qa.actionUrl}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-500/30 hover:bg-violet-500/20 transition-all shadow-xs"
                                        >
                                            Inspect <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {filteredQa.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                                        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                                        All QA inspections up to date.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}

                {/* 6. Fulfillment Queues */}
                {activeTab === "fulfillment" && (
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 border-b border-border/70 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">SO #</th>
                                <th className="px-4 py-3">Customer</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {(paginatedItems as typeof filteredFulfillment).map((item) => (
                                <tr key={item.fulfillmentId} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-foreground">
                                        {item.soNumber}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground font-medium">
                                        {item.customerName}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 className="h-2.5 w-2.5" /> {item.shippingStatus}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={item.actionUrl}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all shadow-xs"
                                        >
                                            Dispatch <ArrowRight className="h-3 w-3" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {filteredFulfillment.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                                        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
                                        No orders waiting in the dispatch staging queue.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* DataTablePagination Integration */}
            {currentTotal > 0 && (
                <div className="border-t border-border/60 py-2.5 px-4 bg-muted/10">
                    <DataTablePagination
                        pageIndex={pageIndex}
                        pageSize={pageSize}
                        rowCount={currentTotal}
                        onPageChange={setPageIndex}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPageIndex(1);
                        }}
                    />
                </div>
            )}
        </div>
    );
};
