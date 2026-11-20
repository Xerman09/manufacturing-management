"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Save, AlertTriangle, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  DispatchMasterData,
  DispatchPlanDetail,
  EligibleSalesOrder,
  UnifiedRouteStop,
} from "../../shared.types";
import {
  fetchEligibleSalesOrders,
  updateDispatchPlan,
} from "../services/dispatch-plan-creation-api";
import {
  formatCurrency,
  formatDateTime,
  getDispatchStatusBadgeStyle,
  toDateTimeLocalValue,
} from "../../shared.utils";
import { SalesOrderInvoicePanel } from "./SalesOrderInvoicePanel";
import { TripConfigPanel, type TripConfigFormValues } from "./TripConfigPanel";
import { BudgetSection, type BudgetRowDraft } from "./BudgetSection";
import { RouteSequencePanel } from "./RouteSequencePanel";

interface DispatchPlanEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: DispatchPlanDetail | null;
  masterData: DispatchMasterData;
  onSuccess: () => void;
}

export const DispatchPlanEditModal: React.FC<DispatchPlanEditModalProps> = ({
  open,
  onOpenChange,
  plan,
  masterData,
  onSuccess,
}) => {
  const [eligibleOrders, setEligibleOrders] = useState<EligibleSalesOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [unifiedStops, setUnifiedStops] = useState<UnifiedRouteStop[]>([]);
  const [config, setConfig] = useState<TripConfigFormValues>({
    branch_id: null,
    vehicle_id: 0,
    driver_id: null,
    helper_id: null,
    departure_date: "",
    arrival_date: "",
    remarks: "",
  });
  const [budgetRows, setBudgetRows] = useState<BudgetRowDraft[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hydrate form from plan whenever opened
  useEffect(() => {
    if (open && plan) {
      const vId = plan.vehicle_id !== undefined && plan.vehicle_id !== null ? Number(plan.vehicle_id) : 0;

      setConfig({
        branch_id: plan.branch_id,
        vehicle_id: vId,
        driver_id: plan.driver_id,
        helper_id: plan.helper_id,
        departure_date: toDateTimeLocalValue(plan.departure_date),
        arrival_date: toDateTimeLocalValue(plan.arrival_date),
        remarks: plan.remarks || "",
      });

      const initialOrderIds = plan.sales_orders.map((s) => s.sales_order_id);
      setSelectedOrderIds(initialOrderIds);

      // Hydrate stops from plan
      if (plan.stops && plan.stops.length > 0) {
        setUnifiedStops(plan.stops);
      } else {
        const defaultStops: UnifiedRouteStop[] = plan.sales_orders.map((s, idx) => ({
          id: `so-${s.sales_order_id}`,
          type: "DELIVERY",
          sequence: idx + 1,
          sales_order_id: s.sales_order_id,
          order_no: s.order_no,
          order_status: s.order_status,
          customer_name: s.customer_name,
          store_name: s.store_name,
          city: s.city,
          invoices: s.invoices,
          amount: s.amount,
          weight: s.weight || 0,
        }));
        setUnifiedStops(defaultStops);
      }

      setBudgetRows(
        plan.budget_rows.map((b) => ({
          id: b.id,
          coa_id: b.coa_id,
          account_title: b.account_title,
          amount: String(b.amount ?? 0),
          remarks: b.remarks || "",
        }))
      );
      setOrderSearch("");
      setIsConfirmOpen(false);
    }
  }, [open, plan]);

  // Radix Dialog scroll-lock mitigation: ensure wheel & touch scrolling always passes to dropdown popovers
  useEffect(() => {
    if (!open) return;

    const handleScrollEvent = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest("[data-radix-select-viewport]") ||
          target.closest("[data-slot='command-list']") ||
          target.closest("[cmdk-list]") ||
          target.closest("[data-radix-popper-content-wrapper]") ||
          target.closest("[data-slot='popover-content']"))
      ) {
        e.stopPropagation();
      }
    };

    document.addEventListener("wheel", handleScrollEvent, { capture: true });
    document.addEventListener("touchmove", handleScrollEvent, { capture: true });

    return () => {
      document.removeEventListener("wheel", handleScrollEvent, { capture: true });
      document.removeEventListener("touchmove", handleScrollEvent, { capture: true });
    };
  }, [open]);

  const loadEligible = useCallback(async () => {
    if (!plan) return;
    setIsLoadingOrders(true);
    try {
      const data = await fetchEligibleSalesOrders(undefined, config.branch_id, plan.dispatch_id);
      setEligibleOrders(data);
    } catch {
      setEligibleOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [plan, config.branch_id]);

  useEffect(() => {
    if (open && plan) {
      loadEligible();
    }
  }, [open, plan, loadEligible]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return eligibleOrders;
    return eligibleOrders.filter(
      (o) =>
        o.order_no.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.store_name.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        o.invoices.some((inv) => inv.invoice_no.toLowerCase().includes(q))
    );
  }, [eligibleOrders, orderSearch]);

  const selectedVehicle = useMemo(() => {
    return masterData.vehicles?.find((v) => v.vehicle_id === config.vehicle_id);
  }, [masterData.vehicles, config.vehicle_id]);

  const isThirdParty = useMemo(() => {
    return (
      config.vehicle_id === undefined ||
      config.vehicle_id === null ||
      config.vehicle_id === 0 ||
      selectedVehicle?.is_third_party ||
      Boolean(selectedVehicle?.name?.toLowerCase().includes("third party")) ||
      Boolean(selectedVehicle?.name?.toLowerCase().includes("3rd party"))
    );
  }, [config.vehicle_id, selectedVehicle]);

  const totalRouteValue = useMemo(() => {
    return unifiedStops.reduce(
      (sum, s) => sum + (s.type === "DELIVERY" ? Number(s.amount || 0) : 0),
      0
    );
  }, [unifiedStops]);

  if (!plan) return null;

  const isRejected = plan.status === "Rejected";
  const statusStyle = getDispatchStatusBadgeStyle(plan.status);

  const handleToggleOrder = (order: EligibleSalesOrder) => {
    const isCurrentlySelected = selectedOrderIds.includes(order.order_id);

    if (isCurrentlySelected) {
      setSelectedOrderIds((prev) => prev.filter((id) => id !== order.order_id));
      setUnifiedStops((prev) =>
        prev
          .filter((s) => !(s.type === "DELIVERY" && s.sales_order_id === order.order_id))
          .map((s, idx) => ({ ...s, sequence: idx + 1 }))
      );
    } else {
      setSelectedOrderIds((prev) => [...prev, order.order_id]);
      const newStop: UnifiedRouteStop = {
        id: `so-${order.order_id}`,
        type: "DELIVERY",
        sequence: unifiedStops.length + 1,
        sales_order_id: order.order_id,
        order_no: order.order_no,
        order_status: order.order_status,
        customer_name: order.customer_name,
        store_name: order.store_name,
        city: order.city,
        invoices: order.invoices,
        amount: order.total_amount,
        weight: 0,
      };
      setUnifiedStops((prev) => [...prev, newStop]);
    }
  };

  const handleRemoveStop = (stopId: string) => {
    const target = unifiedStops.find((s) => s.id === stopId);
    if (target?.type === "DELIVERY" && target.sales_order_id) {
      setSelectedOrderIds((prev) => prev.filter((id) => id !== target.sales_order_id));
    }
    setUnifiedStops((prev) =>
      prev.filter((s) => s.id !== stopId).map((s, idx) => ({ ...s, sequence: idx + 1 }))
    );
  };

  const handleAddManualStop = (stop: {
    remarks: string;
    distance: number;
    latitude: number | null;
    longitude: number | null;
  }) => {
    const newStop: UnifiedRouteStop = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      type: "MANUAL",
      sequence: unifiedStops.length + 1,
      remarks: stop.remarks,
      distance: stop.distance,
      latitude: stop.latitude,
      longitude: stop.longitude,
      status: "Not Fulfilled",
    };
    setUnifiedStops((prev) => [...prev, newStop]);
    toast.success("Manual Stop Added", { description: stop.remarks });
  };

  const handleAddPoStop = (stop: {
    po_id: number;
    po_no: string;
    supplier_name?: string;
    distance: number;
  }) => {
    const newStop: UnifiedRouteStop = {
      id: `po-${stop.po_id}-${Date.now()}`,
      type: "PO",
      sequence: unifiedStops.length + 1,
      po_id: stop.po_id,
      po_no: stop.po_no,
      supplier_name: stop.supplier_name,
      distance: stop.distance,
      status: "Not Fulfilled",
    };
    setUnifiedStops((prev) => [...prev, newStop]);
    toast.success("PO Stop Added", { description: stop.po_no });
  };

  const validateBeforeSave = (): boolean => {
    if (selectedOrderIds.length === 0 && unifiedStops.length === 0) {
      toast.error("Validation Error", { description: "Select at least one Sales Order or Route Stop." });
      return false;
    }
    if (!config.branch_id) {
      toast.error("Validation Error", {
        description: "Source Branch is required.",
      });
      return false;
    }
    if (!isThirdParty) {
      if (!config.driver_id || !config.helper_id) {
        toast.error("Validation Error", {
          description: "Driver and Helper are required for internal vehicles.",
        });
        return false;
      }
      if (config.driver_id === config.helper_id) {
        toast.error("Validation Error", {
          description: "Driver cannot also be assigned as Helper.",
        });
        return false;
      }
    }
    if (!config.departure_date || !config.arrival_date) {
      toast.error("Validation Error", {
        description: "Departure (ETD) and Arrival (ETDA) dates are required.",
      });
      return false;
    }
    if (new Date(config.arrival_date).getTime() < new Date(config.departure_date).getTime()) {
      toast.error("Validation Error", {
        description: "Arrival (ETDA) must be at or after Departure (ETD).",
      });
      return false;
    }
    return true;
  };

  const handleTriggerConfirm = () => {
    if (!validateBeforeSave()) return;
    setIsConfirmOpen(true);
  };

  const handleConfirmUpdate = async () => {
    if (!config.branch_id) return;
    if (!isThirdParty && (!config.driver_id || !config.helper_id)) return;

    setIsSubmitting(true);
    try {
      await updateDispatchPlan(plan.dispatch_id, {
        branch_id: config.branch_id,
        vehicle_id: config.vehicle_id ?? 0,
        driver_id: isThirdParty ? null : config.driver_id,
        helper_id: isThirdParty ? null : config.helper_id,
        departure_date: config.departure_date,
        arrival_date: config.arrival_date,
        remarks: config.remarks,
        total_amount: totalRouteValue,
        sales_order_ids: selectedOrderIds,
        budget_rows: budgetRows
          .filter((r) => r.coa_id !== null)
          .map((r) => ({
            id: r.id,
            coa_id: Number(r.coa_id),
            amount: parseFloat(r.amount || "0") || 0,
            remarks: r.remarks,
          })),
        stops: unifiedStops,
        resubmit: isRejected,
      });
      setIsConfirmOpen(false);
      onOpenChange(false);
      onSuccess();
    } catch {
      // Error toast handled in API layer
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-[96vw] xl:max-w-[1400px] h-[86vh] max-h-[86vh] min-h-0 p-0 gap-0 overflow-hidden rounded-xl border border-border/60 shadow-xl flex flex-col justify-start">
          <DialogHeader className="px-6 py-4 border-b shrink-0 bg-background">
            <div className="flex items-center justify-between gap-3 pr-8">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  {isRejected ? "Revise & Resubmit Dispatch Trip" : "Edit Dispatch Trip"}
                  <span className="font-mono text-sm text-primary">{plan.dispatch_no}</span>
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Modify selected orders, vehicle, crew, schedule, or draggable route stops before approval.
                </DialogDescription>
              </div>
              <Badge variant="outline" className={statusStyle.className}>
                {statusStyle.label}
              </Badge>
            </div>

            {isRejected && plan.rejection_reason && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Returned Reason: </span>
                  {plan.rejection_reason}
                </div>
              </div>
            )}
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
            <div className="lg:col-span-3 min-h-0 flex flex-col overflow-hidden">
              <SalesOrderInvoicePanel
                orders={filteredOrders}
                selectedOrderIds={selectedOrderIds}
                onToggleOrder={handleToggleOrder}
                searchQuery={orderSearch}
                onSearchChange={setOrderSearch}
                isLoading={isLoadingOrders}
                selectedBranchId={config.branch_id}
                selectedBranchName={
                  masterData.branches.find((b) => b.id === config.branch_id)?.branch_name
                }
              />
            </div>

            <div className="lg:col-span-6 min-h-0 flex flex-col overflow-hidden">
              <TripConfigPanel
                values={config}
                onChange={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
                branches={masterData.branches}
                drivers={masterData.drivers}
                helpers={masterData.helpers}
                vehicles={masterData.vehicles}
                lockedVehicleName={plan.vehicle_name || "3rd Party Logistics"}
              >
                <BudgetSection
                  rows={budgetRows}
                  onChange={setBudgetRows}
                  coaOptions={masterData.coa}
                />
              </TripConfigPanel>
            </div>

            <div className="lg:col-span-3 min-h-0 flex flex-col overflow-hidden">
              <RouteSequencePanel
                stops={unifiedStops}
                onReorder={setUnifiedStops}
                onRemoveStop={handleRemoveStop}
                onAddManualStop={handleAddManualStop}
                onAddPoStop={handleAddPoStop}
                branchId={config.branch_id}
                vehicleCapacity={selectedVehicle?.maximum_weight || 0}
              />
            </div>
          </div>

          <div className="px-6 py-3.5 border-t bg-background shrink-0 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {isRejected
                ? "Resubmitting will return this plan to 'For Approval' status."
                : "Edits will update the plan and re-evaluate sales order assignments."}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleTriggerConfirm}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                {isRejected ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Resubmit Trip
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRejected ? "Confirm Resubmission" : "Confirm Changes"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs space-y-2 pt-2 text-foreground">
                <p>Are you sure you want to update this dispatch trip?</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>
                    <strong>Dispatch No:</strong> {plan.dispatch_no}
                  </li>
                  <li>
                    <strong>Stops:</strong> {unifiedStops.length} stop(s) ({selectedOrderIds.length} Sales Order(s))
                  </li>
                  <li>
                    <strong>Vehicle:</strong> {selectedVehicle?.vehicle_plate || "3rd Party Logistics"} {isThirdParty ? "(3PL)" : ""}
                  </li>
                  <li>
                    <strong>Value:</strong> {formatCurrency(totalRouteValue)}
                  </li>
                  <li>
                    <strong>Schedule:</strong> ETD {formatDateTime(config.departure_date)} &rarr; ETDA {formatDateTime(config.arrival_date)}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUpdate}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating...
                </>
              ) : isRejected ? (
                "Confirm & Resubmit"
              ) : (
                "Confirm & Save"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
