import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
    StockProjectionItem,
    StockProjectionFilters,
    StockProjectionKpis,
} from "../types";
import {
    fetchStockProjections,
} from "../services/daysToLastProjectionService";

const DEFAULT_FILTERS: StockProjectionFilters = {
    search: "",
    branch_id: "ALL",
    status: "ALL",
    product_type: "ALL",
    assessment_window_months: 3,
    working_days_per_month: 26,
    only_with_available_stock: false,
};

const DEFAULT_KPIS: StockProjectionKpis = {
    critical_supply_count: 0,
    low_supply_count: 0,
    adequate_supply_count: 0,
    insufficient_history_count: 0,
    no_consumption_count: 0,
    total_materials_assessed: 0,
    total_available_stock_units: 0,
};

export function useDaysToLastProjection() {
    const [rawItems, setRawItems] = useState<StockProjectionItem[]>([]);
    const [kpis, setKpis] = useState<StockProjectionKpis>(DEFAULT_KPIS);
    const [branches, setBranches] = useState<Array<{ id: number; branch_name: string; branch_code: string }>>([]);
    const [productTypes, setProductTypes] = useState<Array<{ id: number; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<StockProjectionFilters>(DEFAULT_FILTERS);
    const [selectedMaterial, setSelectedMaterial] = useState<StockProjectionItem | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Fetch from backend when server-side parameters change (branch, window months, working days)
    const loadData = useCallback(async (currentFilters: StockProjectionFilters) => {
        setLoading(true);
        try {
            const res = await fetchStockProjections(currentFilters);
            if (res.success) {
                setRawItems(res.data);
                setKpis(res.kpis);
                if (res.branches?.length) setBranches(res.branches);
                if (res.product_types?.length) setProductTypes(res.product_types);
            } else {
                toast.error("Failed to load stock projections", {
                    description: res.error,
                });
            }
        } catch {
            toast.error("Error connecting to stock projection service");
        } finally {
            setLoading(false);
        }
    }, []);

    const { branch_id, assessment_window_months, working_days_per_month } = filters;
    useEffect(() => {
        loadData({
            ...DEFAULT_FILTERS,
            branch_id,
            assessment_window_months,
            working_days_per_month,
        });
    }, [loadData, branch_id, assessment_window_months, working_days_per_month]);

    // Apply client-side filters instantly without refetching for fast response
    const filteredItems = useMemo(() => {
        return rawItems.filter((item) => {
            // Status filter
            if (filters.status !== "ALL" && item.status !== filters.status) {
                return false;
            }

            // Product type filter (match by name or ID)
            if (filters.product_type !== "ALL") {
                const target = filters.product_type.trim().toLowerCase();
                const itemTypeName = (item.product_type_name || "").trim().toLowerCase();
                const itemTypeIdStr = item.product_type_id ? String(item.product_type_id) : "";

                const matchesName =
                    itemTypeName === target ||
                    itemTypeName.replace(/s$/, "") === target.replace(/s$/, ""); // handle raw material vs raw materials
                const matchesId = itemTypeIdStr === target;

                if (!matchesName && !matchesId) {
                    return false;
                }
            }

            // Search filter (Code, Name, Category)
            if (filters.search.trim()) {
                const q = filters.search.toLowerCase().trim();
                const matches =
                    item.product_name.toLowerCase().includes(q) ||
                    item.product_code.toLowerCase().includes(q) ||
                    (item.category_name && item.category_name.toLowerCase().includes(q));
                if (!matches) return false;
            }

            // Only show with available stock toggle
            if (filters.only_with_available_stock && item.available_stock <= 0) {
                return false;
            }

            return true;
        });
    }, [rawItems, filters.status, filters.product_type, filters.search, filters.only_with_available_stock]);

    const handleFilterChange = useCallback(
        <K extends keyof StockProjectionFilters>(
            key: K,
            value: StockProjectionFilters[K]
        ) => {
            setFilters((prev) => ({
                ...prev,
                [key]: value,
            }));
        },
        []
    );

    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    const handleOpenDrawer = useCallback((item: StockProjectionItem) => {
        setSelectedMaterial(item);
        setIsDrawerOpen(true);
    }, []);

    const handleCloseDrawer = useCallback(() => {
        setIsDrawerOpen(false);
        setSelectedMaterial(null);
    }, []);

    const handleExport = useCallback(() => {
        if (filteredItems.length === 0) {
            toast.warning("No projection data available to export");
            return;
        }

        const headers = [
            "Product Code",
            "Product Name",
            "Category",
            "Branch",
            "Available Stock",
            "UOM",
            "Total Consumed",
            "Assessed Months",
            "Working Days/Mo",
            "MAvg",
            "DAvg",
            "Days To Last",
            "Status",
        ];

        const rows = filteredItems.map((i) => [
            `"${i.product_code}"`,
            `"${i.product_name}"`,
            `"${i.category_name || ""}"`,
            `"${i.branch_name}"`,
            i.available_stock,
            `"${i.unit_shortcut || ""}"`,
            i.total_consumed_quantity,
            i.assessed_months,
            i.working_days_per_month,
            i.m_avg,
            i.d_avg,
            i.days_to_last ?? "N/A",
            `"${i.status}"`,
        ]);

        const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `stock-longevity-projection-${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Stock longevity projection report exported");
    }, [filteredItems]);

    return {
        items: filteredItems,
        totalEvaluatedCount: rawItems.length,
        kpis,
        branches,
        productTypes,
        loading,
        filters,
        selectedMaterial,
        isDrawerOpen,
        handleFilterChange,
        resetFilters,
        handleOpenDrawer,
        handleCloseDrawer,
        handleExport,
        refresh: () => loadData(filters),
    };
}
