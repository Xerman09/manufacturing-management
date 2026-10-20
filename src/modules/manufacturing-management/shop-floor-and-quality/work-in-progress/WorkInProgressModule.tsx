"use client";

import { useCallback } from "react";
import { Download, Factory, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useWorkInProgress } from "./hooks/useWorkInProgress";
import WipSummaryCards from "./components/WipSummaryCards";
import WipFilters from "./components/WipFilters";
import WipTable from "./components/WipTable";
import WipDetailModal from "./components/WipDetailModal";

export default function WorkInProgressModule() {
    const {
        filters,
        handleFilterChange,
        resetFilters,
        items,
        metrics,
        jobOrderOptions,
        branchOptions,
        materialOptions,
        loading,
        refreshing,
        refresh,
        selectedItem,
        modalOpen,
        modalTab,
        setModalTab,
        openDetailModal,
        closeDetailModal,
    } = useWorkInProgress();

    const handleExportCsv = useCallback(() => {
        if (items.length === 0) {
            toast.info("No records to export.");
            return;
        }

        try {
            const headers = [
                "Job Order No",
                "Job Order Status",
                "Target Product",
                "Material Code",
                "Material Name",
                "UOM",
                "Branch",
                "Reserved Quantity",
                "Issued to Floor Quantity",
                "Consumed Quantity",
                "Returned Quantity",
                "Loss/Scrap Quantity",
                "Net Remaining Floor WIP",
                "Status",
            ];

            const rows = items.map((i) => [
                `"${i.jobOrderNo || ""}"`,
                `"${i.jobOrderStatus || ""}"`,
                `"${(i.targetProductName || "").replace(/"/g, '""')}"`,
                `"${i.materialCode || ""}"`,
                `"${(i.materialName || "").replace(/"/g, '""')}"`,
                `"${i.uomShortcut || ""}"`,
                `"${(i.branchName || "").replace(/"/g, '""')}"`,
                i.reservedQuantity,
                i.issuedQuantity,
                i.consumedQuantity,
                i.returnedQuantity,
                i.lossQuantity,
                i.remainingWipQuantity,
                `"${i.status}"`,
            ]);

            const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `WIP_Tracking_Report_${new Date().toISOString().split("T")[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success(`Exported ${items.length} WIP records to CSV.`);
        } catch (err) {
            console.error("Export error:", err);
            toast.error("Failed to generate CSV export.");
        }
    }, [items]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                            <Factory className="h-5 w-5" />
                        </span>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            Work In Progress (WIP)
                        </h1>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Live floor material balance: track committed Job Orders, separate warehouse reservations from floor issues, and audit consumption.
                    </p>
                </div>

                {/* Header CTA Buttons */}
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportCsv}
                        disabled={loading || items.length === 0}
                        className="h-8 text-xs gap-1.5 shadow-xs"
                    >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export CSV</span>
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={refresh}
                        disabled={loading || refreshing}
                        className="h-8 text-xs gap-1.5 shadow-xs"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
                    </Button>
                </div>
            </div>

            {/* KPI Summary Cards */}
            <WipSummaryCards metrics={metrics} loading={loading} />

            {/* Filter Bar */}
            <WipFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onReset={resetFilters}
                jobOrderOptions={jobOrderOptions}
                branchOptions={branchOptions}
                materialOptions={materialOptions}
                totalResults={items.length}
            />

            {/* Main WIP Data Grid */}
            <WipTable
                items={items}
                loading={loading}
                onViewDetail={openDetailModal}
            />

            {/* Audit & Movement Detail Modal */}
            <WipDetailModal
                open={modalOpen}
                onClose={closeDetailModal}
                item={selectedItem}
                activeTab={modalTab}
                onTabChange={setModalTab}
            />
        </div>
    );
}
