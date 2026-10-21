import { useState, useEffect, useCallback } from "react";
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
    const [items, setItems] = useState<StockProjectionItem[]>([]);
    const [kpis, setKpis] = useState<StockProjectionKpis>(DEFAULT_KPIS);
    const [branches, setBranches] = useState<Array<{ id: number; branch_name: string; branch_code: string }>>([]);
    const [productTypes, setProductTypes] = useState<Array<{ id: number; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<StockProjectionFilters>(DEFAULT_FILTERS);
    const [selectedMaterial, setSelectedMaterial] = useState<StockProjectionItem | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const loadData = useCallback(async (currentFilters: StockProjectionFilters) => {
        setLoading(true);
        try {
            const res = await fetchStockProjections(currentFilters);
            if (res.success) {
                setItems(res.data);
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

    useEffect(() => {
        loadData(filters);
    }, [loadData, filters]);

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
        if (items.length === 0) {
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

        const rows = items.map((i) => [
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
    }, [items]);

    return {
        items,
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
