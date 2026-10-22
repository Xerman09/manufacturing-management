// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/OrderAllocationConsolidationTrackingModule.tsx

"use client";

import React from "react";
import { motion } from "framer-motion";
import { useOrderAllocationTracking } from "./hooks/use-order-allocation-tracking";
import { TrackingHeader } from "./components/TrackingHeader";
import { TrackingMetricsCards } from "./components/TrackingMetricsCards";
import { TrackingFilterBar } from "./components/TrackingFilterBar";
import { TrackingOrderTable } from "./components/TrackingOrderTable";
import { TrackingOrderDetailModal } from "./components/TrackingOrderDetailModal";

export default function OrderAllocationConsolidationTrackingModule() {
    const {
        orders,
        metrics,
        branches,
        selectedBranchId,
        setSelectedBranchId,
        search,
        setSearch,
        stage,
        setStage,
        page,
        setPage,
        pageSize,
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
    } = useOrderAllocationTracking();

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4 p-4 md:p-6 max-w-[1700px] mx-auto w-full"
        >
            {/* Header */}
            <TrackingHeader
                onRefresh={() => loadOrders(true)}
                isRefreshing={isRefreshing}
            />

            {/* Metric Overview Cards */}
            <TrackingMetricsCards metrics={metrics} />

            {/* Filter Bar with Searchable Comboboxes for Branch and Stage */}
            <TrackingFilterBar
                branches={branches}
                selectedBranchId={selectedBranchId}
                onSelectBranch={setSelectedBranchId}
                search={search}
                onSearchChange={setSearch}
                stage={stage}
                onStageChange={setStage}
            />

            {/* Order Table with Dual Indicators and Statuses */}
            <TrackingOrderTable
                orders={orders}
                isLoading={isLoading}
                onSelectOrder={handleSelectOrder}
                page={page}
                pageSize={pageSize}
                totalPages={totalPages}
                totalCount={totalCount}
                onPageChange={setPage}
            />

            {/* Order Detail Modal with Line Grid & Expandable Audits */}
            <TrackingOrderDetailModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                order={selectedOrder}
                isLoading={isModalLoading}
                onRefresh={handleRefreshSelectedOrder}
            />
        </motion.div>
    );
}
