"use client";

import React from "react";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Search, X, Building2, Truck, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableCombobox } from "../components/SearchableCombobox";
import { useDispatchPlanCreation } from "./hooks/useDispatchPlanCreation";
import { DispatchPlanTable } from "./components/DispatchPlanTable";
import { DispatchPlanCreateModal } from "./components/DispatchPlanCreateModal";
import { DispatchPlanEditModal } from "./components/DispatchPlanEditModal";
import { DispatchPlanViewModal } from "./components/DispatchPlanViewModal";

const STATUS_OPTIONS = [
  { value: "Pending", label: "For Approval" },
  { value: "Approved", label: "Approved" },
  { value: "Dispatched", label: "Dispatched" },
  { value: "Rejected", label: "Returned for Correction" },
];

export default function DispatchPlanCreationModule() {
  const {
    masterData,
    isLoadingMaster,
    plans,
    isLoadingPlans,
    plansError,
    searchQuery,
    setSearchQuery,
    selectedBranchId,
    setSelectedBranchId,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPlans,
    counts,
    refreshPlans,
    isCreateOpen,
    setIsCreateOpen,
    isViewOpen,
    openViewModal,
    closeViewModal,
    isEditOpen,
    openEditModal,
    closeEditModal,
    loadingPlanId,
    selectedPlanDetail,
  } = useDispatchPlanCreation();

  const branchOptions = masterData.branches.map((b) => ({
    value: String(b.id),
    label: b.branch_name,
    sublabel: b.branch_code || undefined,
  }));

  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedBranchId !== null || statusFilter !== "All"
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4 p-4 sm:p-6 min-h-full"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Dispatch Plan Creation
              </h1>
              <Badge variant="secondary" className="text-xs font-semibold">
                {counts.all} Total
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Group invoiced Sales Orders (For Loading) into 3rd Party Logistics dispatch trips and submit for approval.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refreshPlans}
            disabled={isLoadingPlans}
            className="gap-1.5 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingPlans ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="gap-1.5 h-9"
          >
            <Plus className="h-4 w-4" />
            Create Dispatch Plan
          </Button>
        </div>
      </div>

      {/* Filter Bar (Search + Popover/Command Comboboxes) */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.04 }}
        className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-card/60 backdrop-blur-sm p-3 rounded-xl border shadow-xs"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search dispatch no., driver, branch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="w-full sm:w-[210px]">
            <SearchableCombobox
              options={branchOptions}
              value={selectedBranchId ? String(selectedBranchId) : null}
              onChange={(val) => setSelectedBranchId(val ? Number(val) : null)}
              allowClear
              clearLabel="All Branches"
              searchPlaceholder="Search branch..."
              emptyText="No branch found."
              disabled={isLoadingMaster}
              icon={<Building2 className="h-3.5 w-3.5" />}
              popoverWidthClass="w-[240px]"
            />
          </div>

          <div className="w-full sm:w-[200px]">
            <SearchableCombobox
              options={STATUS_OPTIONS}
              value={statusFilter === "All" ? null : statusFilter}
              onChange={(val) => setStatusFilter(val || "All")}
              allowClear
              clearLabel="All Statuses"
              searchPlaceholder="Filter status..."
              emptyText="No status found."
              icon={<Filter className="h-3.5 w-3.5" />}
              popoverWidthClass="w-[220px]"
            />
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedBranchId(null);
                setStatusFilter("All");
              }}
              className="h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              Reset filters
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground self-end lg:self-auto">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300">
            {counts.Pending} For Approval
          </Badge>
          {counts.Rejected > 0 && (
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300">
              {counts.Rejected} Returned
            </Badge>
          )}
        </div>
      </motion.div>

      {/* Main List Table */}
      <DispatchPlanTable
        plans={plans}
        isLoading={isLoadingPlans}
        error={plansError}
        loadingPlanId={loadingPlanId}
        page={page}
        pageSize={pageSize}
        totalPlans={totalPlans}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onView={openViewModal}
        onEdit={openEditModal}
        onRetry={refreshPlans}
      />

      {/* Modals */}
      <DispatchPlanCreateModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        masterData={masterData}
        onSuccess={refreshPlans}
      />

      <DispatchPlanViewModal
        open={isViewOpen}
        onOpenChange={(v) => {
          if (!v) closeViewModal();
        }}
        plan={selectedPlanDetail}
        masterData={masterData}
      />

      <DispatchPlanEditModal
        open={isEditOpen}
        onOpenChange={(v) => {
          if (!v) closeEditModal();
        }}
        plan={selectedPlanDetail}
        masterData={masterData}
        onSuccess={refreshPlans}
      />
    </motion.div>
  );
}
