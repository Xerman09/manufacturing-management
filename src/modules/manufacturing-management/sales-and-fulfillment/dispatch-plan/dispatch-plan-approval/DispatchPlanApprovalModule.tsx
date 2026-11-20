"use client";

import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, RefreshCw, Search, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableCombobox } from "../components/SearchableCombobox";
import {
  useDispatchPlanApproval,
  type ApprovalStatusTab,
} from "./hooks/useDispatchPlanApproval";
import { DispatchApprovalTable } from "./components/DispatchApprovalTable";
import { DispatchApprovalDetailModal } from "./components/DispatchApprovalDetailModal";

export default function DispatchPlanApprovalModule() {
  const {
    branches,
    isLoadingBranches,
    plans,
    isLoadingPlans,
    plansError,
    statusTab,
    setStatusTab,
    searchQuery,
    setSearchQuery,
    selectedBranchId,
    setSelectedBranchId,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPlans,
    counts,
    refreshPlans,
    isModalOpen,
    openDetailModal,
    closeDetailModal,
    loadingPlanId,
    selectedDetail,
    isSubmitting,
    handleDecision,
  } = useDispatchPlanApproval();

  const branchOptions = branches.map((b) => ({
    value: String(b.id),
    label: b.branch_name,
    sublabel: b.branch_code || undefined,
  }));

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedBranchId !== null);

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
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Dispatch Plan Approval
              </h1>
              <Badge
                variant="outline"
                className="text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
              >
                {counts.Pending} For Approval
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review submitted trips (For Shipping) and authorize release to Dispatched or return for correction.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={refreshPlans}
          disabled={isLoadingPlans}
          className="gap-1.5 h-9 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoadingPlans ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Status Tabs + Filters */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.04 }}
        className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-card/60 backdrop-blur-sm p-3 rounded-xl border shadow-xs"
      >
        <Tabs
          value={statusTab}
          onValueChange={(val) => setStatusTab(val as ApprovalStatusTab)}
          className="w-full xl:w-auto"
        >
          <TabsList className="grid grid-cols-4 xl:inline-flex h-9">
            <TabsTrigger value="Pending" className="text-xs gap-1.5">
              For Approval
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4">
                {counts.Pending}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="Approved" className="text-xs gap-1.5">
              Approved
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4">
                {counts.Approved}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="Rejected" className="text-xs gap-1.5">
              Returned
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4">
                {counts.Rejected}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="All" className="text-xs gap-1.5">
              All
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4">
                {counts.all}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 xl:justify-end">
          <div className="relative flex-1 sm:max-w-xs">
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
              disabled={isLoadingBranches}
              icon={<Building2 className="h-3.5 w-3.5" />}
              popoverWidthClass="w-[240px]"
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
              }}
              className="h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              Reset
            </Button>
          )}
        </div>
      </motion.div>

      {/* Queue Table */}
      <motion.div
        key={statusTab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <DispatchApprovalTable
          plans={plans}
          isLoading={isLoadingPlans}
          error={plansError}
          loadingPlanId={loadingPlanId}
          page={page}
          pageSize={pageSize}
          totalPlans={totalPlans}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onReview={openDetailModal}
          onRetry={refreshPlans}
        />
      </motion.div>

      {/* Review & Decision Modal */}
      <DispatchApprovalDetailModal
        open={isModalOpen}
        onOpenChange={(v) => {
          if (!v) closeDetailModal();
        }}
        plan={selectedDetail}
        isSubmitting={isSubmitting}
        onDecide={handleDecision}
      />
    </motion.div>
  );
}
