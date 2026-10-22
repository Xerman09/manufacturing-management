// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/hooks/use-order-allocation-tracking.ts

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    OrderTrackingItem,
    TrackingMetrics,
    BranchOption,
} from "../types";
import {
    fetchOrderTrackingList,
    fetchSingleOrderTracking,
} from "../services/api";

const initialMetrics: TrackingMetrics = {
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

export function useOrderAllocationTracking() {
    const [orders, setOrders] = useState<OrderTrackingItem[]>([]);
    const [metrics, setMetrics] = useState<TrackingMetrics>(initialMetrics);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<number | string>("All");
    const [search, setSearch] = useState("");
    const [stage, setStage] = useState("All");
    const [allocationStatus, setAllocationStatus] = useState("All");
    const [consolidationStatus, setConsolidationStatus] = useState("All");
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(15);
    const [totalPages, setTotalPages] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Modal drill-down state
    const [selectedOrder, setSelectedOrder] = useState<OrderTrackingItem | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isModalLoading, setIsModalLoading] = useState(false);

    const isMounted = useRef(false);

    const loadOrders = useCallback(async (showRefreshing = false) => {
        if (showRefreshing) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            const res = await fetchOrderTrackingList({
                branchId: selectedBranchId,
                search,
                stage,
                allocationStatus,
                consolidationStatus,
                page,
                pageSize,
            });

            if (res.success) {
                setOrders(res.data);
                setTotalCount(res.totalCount);
                setTotalPages(res.totalPages);
                setMetrics(res.metrics);
                setBranches(res.branches);
            }
        } catch {
            // Handled via toast in api.ts
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [selectedBranchId, search, stage, allocationStatus, consolidationStatus, page, pageSize]);

    useEffect(() => {
        isMounted.current = true;
        loadOrders();
        return () => {
            isMounted.current = false;
        };
    }, [loadOrders]);

    const handleSelectOrder = async (order: OrderTrackingItem) => {
        setSelectedOrder(order);
        setIsModalOpen(true);
        setIsModalLoading(true);

        try {
            const freshData = await fetchSingleOrderTracking(order.order_id);
            if (isMounted.current) {
                setSelectedOrder(freshData);
            }
        } catch {
            // fallback to initial item if single fetch fails
        } finally {
            if (isMounted.current) {
                setIsModalLoading(false);
            }
        }
    };

    const handleRefreshSelectedOrder = async () => {
        if (!selectedOrder) return;
        setIsModalLoading(true);
        try {
            const fresh = await fetchSingleOrderTracking(selectedOrder.order_id);
            setSelectedOrder(fresh);
        } catch {
            // error toasted
        } finally {
            setIsModalLoading(false);
        }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedOrder(null);
    };

    return {
        orders,
        metrics,
        branches,
        selectedBranchId,
        setSelectedBranchId: (id: number | string) => {
            setSelectedBranchId(id);
            setPage(0);
        },
        search,
        setSearch: (s: string) => {
            setSearch(s);
            setPage(0);
        },
        stage,
        setStage: (st: string) => {
            setStage(st);
            setPage(0);
        },
        allocationStatus,
        setAllocationStatus: (st: string) => {
            setAllocationStatus(st);
            setPage(0);
        },
        consolidationStatus,
        setConsolidationStatus: (st: string) => {
            setConsolidationStatus(st);
            setPage(0);
        },
        page,
        setPage,
        pageSize,
        setPageSize,
        totalPages,
        totalCount,
        isLoading,
        isRefreshing,
        loadOrders,
        selectedOrder,
        isModalOpen,
        isModalLoading,
        handleSelectOrder,
        handleRefreshSelectedOrder,
        handleCloseModal,
    };
}
