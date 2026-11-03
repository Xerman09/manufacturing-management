"use client";

import React from "react";
import { motion } from "framer-motion";
import { useCustomerOrderLeadTimeTracker } from "./hooks/useCustomerOrderLeadTimeTracker";
import { LeadTimeHeader } from "./components/LeadTimeHeader";
import { LeadTimeFilterBar } from "./components/LeadTimeFilterBar";
import { LeadTimeGridTable } from "./components/LeadTimeGridTable";
import { MilestoneTimelineModal } from "./components/MilestoneTimelineModal";

export default function CustomerOrderLeadTimeTrackerModule() {
    const {
        orders,
        kpis,
        branches,
        customers,
        isLoading,
        error,
        refresh,

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
        onPeriodChange,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        resetFilters,

        // Pagination
        page,
        setPage,
        pageSize,
        setPageSize,
        totalOrders,

        // Modal
        isTimelineModalOpen,
        timelineTarget,
        selectedOrderForTimeline,
        openTimelineModal,
        closeTimelineModal,
    } = useCustomerOrderLeadTimeTracker();

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4 p-4 sm:p-6 min-h-full"
        >
            {/* Header with KPI cards */}
            <LeadTimeHeader kpis={kpis} isLoading={isLoading} onRefresh={refresh} />

            {/* Filter controls */}
            <LeadTimeFilterBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                branches={branches}
                selectedBranchId={selectedBranchId}
                onBranchChange={setSelectedBranchId}
                customers={customers}
                selectedCustomerCode={selectedCustomerCode}
                onCustomerChange={setSelectedCustomerCode}
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
                selectedPeriod={selectedPeriod}
                onPeriodChange={onPeriodChange}
                startDate={startDate}
                onStartDateChange={setStartDate}
                endDate={endDate}
                onEndDateChange={setEndDate}
                onResetFilters={resetFilters}
                totalOrders={totalOrders}
            />

            {/* Data Table */}
            <LeadTimeGridTable
                orders={orders}
                isLoading={isLoading}
                error={error}
                page={page}
                pageSize={pageSize}
                totalOrders={totalOrders}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                onViewTimeline={openTimelineModal}
                onRetry={refresh}
            />

            {/* Milestone Timeline Drawer / Modal */}
            <MilestoneTimelineModal
                key={`${selectedOrderForTimeline?.orderId ?? "closed"}-${timelineTarget ?? "overview"}`}
                isOpen={isTimelineModalOpen}
                onClose={closeTimelineModal}
                order={selectedOrderForTimeline}
                targetPair={timelineTarget}
            />
        </motion.div>
    );
}
