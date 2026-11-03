"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Send,
  Save,
  ArrowRight,
  AlertCircle,
  Eye,
  Calendar,
  Layers,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Boxes,
  Sparkles,
  Loader2,
  Printer,
  Pencil,
  XCircle,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RowQuantityInput } from "./components/RowQuantityInput";
import { toast } from "sonner";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransferStatusBadge } from "./components/TransferStatusBadge";
import { SearchableSelect, type Option } from "./components/SearchableSelect";
import { LotBatchSelectionModal } from "./components/LotBatchSelectionModal";
import { LotTransferPrintModal } from "./components/LotTransferPrintModal";
import { lotTransferService } from "./services/lot-transfer.service";
import { resolveProductClassification } from "./services/lot-allocation.engine";
import {
  fetchBranches,
  fetchLotsByBranch,
  fetchLotTransferBatchStats,
  fetchLotProductsWithStock,
  type MMLot,
  type LotTransferLotStats,
  type LotProductWithBatches,
} from "./services/lot-tracking.service";
import type { BranchOption, LotTransfer, LotTransferDetail, LotTransferFormLine, LotTransferFormValues, LotTransferStatus, ProductTypeOption } from "./types";

function formatNumberTruncated(val: number | string | null | undefined, maxDecimals = 4): string {
  if (val === null || val === undefined || val === "") return "0";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return "0";
  const clean = parseFloat(num.toFixed(8)).toString();
  const parts = clean.split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (parts.length > 1 && parts[1]) {
    const decPart = parts[1].slice(0, maxDecimals);
    return `${intPart}.${decPart}`;
  }
  return intPart;
}

function buildPageList(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  const rangeStart = Math.max(2, current - 1);
  const rangeEnd = Math.min(total - 1, current + 1);
  for (let p = rangeStart; p <= rangeEnd; p++) pages.push(p);
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

type SortField = "requestNo" | "transferDate" | "status" | "sourceLot" | "targetLot" | "quantity";
type SortDirection = "asc" | "desc";

interface LotTransferRequestModuleProps {
  userBranchId?: number | null;
  transferId?: number;
  initialCreating?: boolean;
  backHref?: string;
}

export const LotTransferRequestModule: React.FC<LotTransferRequestModuleProps> = ({
  userBranchId,
  transferId,
  initialCreating = false,
}) => {
  // View state: 'list' | 'create' | 'view'
  const [viewState, setViewState] = useState<"list" | "create" | "view">(
    initialCreating ? "create" : transferId ? "view" : "list"
  );

  // Active branches state (only isActive === true)
  const [activeBranches, setActiveBranches] = useState<BranchOption[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Selected branch for filtering (List view)
  const [filterBranchId, setFilterBranchId] = useState<number | null>(
    userBranchId || null
  );

  // Form State: First input is selected branch (starts empty, no auto-fill)!
  const [formBranchId, setFormBranchId] = useState<number | null>(null);

  // Product Types state (Step 1)
  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([]);
  const [loadingProductTypes, setLoadingProductTypes] = useState(false);
  const [formProductTypeId, setFormProductTypeId] = useState<number | null>(null);

  // Listing state
  const [transfers, setTransfers] = useState<LotTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  // Used to re-trigger row animations when data changes
  const [listAnimKey, setListAnimKey] = useState(0);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Lots available for the selected branch in form
  const [lots, setLots] = useState<MMLot[]>([]);
  const [lotBatchStats, setLotBatchStats] = useState<
    Record<number, LotTransferLotStats>
  >({});
  const [loadingLots, setLoadingLots] = useState(false);

  // Source Lot, Target Lot & Date Filters
  const [filterSourceLotId, setFilterSourceLotId] = useState<number | "ALL">("ALL");
  const [filterTargetLotId, setFilterTargetLotId] = useState<number | "ALL">("ALL");
  const [datePreset, setDatePreset] = useState<"ALL" | "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "CUSTOM">("ALL");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Sort state
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField(null);
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 inline text-muted-foreground/40" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 ml-1 inline text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 inline text-primary" />
    );
  };

  // Source & Target Lot options derived dynamically from transfers and branch lots
  const sourceLotFilterOptions: Option[] = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of transfers) {
      if (t.sourceLotId && t.sourceLotName && t.sourceLotName !== "-") {
        map.set(t.sourceLotId, t.sourceLotName);
      }
    }
    for (const l of lots) {
      if (l.lot_id && l.lot_name && !map.has(l.lot_id)) {
        map.set(l.lot_id, l.lot_name);
      }
    }
    const list = Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({
        value: id,
        label: name,
      }));
    return [
      { value: "ALL", label: "All Source Lots" },
      ...list,
    ];
  }, [transfers, lots]);

  const targetLotFilterOptions: Option[] = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of transfers) {
      if (t.targetLotId && t.targetLotName && t.targetLotName !== "-") {
        map.set(t.targetLotId, t.targetLotName);
      }
    }
    for (const l of lots) {
      if (l.lot_id && l.lot_name && !map.has(l.lot_id)) {
        map.set(l.lot_id, l.lot_name);
      }
    }
    const list = Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({
        value: id,
        label: name,
      }));
    return [
      { value: "ALL", label: "All Target Lots" },
      ...list,
    ];
  }, [transfers, lots]);

  const isDateInRange = useCallback(
    (dateStr?: string | null): boolean => {
      if (datePreset === "ALL") return true;
      if (!dateStr) return false;
      const d = String(dateStr).slice(0, 10);
      if (!d || d.length < 10) return false;

      const now = new Date();
      const todayStr = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" });

      if (datePreset === "TODAY") {
        return d === todayStr;
      }

      if (datePreset === "THIS_WEEK") {
        const parts = todayStr.split("-").map(Number);
        const curr = new Date(parts[0], parts[1] - 1, parts[2]);
        const day = curr.getDay();
        const diffToMon = (day === 0 ? -6 : 1) - day;
        const monday = new Date(curr);
        monday.setDate(curr.getDate() + diffToMon);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const monStr = monday.toLocaleDateString("sv-SE");
        const sunStr = sunday.toLocaleDateString("sv-SE");
        return d >= monStr && d <= sunStr;
      }

      if (datePreset === "THIS_MONTH") {
        const monthPrefix = todayStr.slice(0, 7);
        return d.startsWith(monthPrefix);
      }

      if (datePreset === "CUSTOM") {
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      }

      return true;
    },
    [datePreset, dateFrom, dateTo]
  );

  const filteredTransfers = useMemo(() => {
    return transfers.filter((item) => {
      if (filterSourceLotId !== "ALL" && item.sourceLotId !== filterSourceLotId) {
        return false;
      }
      if (filterTargetLotId !== "ALL" && item.targetLotId !== filterTargetLotId) {
        return false;
      }
      if (!isDateInRange(item.transferDate)) {
        return false;
      }
      return true;
    });
  }, [transfers, filterSourceLotId, filterTargetLotId, isDateInRange]);

  const displayedTransfers = useMemo(() => {
    if (!sortField) return filteredTransfers;
    return [...filteredTransfers].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      if (sortField === "requestNo") {
        aVal = a.requestNo || "";
        bVal = b.requestNo || "";
      } else if (sortField === "transferDate") {
        aVal = a.transferDate || "";
        bVal = b.transferDate || "";
      } else if (sortField === "status") {
        aVal = a.status || "";
        bVal = b.status || "";
      } else if (sortField === "sourceLot") {
        aVal = a.sourceLotName && a.sourceLotName !== "-" ? a.sourceLotName : "";
        bVal = b.sourceLotName && b.sourceLotName !== "-" ? b.sourceLotName : "";
      } else if (sortField === "targetLot") {
        aVal = a.targetLotName && a.targetLotName !== "-" ? a.targetLotName : "";
        bVal = b.targetLotName && b.targetLotName !== "-" ? b.targetLotName : "";
      } else if (sortField === "quantity") {
        aVal = a.quantity || 0;
        bVal = b.quantity || 0;
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredTransfers, sortField, sortDirection]);

  // Auto-reset to page 1 on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterBranchId, search, statusFilter, filterSourceLotId, filterTargetLotId, datePreset, dateFrom, dateTo, sortField, sortDirection]);

  const totalItems = displayedTransfers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTransfers = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    return displayedTransfers.slice(startIndex, startIndex + itemsPerPage);
  }, [displayedTransfers, safeCurrentPage, itemsPerPage]);

  const hasActiveFilters =
    filterSourceLotId !== "ALL" ||
    filterTargetLotId !== "ALL" ||
    datePreset !== "ALL" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    statusFilter !== "ALL" ||
    search !== "";

  const resetFilters = () => {
    setFilterSourceLotId("ALL");
    setFilterTargetLotId("ALL");
    setDatePreset("ALL");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("ALL");
    setSearch("");
  };

  // Draft edit state
  const [editingTransferId, setEditingTransferId] = useState<number | null>(null);
  const [editingRequestNo, setEditingRequestNo] = useState<string | null>(null);
  const [cancellingDraft, setCancellingDraft] = useState<LotTransfer | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelling, setCancelling] = useState<boolean>(false);

  // Line item edit state
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [editLineQty, setEditLineQty] = useState<number>(0);
  const [editLineTargetBatch, setEditLineTargetBatch] = useState<string>("");
  const [editLineRemarks, setEditLineRemarks] = useState<string>("");

  // Form Fields
  const [sourceLotId, setSourceLotId] = useState<number | null>(null);
  const [targetLotId, setTargetLotId] = useState<number | null>(null);
  const [transferDate, setTransferDate] = useState<string>(
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" })
  );
  const [reason, setReason] = useState<string>("");
  const [lines, setLines] = useState<LotTransferFormLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<"draft" | "submit" | null>(null);
  const [submittingDraftId, setSubmittingDraftId] = useState<number | null>(null);

  // Modal for adding batch
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  // Selected transfer for view details
  const [activeTransfer, setActiveTransfer] = useState<LotTransfer | null>(null);

  // Print slip modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printTransfer, setPrintTransfer] = useState<LotTransfer | null>(null);

  // 1. Load active branches (strictly isActive === true)
  const loadBranches = useCallback(async () => {
    setLoadingBranches(true);
    try {
      const data = await fetchBranches();
      setActiveBranches(data);
      // Maintain user's explicit selection if valid, but do NOT auto-fill formBranchId initially
      if (data.length > 0) {
        setFormBranchId((prev) => {
          if (prev && data.some((b) => b.id === prev)) return prev;
          return null;
        });
        setFilterBranchId((prev) => {
          if (prev && data.some((b) => b.id === prev)) return prev;
          if (userBranchId && data.some((b) => b.id === userBranchId)) return userBranchId;
          return null; // All branches
        });
      }
    } catch {
      toast.error("Failed to load active branches");
    } finally {
      setLoadingBranches(false);
    }
  }, [userBranchId]);

  // 2. Load lots specifically for the active form branch with authoritative batch stats
  const loadLotsForBranch = useCallback(async (bId: number | null, pTypeId?: number | null) => {
    if (!bId) {
      setLots([]);
      setLotBatchStats({});
      return;
    }
    setLoadingLots(true);
    try {
      const [lotsData, stats] = await Promise.all([
        fetchLotsByBranch(bId),
        fetchLotTransferBatchStats(bId, pTypeId).catch(() => ({})),
      ]);
      setLots(lotsData);
      setLotBatchStats(stats);
    } catch {
      toast.error("Failed to load lots for selected branch");
      setLots([]);
      setLotBatchStats({});
    } finally {
      setLoadingLots(false);
    }
  }, []);

  // 3. Load product types (Step 1)
  const loadProductTypes = useCallback(async () => {
    setLoadingProductTypes(true);
    try {
      const data = await lotTransferService.fetchProductTypes();
      setProductTypes(data);
      if (data.length > 0) {
        setFormProductTypeId((prev) => (prev && data.some((pt) => pt.id === prev) ? prev : null));
      }
    } catch {
      toast.error("Failed to load product classifications");
    } finally {
      setLoadingProductTypes(false);
    }
  }, []);

  // 4. Load transfers list
  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const filter: Parameters<typeof lotTransferService.listTransfers>[0] = {
        branchId: filterBranchId || undefined,
        search: search.trim() || undefined,
      };
      if (statusFilter !== "ALL") {
        filter.status = statusFilter as LotTransferStatus;
      }
      const res = await lotTransferService.listTransfers(filter);
      setTransfers(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
      setListAnimKey((k) => k + 1);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [filterBranchId, search, statusFilter]);

  // Initial load
  useEffect(() => {
    loadBranches();
    loadProductTypes();
  }, [loadBranches, loadProductTypes]);

  // When formBranchId or formProductTypeId changes, load lots and authoritative batch stats
  useEffect(() => {
    if (formBranchId) {
      loadLotsForBranch(formBranchId, formProductTypeId);
    } else {
      setLots([]);
      setLotBatchStats({});
    }
  }, [formBranchId, formProductTypeId, loadLotsForBranch]);

  useEffect(() => {
    if (viewState === "list") {
      loadTransfers();
    }
  }, [viewState, loadTransfers]);

  useEffect(() => {
    if (transferId) {
      setLoading(true);
      lotTransferService
        .getTransferById(transferId)
        .then((data) => {
          setActiveTransfer(data);
          setViewState("view");
        })
        .finally(() => setLoading(false));
    }
  }, [transferId]);

  // Branch options for Select (strictly active branches)
  const branchOptions: Option[] = useMemo(() => {
    return activeBranches.map((b) => ({
      value: b.id,
      label: b.branchName,
      subLabel: b.branchCode ? `Code: ${b.branchCode} • Active` : "Active",
    }));
  }, [activeBranches]);

  // Source lot options for select dropdown - strictly HIDE incompatible lots, inactive lots, and lots with no matching batches
  const sourceLotOptions: Option[] = useMemo(() => {
    return lots
      .filter((l) => {
        if (l.status !== "ACTIVE") return false;
        const stats = lotBatchStats[l.lot_id];
        return stats ? stats.matchingBatchesToMove > 0 : false;
      })
      .map((l) => {
        const stats = lotBatchStats[l.lot_id];
        const unitLabel = l.unit_name || stats?.unitName || "";
        const matchingCount = stats ? stats.matchingBatchesToMove : 0;
        const matchingQty = stats ? stats.matchingQtyToMove : 0;
        const occupied = stats ? stats.totalOccupancy : 0;
        return {
          value: l.lot_id,
          label: l.lot_name,
          subLabel: `${matchingCount} ${matchingCount === 1 ? "batch" : "batches"} to move (${matchingQty.toLocaleString()} ${unitLabel}) • Occupancy: ${occupied.toLocaleString()}/${stats?.maxCapacity && stats.maxCapacity > 0 ? stats.maxCapacity.toLocaleString() : "∞"} ${unitLabel}`,
        };
      });
  }, [lots, lotBatchStats]);

  const selectedBranch = activeBranches.find((b) => b.id === formBranchId);

  // Product type options for select dropdown
  const productTypeOptions: Option[] = useMemo(() => {
    return productTypes.map((pt) => ({
      value: pt.id,
      label: pt.name,
      subLabel: pt.description || (pt.name.toLowerCase().includes("packaging") ? "FIFO Inventory Rule" : "FEFO Inventory Rule"),
    }));
  }, [productTypes]);

  const selectedProductType = useMemo(
    () => productTypes.find((pt) => pt.id === formProductTypeId),
    [productTypes, formProductTypeId]
  );
  const sourceLot = lots.find((l) => l.lot_id === sourceLotId);
  const targetLot = lots.find((l) => l.lot_id === targetLotId);

  // Target lot options - strictly hide incompatible UOM lots, inactive lots, source lot, and lots containing different product types (empty lots can store any)
  const targetLotOptions: Option[] = useMemo(() => {
    return lots
      .filter((l) => {
        // Exclude the source lot itself
        if (l.lot_id === sourceLotId) return false;
        // Exclude inactive lots
        if (l.status !== "ACTIVE") return false;
        // Strictly HIDE incompatible UOM lots if source lot has a specified UOM
        if (sourceLot?.unit_id && l.unit_id && sourceLot.unit_id !== l.unit_id) {
          return false;
        }

        const stats = lotBatchStats[l.lot_id];
        const totalBatches = stats ? stats.totalBatchCount : 0;
        const totalOccupancy = stats ? stats.totalOccupancy : 0;
        const matchingBatches = stats ? stats.matchingBatchesToMove : 0;
        const hasNegative = Boolean(stats?.hasNegativeStock || totalOccupancy < 0);
        // Those lots with negative qty batches are strictly NOT empty lots
        const isEmpty = (!stats || (totalBatches === 0 && totalOccupancy === 0)) && !hasNegative;

        // If the lot is empty (all batches = 0 and no negative balance), it can store ANY product type
        if (isEmpty) return true;

        // If the lot already has batches/stock or has negative stock, it is ONLY eligible if it currently holds the selected product classification
        // If matchingBatches === 0 while not clean empty, it holds a DIFFERENT product type -> strictly hide it to prevent cross-contamination
        if (formProductTypeId && matchingBatches === 0) {
          return false;
        }

        return true;
      })
      .map((l) => {
        const stats = lotBatchStats[l.lot_id];
        const occupied = stats ? stats.totalOccupancy : 0;
        const totalBatches = stats ? stats.totalBatchCount : 0;
        const matchingBatches = stats ? stats.matchingBatchesToMove : 0;
        const hasNegative = Boolean(stats?.hasNegativeStock || occupied < 0);
        const max = l.max_batch_capacity;
        const effectiveOccupied = Math.max(0, occupied);
        const availableSpace = max > 0 ? Math.max(0, max - effectiveOccupied) : 999999;
        const unitLabel = l.unit_name || stats?.unitName || "";
        const isEmpty = (!stats || (totalBatches === 0 && occupied === 0)) && !hasNegative;

        let subLabel = "";
        if (isEmpty) {
          subLabel = max > 0
            ? `Empty Lot (Available for any product) • Capacity: ${max.toLocaleString()} ${unitLabel}`
            : "Empty Lot (Available for any product)";
        } else {
          subLabel = max > 0
            ? `${matchingBatches} matching ${matchingBatches === 1 ? "batch" : "batches"} • Capacity Left: ${availableSpace.toLocaleString()} / Max: ${max.toLocaleString()} ${unitLabel} (Used: ${occupied.toLocaleString()})`
            : `${matchingBatches} matching ${matchingBatches === 1 ? "batch" : "batches"} • Current Stock: ${occupied.toLocaleString()} ${unitLabel}`;
        }

        return {
          value: l.lot_id,
          label: l.lot_name,
          subLabel,
          disabled: max > 0 && availableSpace <= 0,
        };
      });
  }, [lots, sourceLotId, sourceLot, lotBatchStats, formProductTypeId]);

  // UOM Compatibility Analysis
  const uomMismatch = useMemo(() => {
    if (!sourceLot || !targetLot) return null;
    if (sourceLot.unit_id && targetLot.unit_id && sourceLot.unit_id !== targetLot.unit_id) {
      return `UOM Mismatch: Source lot uses ${sourceLot.unit_name || `UOM #${sourceLot.unit_id}`} while Destination lot uses ${targetLot.unit_name || `UOM #${targetLot.unit_id}`}. Cross-UOM transfer without conversion is strictly forbidden.`;
    }
    return null;
  }, [sourceLot, targetLot]);

  // Target Lot Capacity Analysis (Current Occupied + Transfer Total vs Max Capacity)
  const targetLotCurrentOccupied = useMemo(() => {
    if (!targetLotId) return 0;
    return lotBatchStats[targetLotId]?.totalOccupancy || 0;
  }, [targetLotId, lotBatchStats]);

  const totalTransferQty = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [lines]);

  const targetLotCapacityStats = useMemo(() => {
    if (!targetLot || targetLot.max_batch_capacity <= 0) return null;
    const maxCapacity = targetLot.max_batch_capacity;
    const projectedOccupancy = targetLotCurrentOccupied + totalTransferQty;
    const remaining = Math.max(0, maxCapacity - projectedOccupancy);
    const isExceeded = projectedOccupancy > maxCapacity;
    const excess = isExceeded ? projectedOccupancy - maxCapacity : 0;

    return {
      maxCapacity,
      currentOccupied: targetLotCurrentOccupied,
      incomingTransfer: totalTransferQty,
      projectedOccupancy,
      remaining,
      isExceeded,
      excess,
    };
  }, [targetLot, targetLotCurrentOccupied, totalTransferQty]);

  const capacityWarning = useMemo(() => {
    if (!targetLotCapacityStats) return null;
    if (targetLotCapacityStats.isExceeded) {
      return `Destination lot capacity exceeded! Max capacity is ${targetLotCapacityStats.maxCapacity.toLocaleString()} ${targetLot?.unit_name || ""}. Current stock (${targetLotCapacityStats.currentOccupied.toLocaleString()}) + incoming transfer (${targetLotCapacityStats.incomingTransfer.toLocaleString()}) = ${targetLotCapacityStats.projectedOccupancy.toLocaleString()} (exceeds by ${targetLotCapacityStats.excess.toLocaleString()} ${targetLot?.unit_name || ""}).`;
    }
    return null;
  }, [targetLotCapacityStats, targetLot]);

  // Handle changing branch in form (First Input)
  const handleBranchChange = (newBranchId: number) => {
    if (newBranchId === formBranchId) return;
    setFormBranchId(newBranchId);
    setSourceLotId(null);
    setTargetLotId(null);
    if (lines.length > 0) {
      setLines([]);
      toast.info("Source lot, destination lot, and line items reset for newly selected branch.");
    }
  };

  // Handle changing product type classification in form (Step 1)
  const handleProductTypeChange = (newTypeId: number) => {
    if (newTypeId === formProductTypeId) return;
    setFormProductTypeId(newTypeId);
    setSourceLotId(null);
    setTargetLotId(null);
    if (lines.length > 0) {
      setLines([]);
      toast.info("Source lot, destination lot, and transfer line items reset because product classification was changed.");
    }
  };

  const handleAddLine = (newLine: LotTransferFormLine) => {
    setLines((prev) => [...prev, newLine]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setEditingTransferId(null);
    setEditingRequestNo(null);
    setFormBranchId(null);
    setFormProductTypeId(null);
    setSourceLotId(null);
    setTargetLotId(null);
    setTransferDate(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" }));
    setReason("");
    setLines([]);
  };

  const handleStartEditLine = (idx: number) => {
    const l = lines[idx];
    if (!l) return;
    setEditingLineIndex(idx);
    setEditLineQty(l.quantity);
    setEditLineTargetBatch(l.targetBatchNo);
    setEditLineRemarks(l.lineRemarks || "");
  };

  const handleSaveEditLine = () => {
    if (editingLineIndex === null || !lines[editingLineIndex]) return;
    const currentLine = lines[editingLineIndex];
    if (editLineQty <= 0) {
      toast.error("Transfer quantity must be greater than zero.");
      return;
    }
    if (editLineQty > currentLine.sourceOnHand) {
      toast.error(
        `Transfer quantity (${editLineQty.toLocaleString()}) exceeds available stock (${currentLine.sourceOnHand.toLocaleString()}).`
      );
      return;
    }
    if (!editLineTargetBatch.trim()) {
      toast.error("Target batch number cannot be empty.");
      return;
    }
    const isDuplicate = lines.some(
      (l, idx) =>
        idx !== editingLineIndex &&
        l.targetBatchNo.toLowerCase() === editLineTargetBatch.trim().toLowerCase()
    );
    if (isDuplicate) {
      toast.error(`Target batch number "${editLineTargetBatch.trim()}" is already used in this transfer.`);
      return;
    }

    if (targetLot && targetLot.max_batch_capacity > 0) {
      const otherLinesQty = lines.reduce(
        (sum, l, idx) => (idx === editingLineIndex ? sum : sum + (Number(l.quantity) || 0)),
        0
      );
      const projected = targetLotCurrentOccupied + otherLinesQty + editLineQty;
      if (projected > targetLot.max_batch_capacity) {
        const excess = projected - targetLot.max_batch_capacity;
        toast.error(
          `Destination lot capacity exceeded! Max capacity is ${targetLot.max_batch_capacity.toLocaleString()} ${targetLot.unit_name || ""}. Current stock (${targetLotCurrentOccupied.toLocaleString()}) + incoming transfer (${(otherLinesQty + editLineQty).toLocaleString()}) = ${projected.toLocaleString()} (exceeds by ${excess.toLocaleString()} ${targetLot.unit_name || ""}).`
        );
        return;
      }
    }

    setLines((prev) =>
      prev.map((l, idx) =>
        idx === editingLineIndex
          ? {
            ...l,
            quantity: editLineQty,
            targetBatchNo: editLineTargetBatch.trim(),
            lineRemarks: editLineRemarks.trim() || undefined,
          }
          : l
      )
    );
    toast.success("Line item updated successfully.");
    setEditingLineIndex(null);
  };

  const handleEditDraft = async (transfer: LotTransfer) => {
    try {
      setLoading(true);
      const full = await lotTransferService.getTransferById(transfer.id);
      setEditingTransferId(full.id);
      setEditingRequestNo(full.requestNo || transfer.requestNo || null);
      setFormBranchId(full.branchId);
      setTransferDate(full.transferDate ? full.transferDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setSourceLotId(full.sourceLotId);
      setTargetLotId(full.targetLotId);
      setReason(full.reason || "");

      // Fetch live stock for the source lot to ensure real available batch quantities are loaded
      let stockProducts: LotProductWithBatches[] = [];
      if (full.sourceLotId > 0) {
        try {
          stockProducts = await fetchLotProductsWithStock(full.sourceLotId);
        } catch {
          stockProducts = [];
        }
      }

      const batchStockMap = new Map<string, number>();
      stockProducts.forEach((p) => {
        p.batches.forEach((b) => {
          if (b.inventory_lot_id) {
            batchStockMap.set(`id_${b.inventory_lot_id}`, Number(b.available_quantity) || 0);
          }
          if (b.batch_no) {
            batchStockMap.set(
              `pb_${p.productId}_${String(b.batch_no).trim().toLowerCase()}`,
              Number(b.available_quantity) || 0
            );
          }
        });
      });

      const reconstitutedLines: LotTransferFormLine[] = (full.details || []).map((d: LotTransferDetail, i: number) => {
        const ext = d as LotTransferDetail & {
          uomName?: string;
          sourceOnHand?: number;
        };
        const ptId = d.productTypeId || null;
        const ptClassification = d.productClassification || (ptId === 389 ? "RM" : ptId === 388 ? "FG" : ptId === 390 ? "PKG" : "RM");

        const batchByInvId = d.sourceInventoryLotId ? batchStockMap.get(`id_${d.sourceInventoryLotId}`) : undefined;
        const batchByProdAndNo = d.productId && d.sourceBatchNo
          ? batchStockMap.get(`pb_${d.productId}_${String(d.sourceBatchNo).trim().toLowerCase()}`)
          : undefined;
        const liveSourceOnHand =
          batchByInvId !== undefined
            ? batchByInvId
            : batchByProdAndNo !== undefined
            ? batchByProdAndNo
            : (ext.sourceOnHand && ext.sourceOnHand > 0 ? ext.sourceOnHand : Number(d.quantity) || 0);

        return {
          lineNo: d.lineNo || i + 1,
          productId: d.productId,
          productName: d.productName || "-",
          productCode: d.productCode || "-",
          productDescription: d.productDescription || "-",
          uomName: ext.uomName || full.unitName || "",
          productTypeId: ptId,
          productTypeName: d.productTypeName,
          productClassification: ptClassification,
          sourceInventoryLotId: d.sourceInventoryLotId,
          sourceBatchNo: d.sourceBatchNo,
          sourceOnHand: liveSourceOnHand,
          sourceExpiryDate: d.sourceExpiryDate,
          sourceManufacturingDate: d.sourceManufacturingDate,
          sourceUnitCost: d.sourceUnitCost,
          targetBatchNo: d.targetBatchNo || d.sourceBatchNo,
          quantity: Number(d.quantity) || 0,
          lineRemarks: d.lineRemarks,
        };
      });

      let resolvedTypeId: number | null = full.productTypeId || transfer.productTypeId || null;
      if (!resolvedTypeId && full.details && full.details.length > 0) {
        resolvedTypeId = full.details[0].productTypeId || null;
      }
      if (!resolvedTypeId && reconstitutedLines.length > 0) {
        const lineWithPt = reconstitutedLines.find((l) => l.productTypeId);
        if (lineWithPt) resolvedTypeId = lineWithPt.productTypeId || null;
      }
      if (!resolvedTypeId && reconstitutedLines.length > 0) {
        const firstLine = reconstitutedLines[0];
        const classification = resolveProductClassification(
          firstLine.productClassification || firstLine.productTypeName || firstLine.productDescription || firstLine.productName
        );
        if (classification.code === "RM") resolvedTypeId = 389;
        else if (classification.code === "FG") resolvedTypeId = 388;
        else if (classification.code === "PKG") resolvedTypeId = 390;
      }

      setFormProductTypeId(resolvedTypeId);
      if (full.branchId && resolvedTypeId) {
        loadLotsForBranch(full.branchId, resolvedTypeId);
      }

      setLines(reconstitutedLines);
      setViewState("create");
      toast.info(`Draft transfer ${full.requestNo} loaded for editing.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load draft for editing.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCancelDraft = async () => {
    if (!cancellingDraft) return;
    try {
      setCancelling(true);
      await lotTransferService.cancelTransfer(
        cancellingDraft.id,
        cancelReason.trim() || "Draft cancelled by user."
      );
      setCancellingDraft(null);
      setCancelReason("");
      if (editingTransferId === cancellingDraft.id) {
        resetForm();
      }
      loadTransfers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel draft.");
    } finally {
      setCancelling(false);
    }
  };

  const handleSave = async (submitAfter: boolean) => {
    if (!formBranchId) {
      toast.error("Please select a valid active Branch first.");
      return;
    }
    if (!formProductTypeId) {
      toast.error("Please select a Product Classification in Step 1.");
      return;
    }
    if (!sourceLotId || !targetLotId) {
      toast.error("Both Source and Destination Storage Lots must be selected.");
      return;
    }
    if (sourceLotId === targetLotId) {
      toast.error("Source and Destination Lots must be different.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please enter a valid transfer reason.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Please add at least one line item to transfer.");
      return;
    }

    const invalidQtyLine = lines.find(
      (l) => !l.quantity || Number(l.quantity) <= 0 || isNaN(Number(l.quantity))
    );
    if (invalidQtyLine) {
      toast.error(
        `Invalid quantity for batch ${invalidQtyLine.sourceBatchNo || `Line #${invalidQtyLine.lineNo}`}. Quantity must be strictly greater than zero.`
      );
      return;
    }

    const overStockLine = lines.find(
      (l) => Number(l.quantity) > Number(l.sourceOnHand)
    );
    if (overStockLine) {
      toast.error(
        `Transfer quantity (${overStockLine.quantity}) exceeds available stock (${overStockLine.sourceOnHand}) for batch ${overStockLine.sourceBatchNo}.`
      );
      return;
    }

    const emptyTargetLine = lines.find((l) => !l.targetBatchNo || !l.targetBatchNo.trim());
    if (emptyTargetLine) {
      toast.error(
        `Target batch number is missing for batch ${emptyTargetLine.sourceBatchNo || `Line #${emptyTargetLine.lineNo}`}.`
      );
      return;
    }

    const targetBatchNos = lines.map((l) => l.targetBatchNo.trim().toLowerCase());
    const duplicateTarget = targetBatchNos.find((tb, i) => targetBatchNos.indexOf(tb) !== i);
    if (duplicateTarget) {
      toast.error(
        `Duplicate target batch number "${duplicateTarget}" detected in transfer lines.`
      );
      return;
    }

    if (uomMismatch) {
      toast.error(uomMismatch);
      return;
    }
    if (capacityWarning) {
      toast.error(capacityWarning);
      return;
    }

    setSubmitting(true);
    setSubmittingAction(submitAfter ? "submit" : "draft");
    const toastId = toast.loading(
      submitAfter
        ? "Submitting transfer request for posting..."
        : "Saving transfer draft..."
    );

    try {
      const payload: LotTransferFormValues = {
        branchId: formBranchId,
        productTypeId: formProductTypeId,
        productTypeName: selectedProductType?.name,
        transferDate,
        sourceLotId,
        targetLotId,
        reason: reason.trim(),
        lines,
      };

      if (editingTransferId) {
        await lotTransferService.updateTransfer(
          editingTransferId,
          payload,
          submitAfter ? "Submitted" : "Draft"
        );
        toast.success(
          submitAfter
            ? "Lot transfer updated & submitted for posting!"
            : "Lot transfer draft updated successfully!",
          { id: toastId }
        );
      } else {
        await lotTransferService.createTransfer(
          payload,
          submitAfter ? "Submitted" : "Draft"
        );
        toast.success(
          submitAfter
            ? "Lot transfer submitted for posting!"
            : "Lot transfer draft saved successfully!",
          { id: toastId }
        );
      }
      resetForm();
      setViewState("list");
      loadTransfers();
    } catch {
      toast.dismiss(toastId);
    } finally {
      setSubmitting(false);
      setSubmittingAction(null);
    }
  };

  const handleSubmitDraft = async (id: number) => {
    setSubmittingDraftId(id);
    const toastId = toast.loading("Submitting transfer request for posting...");
    try {
      await lotTransferService.submitTransfer(id);
      toast.success("Transfer submitted for posting!", { id: toastId });
      loadTransfers();
    } catch {
      toast.dismiss(toastId);
    } finally {
      setSubmittingDraftId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 max-w-7xl mx-auto w-full min-h-0">
      <AnimatePresence mode="wait">
        {/* View: CREATE TRANSFER */}
        {viewState === "create" && (
          <motion.div
            key="create"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      resetForm();
                      setViewState("list");
                    }}
                    className="gap-1 h-8 px-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <h1 className="text-xl font-bold tracking-tight">
                    {editingTransferId ? `Edit Lot Transfer Request ${editingRequestNo ? editingRequestNo : `#${editingTransferId}`}` : "Create Lot Transfer Request"}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 ml-8">
                  Transfer batch inventory between internal storage lots with FEFO/FIFO validation.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSave(false)}
                  disabled={submitting}
                  className="gap-1.5 min-w-[130px]"
                >
                  {submittingAction === "draft" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      {editingTransferId ? "Updating Draft..." : "Saving Draft..."}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingTransferId ? "Update Draft" : "Save as Draft"}
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleSave(true)}
                  disabled={submitting}
                  className="gap-1.5 min-w-[200px]"
                >
                  {submittingAction === "submit" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting for Posting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit for Posting
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* STEP 1: OPERATING SCOPE - BRANCH & PRODUCT TYPE SELECTION */}
            <div className="p-5 border-2 border-primary/20 rounded-xl bg-card shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Step 1: Select Active Branch & Product Classification *
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Define the operating facility and product category. Transfers are strictly scoped to a single product classification with FEFO/FIFO rule enforcement.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedBranch && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Active Branch
                    </Badge>
                  )}
                  {selectedProductType && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] gap-1 ${selectedProductType.name.toLowerCase().includes("packaging")
                          ? "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400"
                          : "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400"
                        }`}
                    >
                      {selectedProductType.name.toLowerCase().includes("packaging") ? (
                        <>
                          <Calendar className="w-3 h-3 text-blue-600" />
                          FIFO (First In, First Out)
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-amber-600" />
                          FEFO (First Expired, First Out)
                        </>
                      )}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Branch Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                    Active Branch *
                  </label>
                  <SearchableSelect
                    options={branchOptions}
                    value={formBranchId}
                    onChange={(val) => handleBranchChange(Number(val))}
                    placeholder={loadingBranches ? "Loading active branches..." : "Select a branch"}
                    disabled={loadingBranches || submitting}
                  />
                  <span className="text-[11px] text-muted-foreground block">
                    Available storage lots and batch inventories are strictly scoped to this facility.
                  </span>
                </div>

                {/* Product Type Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-primary" />
                    Product Type / Classification *
                  </label>
                  <SearchableSelect
                    options={productTypeOptions}
                    value={formProductTypeId}
                    onChange={(val) => handleProductTypeChange(Number(val))}
                    placeholder={loadingProductTypes ? "Loading product types..." : "Select a product type"}
                    disabled={loadingProductTypes || submitting}
                  />
                  <span className="text-[11px] text-muted-foreground block">
                    {selectedProductType?.name.toLowerCase().includes("packaging")
                      ? "Packaging materials follow FIFO (earliest receipt date first)."
                      : "Raw materials and finished goods enforce FEFO (nearest expiry first)."}
                  </span>
                </div>

                {/* Transfer Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    Transfer Date *
                  </label>
                  <Input
                    type="date"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    disabled={submitting}
                    className="h-9"
                  />
                  <span className="text-[11px] text-muted-foreground block">
                    Scheduled execution date for this storage lot transfer.
                  </span>
                </div>
              </div>
            </div>

            {/* STEP 2: Storage Lots */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source Lot */}
              <div className="p-4 border rounded-xl bg-card shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    Source Lot *
                  </label>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                    Origin
                  </Badge>
                </div>
                <SearchableSelect
                  options={sourceLotOptions.filter((opt) => opt.value !== targetLotId)}
                  value={sourceLotId}
                  onChange={(val) => {
                    const newSourceId = Number(val);
                    setSourceLotId(newSourceId);
                    const newSource = lots.find((l) => l.lot_id === newSourceId);
                    if (targetLotId === newSourceId) {
                      setTargetLotId(null);
                    }
                    if (targetLot && newSource?.unit_id && targetLot.unit_id && newSource.unit_id !== targetLot.unit_id) {
                      setTargetLotId(null);
                      toast.warning("Destination lot reset because its UOM is incompatible with the selected source lot.");
                    }
                    if (lines.length > 0) {
                      setLines([]);
                      toast.info("Line items cleared due to source lot change.");
                    }
                  }}
                  placeholder={loadingLots ? "Loading lots..." : !formBranchId ? "Select a branch first" : "Select source lot..."}
                  emptyText="No storage lots with available batches to move."
                  disabled={loadingLots || !formBranchId}
                />
                {sourceLot && (
                  (() => {
                    const stats = lotBatchStats[sourceLot.lot_id];
                    const unitLabel = sourceLot.unit_name || stats?.unitName || "";
                    const totalOccupancy = stats?.totalOccupancy || 0;
                    const maxCap = (stats?.maxCapacity && stats.maxCapacity > 0) ? stats.maxCapacity : (sourceLot.max_batch_capacity || 0);
                    const maxCapLabel = maxCap > 0 ? maxCap.toLocaleString() : "∞";
                    const batchesToMove = stats?.matchingBatchesToMove || 0;
                    const batchText = `${batchesToMove} ${batchesToMove === 1 ? "batch" : "batches"} to move`;
                    const projectedOccupancy = Math.max(0, totalOccupancy - totalTransferQty);

                    return (
                      <div className="space-y-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-medium bg-secondary/80 text-secondary-foreground"
                          >
                            Occupancy: {totalOccupancy.toLocaleString()}/{maxCapLabel} {unitLabel} • {batchText}
                          </Badge>
                        </div>

                        <div className="p-2.5 rounded-lg border bg-muted/30 text-xs space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <span>Result After Transfer</span>
                            <span className="font-mono text-foreground font-bold">
                              {lines.length > 0 ? `-${totalTransferQty.toLocaleString()} ${unitLabel}` : "No lines added"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-0.5">
                            <span className="text-muted-foreground">Resulting Occupancy:</span>
                            <span className="font-mono font-medium text-foreground">
                              {projectedOccupancy.toLocaleString()} / {maxCapLabel} {unitLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Target Lot */}
              <div className="p-4 border rounded-xl bg-card shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-primary" />
                    Destination Lot *
                  </label>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                    Destination
                  </Badge>
                </div>
                <SearchableSelect
                  options={targetLotOptions}
                  value={targetLotId}
                  onChange={(val) => setTargetLotId(Number(val))}
                  placeholder={
                    loadingLots
                      ? "Loading lots..."
                      : !formBranchId
                        ? "Select a branch first"
                        : !sourceLotId
                          ? "Select source lot first"
                          : targetLotOptions.length === 0
                            ? "No compatible destination lots found"
                            : "Select destination lot..."
                  }
                  disabled={loadingLots || !formBranchId || !sourceLotId}
                />
                {targetLot && (
                  (() => {
                    const max = targetLot.max_batch_capacity || 0;
                    const unitLabel = targetLot.unit_name || "";
                    const currentOccupancy = targetLotCurrentOccupied;
                    const maxCapLabel = max > 0 ? max.toLocaleString() : "∞";
                    const currentAvailable = max > 0 ? Math.max(0, max - currentOccupancy) : "∞";
                    const currentAvailableLabel = typeof currentAvailable === "number" ? currentAvailable.toLocaleString() : currentAvailable;
                    const projectedOccupancy = currentOccupancy + totalTransferQty;
                    const isExceeded = max > 0 && projectedOccupancy > max;

                    return (
                      <div className="space-y-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-medium bg-secondary/80 text-secondary-foreground"
                          >
                            Occupancy: {currentOccupancy.toLocaleString()}/{maxCapLabel} {unitLabel} • Available: {currentAvailableLabel} {unitLabel}
                          </Badge>
                        </div>

                        <div className={`p-2.5 rounded-lg border text-xs space-y-1 ${isExceeded ? "bg-destructive/10 border-destructive/30" : "bg-muted/30 border-border"
                          }`}>
                          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <span>Result After Transfer</span>
                            <span className={`font-mono font-bold ${isExceeded ? "text-destructive" : "text-foreground"}`}>
                              {lines.length > 0 ? `+${totalTransferQty.toLocaleString()} ${unitLabel}` : "No lines added"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-0.5">
                            <span className="text-muted-foreground">Resulting Occupancy:</span>
                            <span className={`font-mono font-medium ${isExceeded ? "text-destructive font-bold" : "text-foreground"}`}>
                              {projectedOccupancy.toLocaleString()} / {maxCapLabel} {unitLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
                {capacityWarning && (
                  <div className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {capacityWarning}
                  </div>
                )}
              </div>
            </div>
            {/* UOM Incompatibility Banner */}
            {uomMismatch && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uomMismatch}</span>
              </div>
            )}

            {/* Reason Field */}
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transfer Reason / Operational Justification *
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Relocation for production packaging, staging for work-center, inventory balancing"
                className="h-9 text-sm"
              />
            </div>

            {/* Lines Table Section */}
            <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
              <div className="p-4 flex items-center justify-between border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Transfer Line Items</h3>
                  <Badge variant="secondary">{lines.length} items</Badge>
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    if (!formBranchId) {
                      toast.warning("Please select a Branch first.");
                      return;
                    }
                    if (!formProductTypeId) {
                      toast.warning("Please select a Product Classification first.");
                      return;
                    }
                    if (!sourceLotId) {
                      toast.warning("Please select a Source Lot first.");
                      return;
                    }
                    if (!targetLotId) {
                      toast.warning("Please select a Destination Lot first.");
                      return;
                    }
                    if (uomMismatch) {
                      toast.error(uomMismatch);
                      return;
                    }
                    const stats = lotBatchStats[sourceLotId];
                    if (!stats || stats.matchingBatchesToMove === 0) {
                      toast.warning("The selected Source Lot has no matching batches to move for this product classification.");
                      return;
                    }
                    setBatchModalOpen(true);
                  }}
                  disabled={
                    !formBranchId ||
                    !formProductTypeId ||
                    !sourceLotId ||
                    !targetLotId ||
                    Boolean(uomMismatch) ||
                    (lotBatchStats[sourceLotId || 0]?.matchingBatchesToMove || 0) === 0
                  }
                  className="gap-1.5 h-8 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Batch to Transfer
                </Button>
              </div>

              {lines.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="py-12 text-center text-muted-foreground space-y-2"
                >
                  <Layers className="w-8 h-8 mx-auto opacity-30" />
                  <p className="text-sm">No batches added to this transfer yet.</p>
                  <p className="text-xs text-muted-foreground/75">
                    Select branch and storage lots above, then click &ldquo;Add Batch to Transfer&rdquo;.
                  </p>
                </motion.div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-12 text-center" title="Line Number">#</TableHead>
                      <TableHead className="min-w-[220px]" title="Product Name / SKU">Product</TableHead>
                      <TableHead className="w-32" title="Batch Number">Batch #</TableHead>
                      <TableHead className="w-24" title="Manufacturing Date">Mfg Date</TableHead>
                      <TableHead className="w-24" title="Expiration Date">Expiry Date</TableHead>
                      <TableHead className="w-24 text-right" title="Available Stock in Source Lot">Available</TableHead>
                      <TableHead className="w-28 text-right" title="Quantity to Transfer">Transfer Qty</TableHead>
                      <TableHead className="max-w-[180px]" title="Remarks">Remarks</TableHead>
                      <TableHead className="w-12 text-center" title="Action"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {lines.map((line, idx) => {
                        const pDesc = line.productDescription ? line.productDescription.trim() : "";
                        const pName = line.productName && line.productName !== "-" ? line.productName.trim() : "";
                        const pCode = line.productCode && line.productCode !== "-" ? line.productCode.trim() : "";
                        const primaryTitle = pName || pDesc || (line.productId ? `Product #${line.productId}` : "-");
                        const showSecondaryDesc = Boolean(pDesc && pDesc.toLowerCase() !== primaryTitle.toLowerCase());
                        const mfgDate = line.sourceManufacturingDate ? String(line.sourceManufacturingDate).slice(0, 10) : "-";
                        const expDate = line.sourceExpiryDate ? String(line.sourceExpiryDate).slice(0, 10) : "-";
                        const lineRemarks = line.lineRemarks || "-";

                        return (
                          <motion.tr
                            key={line.sourceInventoryLotId || idx}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -16 }}
                            transition={{ duration: 0.22 }}
                            className="border-b transition-colors hover:bg-muted/30"
                          >
                            <TableCell className="text-center font-mono text-xs text-muted-foreground" title={`Line ${idx + 1}`}>
                              {idx + 1}
                            </TableCell>
                            <TableCell className="min-w-[220px] max-w-[280px]" title={primaryTitle}>
                              <div className="font-semibold text-sm leading-snug text-foreground">
                                {primaryTitle}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {showSecondaryDesc && <span className="truncate max-w-[160px]">{pDesc}</span>}
                                {pCode && <span className="font-mono text-[11px]">{pCode}</span>}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs font-semibold whitespace-nowrap" title={line.sourceBatchNo || line.targetBatchNo || "-"}>
                              {line.sourceBatchNo || line.targetBatchNo || "-"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={mfgDate}>
                              {mfgDate}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={expDate}>
                              {expDate}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap" title={`${formatNumberTruncated(line.sourceOnHand)} ${line.uomName || "-"}`}>
                              {formatNumberTruncated(line.sourceOnHand)} {line.uomName || "-"}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap" title={`${formatNumberTruncated(line.quantity)} ${line.uomName || ""}`}>
                              <span className="font-mono text-sm font-semibold text-foreground">
                                {formatNumberTruncated(line.quantity)}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1 font-normal">
                                {line.uomName || ""}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={lineRemarks}>
                              {lineRemarks}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleStartEditLine(idx)}
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  title="Edit batch line"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  title="Remove batch line"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Batch Selector Modal */}
            {formBranchId && formProductTypeId && sourceLotId && targetLotId && (
              <LotBatchSelectionModal
                open={batchModalOpen}
                onOpenChange={setBatchModalOpen}
                branchId={formBranchId}
                productTypeId={formProductTypeId}
                productTypeName={selectedProductType?.name}
                sourceLotId={sourceLotId}
                sourceLotName={sourceLot?.lot_name}
                targetLotId={targetLotId}
                targetLotName={targetLot?.lot_name}
                targetMaxCapacity={targetLot?.max_batch_capacity}
                targetCurrentStock={targetLotCurrentOccupied}
                targetUomName={targetLot?.unit_name}
                existingLines={lines}
                onAddLine={handleAddLine}
              />
            )}
          </motion.div>
        )}

        {/* View: LIST TRANSFERS */}
        {viewState === "list" && (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-4"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Lot Transfer Requests</h1>
                <p className="text-sm text-muted-foreground">
                  Manage, draft, and track batch transfers across manufacturing storage lots.
                </p>
              </div>

              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={() => {
                    resetForm();
                    setViewState("create");
                  }}
                  className="gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Transfer Request
                </Button>
              </motion.div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-3">
                {/* Branch Filter (Active branches only) */}
                <div className="w-56 shrink-0">
                  <SearchableSelect
                    options={[
                      { value: 0, label: "All Active Branches" },
                      ...branchOptions,
                    ]}
                    value={filterBranchId || 0}
                    onChange={(val) => setFilterBranchId(Number(val) > 0 ? Number(val) : null)}
                    placeholder="Select a branch..."
                    triggerClassName="h-9"
                  />
                </div>

                {/* Source Lot Filter */}
                <div className="w-48 shrink-0">
                  <SearchableSelect
                    options={sourceLotFilterOptions}
                    value={filterSourceLotId}
                    onChange={(val) => {
                      if (val === "ALL") {
                        setFilterSourceLotId("ALL");
                      } else {
                        const num = Number(val);
                        setFilterSourceLotId(Number.isNaN(num) ? "ALL" : num);
                      }
                    }}
                    placeholder="All Source Lots"
                    triggerClassName="h-9"
                  />
                </div>

                {/* Target Lot Filter */}
                <div className="w-48 shrink-0">
                  <SearchableSelect
                    options={targetLotFilterOptions}
                    value={filterTargetLotId}
                    onChange={(val) => {
                      if (val === "ALL") {
                        setFilterTargetLotId("ALL");
                      } else {
                        const num = Number(val);
                        setFilterTargetLotId(Number.isNaN(num) ? "ALL" : num);
                      }
                    }}
                    placeholder="All Target Lots"
                    triggerClassName="h-9"
                  />
                </div>

                {/* Date Range Preset Selector */}
                <div className="w-36 shrink-0">
                  <select
                    value={datePreset}
                    onChange={(e) => setDatePreset(e.target.value as typeof datePreset)}
                    className="w-full h-9 px-3 border rounded-md text-xs bg-background font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                    title="Filter by Transfer Date"
                  >
                    <option value="ALL">All Dates</option>
                    <option value="TODAY">Today</option>
                    <option value="THIS_WEEK">This Week</option>
                    <option value="THIS_MONTH">This Month</option>
                    <option value="CUSTOM">Custom Range</option>
                  </select>
                </div>

                {/* Status Selector */}
                <div className="w-36 shrink-0">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full h-9 px-3 border rounded-md text-xs bg-background font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                     
                    <option value="Posted">Posted</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Reversed">Reversed</option>
                  </select>
                </div>

                {/* Search Bar */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search request #, reason, batch..."
                    className="pl-9 h-9 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetFilters}
                      className="h-9 text-xs text-muted-foreground hover:text-foreground"
                      title="Reset all filters"
                    >
                      Reset
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={loadTransfers}
                    disabled={loading}
                    className="h-9 w-9"
                    title="Refresh transfers"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              {/* Custom Date Range Inputs (when datePreset === 'CUSTOM') */}
              {datePreset === "CUSTOM" && (
                <div className="flex items-center gap-2 text-xs bg-muted/40 p-2 rounded-lg border w-fit">
                  <span className="font-medium text-muted-foreground">From:</span>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 w-36 text-xs bg-background"
                  />
                  <span className="font-medium text-muted-foreground">To:</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 w-36 text-xs bg-background"
                  />
                </div>
              )}
            </div>

            {/* Transfers Table */}
            <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead
                      className="min-w-[175px] whitespace-nowrap cursor-pointer select-none"
                      onClick={() => handleSort("requestNo")}
                      title="Transfer Request Number, Date & Branch"
                    >
                      Request & Details {renderSortIcon("requestNo")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("status")}
                      title="Workflow Status"
                    >
                      Status {renderSortIcon("status")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("sourceLot")}
                      title="Originating Storage Lot"
                    >
                      Source Lot {renderSortIcon("sourceLot")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("targetLot")}
                      title="Receiving Storage Lot"
                    >
                      Target Lot {renderSortIcon("targetLot")}
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => handleSort("quantity")}
                      title="Total Transfer Quantity & Lines"
                    >
                      Total Qty & Lines {renderSortIcon("quantity")}
                    </TableHead>
                    <TableHead title="Transfer Reason / Operational Justification">Reason</TableHead>
                    <TableHead className="text-right min-w-[160px] whitespace-nowrap" title="Actions">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && transfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex flex-col items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto opacity-40 text-primary" />
                          <span>Loading lot transfers...</span>
                        </motion.div>
                      </TableCell>
                    </TableRow>
                  ) : displayedTransfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex flex-col items-center justify-center gap-1.5 py-4"
                        >
                          <Layers className="w-7 h-7 opacity-30 mx-auto" />
                          <span className="font-medium text-foreground">No lot transfer requests found.</span>
                          <span className="text-xs text-muted-foreground">
                            {hasActiveFilters
                              ? "No requests match your selected filter criteria."
                              : "Try adjusting your branch, status filter, or search query."}
                          </span>
                        </motion.div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <AnimatePresence mode="popLayout" initial={false}>
                      {paginatedTransfers.map((item, idx) => {
                        const branchDisplay = item.branchName && item.branchName !== "-" ? item.branchName : item.branchId ? `Branch #${item.branchId}` : "-";
                        const sourceLotDisplay = item.sourceLotName && item.sourceLotName !== "-" ? item.sourceLotName : "-";
                        const targetLotDisplay = item.targetLotName && item.targetLotName !== "-" ? item.targetLotName : "-";
                        const lineCount = item.lineCount || item.details?.length || 1;

                        return (
                          <motion.tr
                            key={`${listAnimKey}-${item.id}`}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{
                              duration: 0.22,
                              delay: Math.min(idx * 0.035, 0.35),
                              ease: "easeOut",
                            }}
                            className="hover:bg-muted/40 transition-colors border-b"
                          >
                            <TableCell className="min-w-[175px] whitespace-nowrap" title={`${item.requestNo} • ${item.transferDate} • ${branchDisplay}`}>
                              <div className="font-mono font-bold text-xs text-foreground tracking-tight">
                                {item.requestNo}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                                <span className="font-mono">{item.transferDate}</span>
                                <span className="text-muted-foreground/50">•</span>
                                <span className="truncate max-w-[140px] font-medium" title={branchDisplay}>{branchDisplay}</span>
                              </div>
                            </TableCell>
                            <TableCell title={`Status: ${item.status}`}>
                              <TransferStatusBadge status={item.status} />
                            </TableCell>
                            <TableCell title={`Source Lot: ${sourceLotDisplay}`}>
                              <span className="text-xs font-semibold text-foreground">{sourceLotDisplay}</span>
                            </TableCell>
                            <TableCell title={`Target Lot: ${targetLotDisplay}`}>
                              <span className="text-xs font-semibold text-foreground">{targetLotDisplay}</span>
                            </TableCell>
                            <TableCell className="text-right" title={`${item.quantity.toLocaleString()} total units across ${lineCount} line(s)`}>
                              <div className="font-mono font-bold text-xs text-foreground">
                                {item.quantity.toLocaleString()}
                              </div>
                              <div className="text-[11px] font-mono text-muted-foreground">
                                {lineCount} {lineCount === 1 ? "line" : "lines"}
                              </div>
                            </TableCell>
                            <TableCell title={item.reason || "No operational justification provided"}>
                              <div className="text-xs text-muted-foreground max-w-[220px] truncate">
                                {item.reason || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                {item.status === "Draft" ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditDraft(item)}
                                      className="h-8 text-xs gap-1"
                                      title="Edit draft request"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                      Edit
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setCancellingDraft(item);
                                        setCancelReason("");
                                      }}
                                      className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                                      title="Cancel draft request"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      Cancel
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleSubmitDraft(item.id)}
                                      disabled={submittingDraftId === item.id}
                                      className="h-8 text-xs gap-1 text-primary hover:text-primary"
                                      title="Submit for posting"
                                    >
                                      {submittingDraftId === item.id ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          Submitting...
                                        </>
                                      ) : (
                                        <>
                                          <Send className="w-3.5 h-3.5" />
                                          Submit
                                        </>
                                      )}
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        setLoading(true);
                                        const full = await lotTransferService.getTransferById(item.id);
                                        setActiveTransfer(full);
                                        setViewState("view");
                                      } catch {
                                        setActiveTransfer(item);
                                        setViewState("view");
                                      } finally {
                                        setLoading(false);
                                      }
                                    }}
                                    className="h-8 text-xs gap-1"
                                    title="View transfer details"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    View
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {transfers.length > 0 && (
                <div className="p-3 sm:p-4 border-t border-border bg-muted/5 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                      Showing{" "}
                      <span className="font-bold text-foreground">
                        {Math.min(itemsPerPage * (safeCurrentPage - 1) + 1, totalItems)}
                      </span>{" "}
                      to{" "}
                      <span className="font-bold text-foreground">
                        {Math.min(itemsPerPage * safeCurrentPage, totalItems)}
                      </span>{" "}
                      of <span className="font-bold text-foreground">{totalItems}</span> requests
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Show</span>
                      <Select
                        value={String(itemsPerPage)}
                        onValueChange={(v) => {
                          setItemsPerPage(Number(v));
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="h-8 min-w-[72px] w-auto px-2.5 text-xs font-semibold border-border bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[10, 20, 50, 100].map((s) => (
                            <SelectItem key={s} value={String(s)} className="text-xs font-medium">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {totalPages > 1 && (
                    <Pagination className="w-auto mx-0 justify-end">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage((p) => Math.max(1, p - 1));
                            }}
                            className={safeCurrentPage === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                          />
                        </PaginationItem>

                        {buildPageList(safeCurrentPage, totalPages).map((p, i) =>
                          p === "ellipsis" ? (
                            <PaginationItem key={`ellipsis-${i}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          ) : (
                            <PaginationItem key={p}>
                              <PaginationLink
                                href="#"
                                isActive={p === safeCurrentPage}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setCurrentPage(p);
                                }}
                                className="cursor-pointer"
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          )
                        )}

                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage((p) => Math.min(totalPages, p + 1));
                            }}
                            className={safeCurrentPage === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* View: DETAIL VIEW */}
        {viewState === "view" && activeTransfer && (
          <motion.div
            key="view"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveTransfer(null);
                    setViewState("list");
                  }}
                  className="gap-1.5 h-8 px-2.5 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Requests
                </Button>
                <div className="h-4 w-[1px] bg-border hidden sm:block" />
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Transfer {activeTransfer.requestNo}
                </h1>
                <TransferStatusBadge status={activeTransfer.status} />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPrintTransfer(activeTransfer);
                    setPrintModalOpen(true);
                  }}
                  className="gap-1.5 h-9 px-3 text-xs"
                  title="Print lot transfer slip"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Slip
                </Button>

                {activeTransfer.status === "Draft" && (
                  <Button
                    onClick={() => {
                      handleSubmitDraft(activeTransfer.id);
                      setViewState("list");
                    }}
                    disabled={submittingDraftId === activeTransfer.id}
                    className="gap-1.5 min-w-[170px]"
                  >
                    {submittingDraftId === activeTransfer.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting for Approval...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit for Approval
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Workflow Stepper */}
            {(() => {
              const isCancelled = activeTransfer.status === "Cancelled";
              const isRejected = activeTransfer.status === "Rejected";

              if (isCancelled) {
                return (
                  <div className="p-4 border border-destructive/20 rounded-xl bg-destructive/5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                        <XCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                          Transfer Request Cancelled
                          <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                            Terminal State
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {activeTransfer.reason ? `Reason: ${activeTransfer.reason}` : "This transfer request has been cancelled and cannot proceed further."}
                        </p>
                      </div>
                    </div>
                    {activeTransfer.transferDate && (
                      <div className="text-[11px] text-muted-foreground font-mono self-end sm:self-center">
                        Target Date: {activeTransfer.transferDate}
                      </div>
                    )}
                  </div>
                );
              }

              const steps = [
                { label: "Draft", key: "Draft" },
                { label: "Submitted", key: "Submitted" },
                { label: "Posted", key: "Posted" },
              ];

              const statusMap: Record<string, number> = {
                Draft: 0,
                Submitted: 1,
                "Pending Approval": 1,
                Approved: 1,
                Posted: 2,
              };

              const activeStepIdx = isRejected
                ? 1
                : Math.min(statusMap[activeTransfer.status] ?? 0, steps.length - 1);

              return (
                <div className="p-4 border rounded-xl bg-card/60 shadow-sm">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Transfer Request Lifecycle
                  </div>
                  <div className="relative flex items-center justify-between max-w-2xl mx-auto px-4">
                    {/* Background Track Line & Active Progress Line */}
                    <div className="absolute left-8 right-8 top-[14px] -translate-y-1/2 h-1 bg-muted rounded-full overflow-hidden -z-0">
                      <div
                        className={`h-full ${isRejected ? "bg-destructive" : "bg-primary"} rounded-full transition-all duration-300`}
                        style={{
                          width: `${Math.min(Math.max((activeStepIdx / (steps.length - 1)) * 100, 0), 100)}%`,
                        }}
                      />
                    </div>

                    {steps.map((step, idx) => {
                      const isPassed = idx <= activeStepIdx;
                      const isCurrent = idx === activeStepIdx;

                      return (
                        <div
                          key={step.key}
                          className="relative z-10 flex flex-col items-center gap-1.5 bg-card px-2"
                        >
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all border ${
                              isRejected && isCurrent
                                ? "bg-destructive text-destructive-foreground border-destructive"
                                : isPassed
                                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                  : "bg-muted text-muted-foreground border-muted-foreground/30"
                            }`}
                          >
                            {isRejected && isCurrent ? (
                              <XCircle className="w-4 h-4" />
                            ) : isPassed ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                          <span
                            className={`text-xs font-medium ${
                              isCurrent
                                ? isRejected
                                  ? "text-destructive font-bold"
                                  : "text-primary font-bold"
                                : isPassed
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {isRejected && isCurrent ? "Rejected" : step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Header Summary KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div className="p-3.5 border rounded-xl bg-card shadow-sm space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  Branch & Date
                </div>
                <div className="font-bold text-sm text-foreground mt-1 truncate" title={activeTransfer.branchName || "-"}>
                  {activeTransfer.branchName && activeTransfer.branchName !== "-"
                    ? activeTransfer.branchName
                    : activeTransfer.branchId
                      ? `Branch #${activeTransfer.branchId}`
                      : "-"}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 whitespace-nowrap">
                  <Calendar className="w-3 h-3" />
                  <span>Target Date: {activeTransfer.transferDate}</span>
                </div>
              </div>

              <div className="p-3.5 border rounded-xl bg-card shadow-sm space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  Source Lot
                </div>
                <div className="font-bold text-sm text-foreground mt-1 truncate" title={activeTransfer.sourceLotName || "-"}>
                  {activeTransfer.sourceLotName || "-"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Originating storage lot
                </div>
              </div>

              <div className="p-3.5 border rounded-xl bg-card shadow-sm space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  Destination Lot
                </div>
                <div className="font-bold text-sm text-foreground mt-1 truncate" title={activeTransfer.targetLotName || "-"}>
                  {activeTransfer.targetLotName || "-"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Receiving storage lot
                </div>
              </div>

              <div className="p-3.5 border rounded-xl bg-card shadow-sm space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <Boxes className="w-3.5 h-3.5 text-primary" />
                  Line Items
                </div>
                <div className="font-bold text-lg text-foreground mt-0.5 font-mono">
                  {activeTransfer.details?.length || 0} <span className="text-xs font-normal text-muted-foreground">SKU Line(s)</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Batches in transfer
                </div>
              </div>

              <div className="p-3.5 border rounded-xl bg-card shadow-sm space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Total Transfer Qty
                </div>
                <div className="font-bold text-lg text-primary mt-0.5 font-mono">
                  {(
                    activeTransfer.details?.reduce(
                      (acc, item) => acc + (Number(item.quantity) || 0),
                      0
                    ) || 0
                  ).toLocaleString()}{" "}
                  <span className="text-xs font-normal text-muted-foreground">Units</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Net volume to move
                </div>
              </div>
            </div>

            {/* Reason Card */}
            {activeTransfer.reason && (
              <div className="p-4 border rounded-xl bg-card shadow-sm space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Transfer Reason / Justification
                </div>
                <div className="text-sm text-foreground">{activeTransfer.reason}</div>
              </div>
            )}

            {/* Details Table */}
            <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
              <div className="p-3 border-b bg-muted/20 flex items-center justify-between font-semibold text-sm">
                <span>Transfer Line Details ({activeTransfer.details?.length || 0})</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-12 text-center" title="Line Number">#</TableHead>
                    <TableHead title="Product Name / Description / SKU">Product & SKU</TableHead>
                    <TableHead title="Batch Number">Batch #</TableHead>
                    <TableHead className="text-right" title="Quantity">Quantity</TableHead>
                    <TableHead title="Manufacturing & Expiry Dates">Dates (Mfg / Expiry)</TableHead>
                    <TableHead title="Remarks">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTransfer.details?.map((d, i) => {
                    const pDesc = d.productDescription;
                    const pName = d.productName && d.productName !== "-" ? d.productName : "";
                    const pCode = d.productCode && d.productCode !== "-" ? d.productCode : "";
                    const primaryTitle = pDesc || pName || (d.productId ? `Product #${d.productId}` : "-");
                    const mfgDate = d.sourceManufacturingDate ? String(d.sourceManufacturingDate).slice(0, 10) : "-";
                    const expDate = d.sourceExpiryDate ? String(d.sourceExpiryDate).slice(0, 10) : "-";
                    const lineRemarks = d.lineRemarks || "-";

                    return (
                      <TableRow key={d.detailId || i} className="hover:bg-muted/20">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground" title={`Line ${d.lineNo || i + 1}`}>
                          {d.lineNo || i + 1}
                        </TableCell>
                        <TableCell title={primaryTitle}>
                          <div className="font-semibold text-sm leading-tight text-foreground">
                            {primaryTitle}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            {pDesc && pName && <span>{pName}</span>}
                            {pCode && <span className="font-mono text-[11px]">Code: {pCode}</span>}
                          </div>
                        </TableCell>
                        <TableCell title={`Batch: ${d.sourceBatchNo || d.targetBatchNo || "-"}`}>
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {d.sourceBatchNo || d.targetBatchNo || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold text-foreground" title={String(d.quantity)}>
                          {formatNumberTruncated(d.quantity)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <div><span className="font-semibold text-foreground">Mfg:</span> {mfgDate}</div>
                            <div><span className="font-semibold text-foreground">Exp:</span> {expDate}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={lineRemarks}>
                          {lineRemarks}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lot Transfer Print Slip Modal */}
      <LotTransferPrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        transfer={printTransfer || activeTransfer}
      />

      {/* Line Item Edit Dialog */}
      <Dialog
        open={editingLineIndex !== null}
        onOpenChange={(open) => {
          if (!open) setEditingLineIndex(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Edit Transfer Line Item
            </DialogTitle>
            <DialogDescription className="text-xs">
              Modify the quantity, target batch number, or line remarks for this batch.
            </DialogDescription>
          </DialogHeader>

          {editingLineIndex !== null && lines[editingLineIndex] && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-semibold text-foreground">
                    {lines[editingLineIndex].productName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source Batch:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {lines[editingLineIndex].sourceBatchNo}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available Stock:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {lines[editingLineIndex].sourceOnHand.toLocaleString()} {lines[editingLineIndex].uomName || ""}
                  </span>
                </div>
              </div>

              {(() => {
                const line = lines[editingLineIndex];
                const otherLinesQty = lines.reduce(
                  (sum, l, idx) => (idx === editingLineIndex ? sum : sum + (Number(l.quantity) || 0)),
                  0
                );
                const hasCap = Boolean(targetLot && targetLot.max_batch_capacity > 0);
                const lotLimit = hasCap
                  ? Math.max(0, (targetLot?.max_batch_capacity || 0) - targetLotCurrentOccupied - otherLinesQty)
                  : null;
                const maxTransfer = lotLimit !== null ? Math.min(line.sourceOnHand, lotLimit) : line.sourceOnHand;

                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">
                        Transfer Quantity *
                      </label>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Max: {maxTransfer.toLocaleString()} {line.uomName || ""}
                        {lotLimit !== null && lotLimit < line.sourceOnHand && (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1">
                            (lot limit: {lotLimit.toLocaleString()})
                          </span>
                        )}
                      </span>
                    </div>
                    <RowQuantityInput
                      value={editLineQty}
                      onChange={setEditLineQty}
                      max={maxTransfer}
                      min={0.0001}
                      placeholder="Enter transfer quantity"
                      className="bg-card text-sm"
                    />
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Target Batch Number *
                  </label>
                  <span className="text-[11px] text-muted-foreground/70 font-mono">
                    Retains source batch
                  </span>
                </div>
                <Input
                  value={editLineTargetBatch}
                  readOnly
                  disabled
                  placeholder="Destination batch #"
                  className="h-8 font-mono text-sm bg-muted/50 cursor-not-allowed opacity-80"
                  title="Target batch number is retained from source batch."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Line Remarks <span className="font-normal text-muted-foreground">(Optional)</span>
                </label>
                <Input
                  value={editLineRemarks}
                  onChange={(e) => setEditLineRemarks(e.target.value)}
                  placeholder="e.g. Relocating near packaging line"
                  className="h-8 text-sm bg-card"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingLineIndex(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEditLine}
              className="gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Draft Confirmation Dialog */}
      <Dialog
        open={cancellingDraft !== null}
        onOpenChange={(open) => {
          if (!open) setCancellingDraft(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Cancel Draft Transfer Request
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to cancel draft transfer request{" "}
              <strong>{cancellingDraft?.requestNo}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-foreground">
              Cancellation Reason <span className="font-normal text-muted-foreground">(Optional)</span>
            </label>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Request created by mistake or superseded"
              className="h-8 text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancellingDraft(null)}
              disabled={cancelling}
            >
              Back
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmCancelDraft}
              disabled={cancelling}
              className="gap-1.5"
            >
              {cancelling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  Confirm Cancel
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default LotTransferRequestModule;

