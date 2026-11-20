"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
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
import type {
  DispatchMasterData,
  EligibleSalesOrder,
  UnifiedRouteStop,
} from "../../shared.types";
import {
  createDispatchPlan,
  fetchEligibleSalesOrders,
} from "../services/dispatch-plan-creation-api";
import { formatCurrency, formatDateTime } from "../../shared.utils";
import { SalesOrderInvoicePanel } from "./SalesOrderInvoicePanel";
import { TripConfigPanel, type TripConfigFormValues } from "./TripConfigPanel";
import { BudgetSection, type BudgetRowDraft } from "./BudgetSection";
import { RouteSequencePanel } from "./RouteSequencePanel";

interface DispatchPlanCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterData: DispatchMasterData;
  onSuccess: () => void;
}

const INITIAL_CONFIG: TripConfigFormValues = {
  branch_id: null,
  vehicle_id: 0,
  driver_id: null,
  helper_id: null,
  departure_date: "",
  arrival_date: "",
  remarks: "",
};

export const DispatchPlanCreateModal: React.FC<DispatchPlanCreateModalProps> = ({
  open,
  onOpenChange,
  masterData,
  onSuccess,
}) => {
  const [eligibleOrders, setEligibleOrders] = useState<EligibleSalesOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [unifiedStops, setUnifiedStops] = useState<UnifiedRouteStop[]>([]);
  const [config, setConfig] = useState<TripConfigFormValues>(INITIAL_CONFIG);
  const [budgetRows, setBudgetRows] = useState<BudgetRowDraft[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load eligible 'For Loading' SOs whenever modal opens or branch changes
  const loadEligible = useCallback(async () => {
    if (!config.branch_id) {
      setEligibleOrders([]);
      setIsLoadingOrders(false);
      return;
    }
    setIsLoadingOrders(true);
    try {
      const data = await fetchEligibleSalesOrders(undefined, config.branch_id);
      setEligibleOrders(data);
    } catch {
      setEligibleOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [config.branch_id]);

  const default3plVehicle = useMemo(() => {
    return (
      masterData.vehicles?.find(
        (v) =>
          v.is_third_party ||
          v.name?.toLowerCase().includes("third party") ||
          v.name?.toLowerCase().includes("3rd party") ||
          v.vehicle_plate?.toLowerCase().includes("3pl")
      ) || masterData.vehicles?.[0]
    );
  }, [masterData.vehicles]);

  useEffect(() => {
    if (open) {
      loadEligible();
      if (default3plVehicle) {
        setConfig((prev) => ({
          ...prev,
          vehicle_id:
            prev.vehicle_id === 0 || prev.vehicle_id === null
              ? default3plVehicle.vehicle_id
              : prev.vehicle_id,
        }));
      }
    } else {
      // Reset cleanly when closed
      setSelectedOrderIds([]);
      setUnifiedStops([]);
      setConfig(INITIAL_CONFIG);
      setBudgetRows([]);
      setOrderSearch("");
      setIsConfirmOpen(false);
    }
  }, [open, loadEligible, default3plVehicle]);

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

  const validateBeforeConfirm = (): boolean => {
    if (selectedOrderIds.length === 0 && unifiedStops.length === 0) {
      toast.error("Validation Error", {
        description: "Please add at least one Delivery Stop or Route Stop for this trip.",
      });
      return false;
    }
    if (!config.branch_id) {
      toast.error("Validation Error", { description: "Source Branch is required." });
      return false;
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

    if (!isThirdParty) {
      if (!config.driver_id) {
        toast.error("Validation Error", { description: "Driver is required for internal vehicles." });
        return false;
      }
      if (!config.helper_id) {
        toast.error("Validation Error", { description: "Helper is required for internal vehicles." });
        return false;
      }
      if (config.driver_id === config.helper_id) {
        toast.error("Validation Error", {
          description: "Driver cannot also be assigned as Helper.",
        });
        return false;
      }
    }

    for (const row of budgetRows) {
      const amt = parseFloat(row.amount);
      if (!row.coa_id || Number.isNaN(amt) || amt < 0) {
        toast.error("Validation Error", {
          description: "Each budget line must have a selected COA account and valid amount.",
        });
        return false;
      }
    }
    return true;
  };

  const handleReviewAndConfirm = () => {
    if (!validateBeforeConfirm()) return;
    setIsConfirmOpen(true);
  };

  const handleSubmitConfirmed = async () => {
    if (!config.branch_id) return;
    if (!isThirdParty && (!config.driver_id || !config.helper_id)) return;

    setIsSubmitting(true);
    try {
      await createDispatchPlan({
        branch_id: config.branch_id,
        vehicle_id: config.vehicle_id ?? default3plVehicle?.vehicle_id ?? 0,
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
            coa_id: Number(r.coa_id),
            amount: parseFloat(r.amount || "0") || 0,
            remarks: r.remarks,
          })),
        stops: unifiedStops,
      });
      setIsConfirmOpen(false);
      onOpenChange(false);
      onSuccess();
    } catch {
      // Error toast already displayed by API layer
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-[96vw] xl:max-w-[1400px] h-[86vh] max-h-[86vh] min-h-0 p-0 gap-0 overflow-hidden rounded-xl border border-border/60 shadow-xl flex flex-col justify-start">
          <DialogHeader className="px-6 py-4 border-b shrink-0 bg-background">
            <DialogTitle className="text-lg font-bold">Create Dispatch Trip</DialogTitle>
            <DialogDescription className="text-xs">
              Select eligible Sales Orders (For Loading), configure trip vehicle &amp; schedule, and organize the draggable route sequence.
            </DialogDescription>
          </DialogHeader>

          {/* 3-Panel Body */}
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
                onChange={(patch) => {
                  if (patch.branch_id !== undefined && patch.branch_id !== config.branch_id) {
                    if (selectedOrderIds.length > 0) {
                      toast.info("Branch Changed", {
                        description: "Selected sales orders have been reset for the newly chosen branch.",
                      });
                      setSelectedOrderIds([]);
                      setUnifiedStops((prev) => prev.filter((s) => s.type !== "DELIVERY"));
                    }
                  }
                  setConfig((prev) => ({ ...prev, ...patch }));
                }}
                branches={masterData.branches}
                drivers={masterData.drivers}
                helpers={masterData.helpers}
                vehicles={masterData.vehicles}
                lockedVehicleName={masterData.locked_vehicle?.name || "3rd Party Logistics"}
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

          {/* Footer */}
          <div className="px-6 py-3.5 border-t bg-background shrink-0 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Saving will set the Dispatch Plan to <strong>For Approval</strong> and move selected Sales Orders to{" "}
              <strong>For Shipping</strong>.
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
                onClick={handleReviewAndConfirm}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Save Dispatch Plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Summary Confirmation Dialog */}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Confirm Dispatch Plan Creation
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs space-y-2 pt-2 text-foreground">
                <p>Please review trip details before submitting for approval:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>
                    <strong>Stops in Route:</strong> {unifiedStops.length} stop(s) ({selectedOrderIds.length} Sales Order(s))
                  </li>
                  <li>
                    <strong>Total Value:</strong> {formatCurrency(totalRouteValue)}
                  </li>
                  <li>
                    <strong>Vehicle:</strong> {selectedVehicle?.vehicle_plate || "3rd Party Logistics"} {isThirdParty ? "(3PL)" : ""}
                  </li>
                  {!isThirdParty && (
                    <li>
                      <strong>Crew:</strong> Driver:{" "}
                      {masterData.drivers.find((d) => d.user_id === config.driver_id)?.full_name || "-"} |
                      Helper:{" "}
                      {masterData.helpers.find((h) => h.user_id === config.helper_id)?.full_name || "-"}
                    </li>
                  )}
                  <li>
                    <strong>Schedule:</strong> ETD {formatDateTime(config.departure_date)} &rarr; ETDA {formatDateTime(config.arrival_date)}
                  </li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Back to Edit</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmitConfirmed}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Confirm & Submit"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
