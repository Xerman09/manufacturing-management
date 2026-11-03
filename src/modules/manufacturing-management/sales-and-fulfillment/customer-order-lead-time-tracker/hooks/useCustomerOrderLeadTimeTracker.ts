"use client";

import { useState, useEffect, useCallback } from "react";
import {
    CustomerOrderLeadTimeItem,
    LeadTimeSummaryKPIs,
    BranchOption,
    CustomerOption,
    OrderLifecycleStatus,
} from "../types";
import { leadTimeTrackerService } from "../services/leadTimeTrackerService";

export type PeriodPreset = "all" | "today" | "yesterday" | "7d" | "30d" | "this_month" | "custom";

export function useCustomerOrderLeadTimeTracker() {
    // Data state
    const [orders, setOrders] = useState<CustomerOrderLeadTimeItem[]>([]);
    const [kpis, setKpis] = useState<LeadTimeSummaryKPIs>({
        totalTrackedOrders: 0,
        averageLeadTimeDays: 0,
        openOrdersCount: 0,
        completedOrdersCount: 0,
        flaggedMissingMilestonesCount: 0,
        negativeDurationCount: 0,
    });
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>("");
    const [selectedStatus, setSelectedStatus] = useState<OrderLifecycleStatus | "All">("All");
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodPreset>("all");
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");

    // Pagination
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);
    const [totalOrders, setTotalOrders] = useState<number>(0);

    // Timeline Modal state
    const [isTimelineModalOpen, setIsTimelineModalOpen] = useState<boolean>(false);
    const [selectedOrderForTimeline, setSelectedOrderForTimeline] = useState<CustomerOrderLeadTimeItem | null>(null);

    // Date preset helper
    const handlePeriodChange = useCallback((preset: PeriodPreset) => {
        setSelectedPeriod(preset);
        const now = new Date();

        switch (preset) {
            case "all":
                setStartDate("");
                setEndDate("");
                break;
            case "today": {
                const todayStr = now.toISOString().split("T")[0];
                setStartDate(todayStr);
                setEndDate(todayStr);
                break;
            }
            case "yesterday": {
                const yest = new Date(now);
                yest.setDate(now.getDate() - 1);
                const yestStr = yest.toISOString().split("T")[0];
                setStartDate(yestStr);
                setEndDate(yestStr);
                break;
            }
            case "7d": {
                const from = new Date(now);
                from.setDate(now.getDate() - 7);
                setStartDate(from.toISOString().split("T")[0]);
                setEndDate(now.toISOString().split("T")[0]);
                break;
            }
            case "30d": {
                const from = new Date(now);
                from.setDate(now.getDate() - 30);
                setStartDate(from.toISOString().split("T")[0]);
                setEndDate(now.toISOString().split("T")[0]);
                break;
            }
            case "this_month": {
                const from = new Date(now.getFullYear(), now.getMonth(), 1);
                const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                setStartDate(from.toISOString().split("T")[0]);
                setEndDate(to.toISOString().split("T")[0]);
                break;
            }
            case "custom":
                // keep current dates
                break;
        }
        setPage(1);
    }, []);

    const handleStartDateChange = useCallback((date: string) => {
        setStartDate(date);
        setSelectedPeriod("custom");
        setPage(1);
    }, []);

    const handleEndDateChange = useCallback((date: string) => {
        setEndDate(date);
        setSelectedPeriod("custom");
        setPage(1);
    }, []);

    // Fetch orders
    const fetchLeadTimes = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await leadTimeTrackerService.fetchLeadTimes({
                search: searchQuery,
                branchId: selectedBranchId,
                customerCode: selectedCustomerCode,
                status: selectedStatus,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                page,
                pageSize,
            });

            setOrders(res.data || []);
            setKpis(res.kpis);
            setBranches(res.branches || []);
            setCustomers(res.customers || []);
            setTotalOrders(res.total || 0);
        } catch (err: unknown) {
            console.error("Error fetching lead time tracking data:", err);
            const message = err instanceof Error ? err.message : "Failed to load lead time tracking data.";
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [searchQuery, selectedBranchId, selectedCustomerCode, selectedStatus, startDate, endDate, page, pageSize]);

    useEffect(() => {
        fetchLeadTimes();
    }, [fetchLeadTimes]);

    const [timelineTarget, setTimelineTarget] = useState<string | undefined>();

    // Handle view timeline modal
    const openTimelineModal = (order: CustomerOrderLeadTimeItem, targetPair?: string) => {
        setTimelineTarget(targetPair);
        setSelectedOrderForTimeline(order);
        setIsTimelineModalOpen(true);
    };

    const closeTimelineModal = () => {
        setIsTimelineModalOpen(false);
        setSelectedOrderForTimeline(null);
    };

    // Filter resets
    const resetFilters = () => {
        setSearchQuery("");
        setSelectedBranchId(null);
        setSelectedCustomerCode("");
        setSelectedStatus("All");
        setSelectedPeriod("all");
        setStartDate("");
        setEndDate("");
        setPage(1);
    };

    return {
        // Data & status
        orders,
        kpis,
        branches,
        customers,
        isLoading,
        error,
        refresh: fetchLeadTimes,

        // Filters
        searchQuery,
        setSearchQuery,
        selectedBranchId,
        setSelectedBranchId,
        selectedCustomerCode,
        setSelectedCustomerCode,
        selectedStatus,
        setSelectedStatus,
        selectedPeriod,
        onPeriodChange: handlePeriodChange,
        startDate,
        setStartDate: handleStartDateChange,
        endDate,
        setEndDate: handleEndDateChange,
        resetFilters,

        // Pagination
        page,
        setPage,
        pageSize,
        setPageSize,
        totalOrders,

        // Timeline Modal
        isTimelineModalOpen,
        timelineTarget,
        selectedOrderForTimeline,
        openTimelineModal,
        closeTimelineModal,
    };
}
