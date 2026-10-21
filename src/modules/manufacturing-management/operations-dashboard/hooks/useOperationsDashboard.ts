"use client";

import { useState, useEffect, useCallback } from "react";
import {
    OperationsDashboardData,
    PeriodFilter,
    QueueTabKey,
} from "../types/operations-dashboard.types";
import { fetchOperationsDashboard } from "../services/operations-dashboard.service";

export function useOperationsDashboard() {
    const [data, setData] = useState<OperationsDashboardData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("all");
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");

    // Active Queue Tab & Search Query
    const [activeQueueTab, setActiveQueueTab] = useState<QueueTabKey>("approvals");
    const [searchQuery, setSearchQuery] = useState<string>("");

    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

    const loadData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const result = await fetchOperationsDashboard({
                branchId: selectedBranchId,
                startDate: startDate || null,
                endDate: endDate || null,
                period: selectedPeriod,
            });
            setData(result);
            setError(null);
        } catch (err: unknown) {
            console.error("Failed to load operations dashboard:", err);
            const message = err instanceof Error ? err.message : "Failed to load dashboard data";
            setError(message);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [selectedBranchId, startDate, endDate, selectedPeriod]);

    // Initial and filter change trigger
    useEffect(() => {
        loadData();
    }, [loadData]);

    return {
        data,
        loading,
        error,
        isRefreshing,
        selectedBranchId,
        setSelectedBranchId,
        selectedPeriod,
        setSelectedPeriod,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        activeQueueTab,
        setActiveQueueTab,
        searchQuery,
        setSearchQuery,
        refresh: loadData,
    };
}
