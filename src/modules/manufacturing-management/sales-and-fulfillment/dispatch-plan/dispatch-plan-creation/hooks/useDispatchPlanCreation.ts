import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type {
  DispatchMasterData,
  DispatchPlanDetail,
  DispatchPlanListItem,
} from "../../shared.types";
import {
  fetchDispatchPlanDetail,
  fetchDispatchPlans,
  fetchMasterData,
} from "../services/dispatch-plan-creation-api";

export function useDispatchPlanCreation() {
  // Master data
  const [masterData, setMasterData] = useState<DispatchMasterData>({
    branches: [],
    drivers: [],
    helpers: [],
    vehicles: [],
    coa: [],
    locked_vehicle: { id: 0, name: "3rd Party Logistics" },
  });
  const [isLoadingMaster, setIsLoadingMaster] = useState<boolean>(true);

  // List & pagination
  const [plans, setPlans] = useState<DispatchPlanListItem[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState<boolean>(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalPlans, setTotalPlans] = useState<number>(0);
  const [counts, setCounts] = useState({ all: 0, Pending: 0, Approved: 0, Rejected: 0 });

  // Modals — wait for load before showing View / Edit modals
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isViewOpen, setIsViewOpen] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [loadingPlanId, setLoadingPlanId] = useState<number | null>(null);
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<DispatchPlanDetail | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setPage(1);
  }, []);

  const handleBranchChange = useCallback((id: number | null) => {
    setSelectedBranchId(id);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  // Load master data once
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setIsLoadingMaster(true);
        const data = await fetchMasterData();
        if (active) setMasterData(data);
      } catch (err) {
        console.error("[useDispatchPlanCreation] master data load failed:", err);
      } finally {
        if (active) setIsLoadingMaster(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  // Load dispatch plan list
  const loadPlans = useCallback(async () => {
    setIsLoadingPlans(true);
    setPlansError(null);
    try {
      const res = await fetchDispatchPlans({
        search: searchQuery,
        branchId: selectedBranchId,
        status: statusFilter,
        page,
        pageSize,
      });
      setPlans(res.data);
      setTotalPlans(res.total);
      if (res.counts) setCounts(res.counts);
    } catch (err) {
      setPlansError((err as Error).message || "Failed to load dispatch plans");
      setPlans([]);
    } finally {
      setIsLoadingPlans(false);
    }
  }, [searchQuery, selectedBranchId, statusFilter, page, pageSize]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Wait for detail to finish loading before opening View modal
  const openViewModal = useCallback(async (planId: number) => {
    setLoadingPlanId(planId);
    try {
      const detail = await fetchDispatchPlanDetail(planId);
      setSelectedPlanDetail(detail);
      setIsViewOpen(true);
    } catch (err) {
      toast.error((err as Error).message || "Failed to load dispatch plan details");
    } finally {
      setLoadingPlanId(null);
    }
  }, []);

  // Wait for detail to finish loading before opening Edit modal
  const openEditModal = useCallback(async (planId: number) => {
    setLoadingPlanId(planId);
    try {
      const detail = await fetchDispatchPlanDetail(planId);
      if (detail.status !== "Pending" && detail.status !== "Rejected") {
        toast.error("Cannot Edit", {
          description: `Dispatch Plan ${detail.dispatch_no} is ${detail.status} and cannot be modified.`,
        });
        return;
      }
      setSelectedPlanDetail(detail);
      setIsEditOpen(true);
    } catch (err) {
      toast.error((err as Error).message || "Failed to load dispatch plan for editing");
    } finally {
      setLoadingPlanId(null);
    }
  }, []);

  const closeViewModal = useCallback(() => {
    setIsViewOpen(false);
    setSelectedPlanDetail(null);
  }, []);

  const closeEditModal = useCallback(() => {
    setIsEditOpen(false);
    setSelectedPlanDetail(null);
  }, []);

  return {
    masterData,
    isLoadingMaster,
    plans,
    isLoadingPlans,
    plansError,
    searchQuery,
    setSearchQuery: handleSearchChange,
    selectedBranchId,
    setSelectedBranchId: handleBranchChange,
    statusFilter,
    setStatusFilter: handleStatusChange,
    page,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    totalPlans,
    counts,
    refreshPlans: loadPlans,
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
  };
}
