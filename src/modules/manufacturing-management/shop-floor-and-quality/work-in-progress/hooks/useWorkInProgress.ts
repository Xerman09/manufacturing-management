"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
    WipFilterState,
    WipMaterialItem,
    WipSummaryMetrics
} from "../types";
import { fetchWipData } from "../services/wip-api";
import { filterWipItems } from "../utils/wip-calculations";

const initialFilters: WipFilterState = {
    jobOrderId: "all",
    branchId: "all",
    materialId: "all",
    status: "all",
    search: "",
    dateFrom: "",
    dateTo: "",
};

const initialMetrics: WipSummaryMetrics = {
    totalActiveJobOrders: 0,
    totalMaterialsTracked: 0,
    totalReservedQuantity: 0,
    totalIssuedQuantity: 0,
    totalConsumedQuantity: 0,
    totalReturnedQuantity: 0,
    totalLossQuantity: 0,
    totalRemainingWipQuantity: 0,
    totalExceptionsCount: 0,
};

export function useWorkInProgress() {
    const [filters, setFilters] = useState<WipFilterState>(initialFilters);
    const [rawItems, setRawItems] = useState<WipMaterialItem[]>([]);
    const [metrics, setMetrics] = useState<WipSummaryMetrics>(initialMetrics);
    const [jobOrderOptions, setJobOrderOptions] = useState<{ id: number; no: string; productName: string; status: string }[]>([]);
    const [branchOptions, setBranchOptions] = useState<{ id: number; name: string; code: string }[]>([]);
    const [materialOptions, setMaterialOptions] = useState<{ id: number; name: string; code: string }[]>([]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Detail modal state
    const [selectedItem, setSelectedItem] = useState<WipMaterialItem | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTab, setModalTab] = useState<"lots" | "consumptions" | "movements">("lots");

    const loadData = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            const response = await fetchWipData(filters);
            setRawItems(response.items || []);
            setMetrics(response.metrics || initialMetrics);
            setJobOrderOptions(response.jobOrderOptions || []);
            setBranchOptions(response.branchOptions || []);
            setMaterialOptions(response.materialOptions || []);

            if (isRefresh) {
                toast.success("WIP tracking inventory updated.");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load WIP tracking data.";
            setError(message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [filters]);

    useEffect(() => {
        loadData(false);
    }, [loadData]);

    const handleFilterChange = useCallback(<K extends keyof WipFilterState>(key: K, value: WipFilterState[K]) => {
        setFilters((prev) => ({
            ...prev,
            [key]: value,
        }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFilters);
    }, []);

    // Local filtering for fast search responses without hitting server on every keystroke
    const filteredItems = useMemo(() => {
        return filterWipItems(rawItems, filters);
    }, [rawItems, filters]);

    const openDetailModal = useCallback((item: WipMaterialItem, initialTab: "lots" | "consumptions" | "movements" = "lots") => {
        setSelectedItem(item);
        setModalTab(initialTab);
        setModalOpen(true);
    }, []);

    const closeDetailModal = useCallback(() => {
        setModalOpen(false);
        setTimeout(() => setSelectedItem(null), 200);
    }, []);

    return {
        filters,
        handleFilterChange,
        resetFilters,
        items: filteredItems,
        totalRawCount: rawItems.length,
        metrics,
        jobOrderOptions,
        branchOptions,
        materialOptions,
        loading,
        refreshing,
        error,
        refresh: () => loadData(true),
        selectedItem,
        modalOpen,
        modalTab,
        setModalTab,
        openDetailModal,
        closeDetailModal,
    };
}
