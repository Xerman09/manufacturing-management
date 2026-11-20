import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type {
  ApprovalActionPayload,
  BranchOption,
  DispatchPlanDetail,
  DispatchPlanListItem,
} from "../../shared.types";
import {
  fetchApprovalBranches,
  fetchApprovalDispatchPlans,
  fetchApprovalPlanDetail,
  submitApprovalAction,
} from "../services/dispatch-plan-approval-api";

export type ApprovalStatusTab = "Pending" | "Approved" | "Rejected" | "All";

export function useDispatchPlanApproval() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);

  const [plans, setPlans] = useState<DispatchPlanListItem[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<ApprovalStatusTab>("Pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPlans, setTotalPlans] = useState(0);
  const [counts, setCounts] = useState({ all: 0, Pending: 0, Approved: 0, Rejected: 0 });

  // Detail modal — wait for load before showing
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DispatchPlanDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStatusTabChange = useCallback((tab: ApprovalStatusTab) => {
    setStatusTab(tab);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setPage(1);
  }, []);

  const handleBranchChange = useCallback((id: number | null) => {
    setSelectedBranchId(id);
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadBranches() {
      try {
        setIsLoadingBranches(true);
        const data = await fetchApprovalBranches();
        if (active) setBranches(data);
      } catch (err) {
        console.error("[useDispatchPlanApproval] load branches failed:", err);
      } finally {
        if (active) setIsLoadingBranches(false);
      }
    }
    loadBranches();
    return () => {
      active = false;
    };
  }, []);

  const loadPlans = useCallback(async () => {
    setIsLoadingPlans(true);
    setPlansError(null);
    try {
      const res = await fetchApprovalDispatchPlans({
        status: statusTab,
        search: searchQuery,
        branchId: selectedBranchId,
        page,
        pageSize,
      });
      setPlans(res.data);
      setTotalPlans(res.total);
      if (res.counts) setCounts(res.counts);
    } catch (err) {
      setPlansError((err as Error).message || "Failed to load approval queue");
      setPlans([]);
    } finally {
      setIsLoadingPlans(false);
    }
  }, [statusTab, searchQuery, selectedBranchId, page, pageSize]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const openDetailModal = useCallback(async (planId: number) => {
    setLoadingPlanId(planId);
    try {
      const detail = await fetchApprovalPlanDetail(planId);
      setSelectedDetail(detail);
      setIsModalOpen(true);
    } catch (err) {
      toast.error((err as Error).message || "Failed to load dispatch plan details");
    } finally {
      setLoadingPlanId(null);
    }
  }, []);

  const closeDetailModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedDetail(null);
  }, []);

  const handleDecision = useCallback(
    async (payload: ApprovalActionPayload) => {
      if (!selectedDetail) return;
      setIsSubmitting(true);
      try {
        await submitApprovalAction(selectedDetail.dispatch_id, payload);
        closeDetailModal();
        await loadPlans();
      } catch {
        // Error toast already shown in API layer
      } finally {
        setIsSubmitting(false);
      }
    },
    [selectedDetail, closeDetailModal, loadPlans]
  );

  return {
    branches,
    isLoadingBranches,
    plans,
    isLoadingPlans,
    plansError,
    statusTab,
    setStatusTab: handleStatusTabChange,
    searchQuery,
    setSearchQuery: handleSearchChange,
    selectedBranchId,
    setSelectedBranchId: handleBranchChange,
    page,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    totalPlans,
    counts,
    refreshPlans: loadPlans,
    isModalOpen,
    openDetailModal,
    closeDetailModal,
    loadingPlanId,
    selectedDetail,
    isSubmitting,
    handleDecision,
  };
}
