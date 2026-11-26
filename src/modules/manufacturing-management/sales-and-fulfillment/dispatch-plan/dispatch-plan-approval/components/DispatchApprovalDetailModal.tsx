"use client";

import React, { useState, useMemo } from "react";
import { CheckCircle2, AlertTriangle, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ApprovalActionPayload,
  DispatchPlanDetail,
  EligibleSalesOrder,
} from "../../shared.types";
import {
  getDispatchStatusBadgeStyle,
  toDateTimeLocalValue,
} from "../../shared.utils";
import { useTimeZone } from "@/providers/TimeZoneProvider";
import { SalesOrderInvoicePanel } from "../../dispatch-plan-creation/components/SalesOrderInvoicePanel";
import { TripConfigPanel } from "../../dispatch-plan-creation/components/TripConfigPanel";
import { BudgetSection } from "../../dispatch-plan-creation/components/BudgetSection";
import {
  RouteSequencePanel,
  type RouteStopItem,
} from "../../dispatch-plan-creation/components/RouteSequencePanel";
import { ApprovalDecisionPanel } from "./ApprovalDecisionPanel";
import { exportDispatchManifestPDF } from "../utils/exportManifest";

interface DispatchApprovalDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: DispatchPlanDetail | null;
  isSubmitting: boolean;
  onDecide: (payload: ApprovalActionPayload) => Promise<void>;
}

export const DispatchApprovalDetailModal: React.FC<DispatchApprovalDetailModalProps> = ({
  open,
  onOpenChange,
  plan,
  isSubmitting,
  onDecide,
}) => {
  const { formatDateTime, timeZone } = useTimeZone();
  const [orderSearch, setOrderSearch] = useState("");

  const orderCards: EligibleSalesOrder[] = useMemo(() => {
    if (!plan) return [];
    const mapped = plan.sales_orders.map((s) => ({
      order_id: s.sales_order_id,
      order_no: s.order_no,
      order_status: s.order_status,
      customer_code: s.customer_code,
      customer_name: s.customer_name,
      store_name: s.store_name || s.customer_name,
      city: s.city,
      branch_id: plan.branch_id || 0,
      branch_name: plan.branch_name,
      total_amount: s.amount,
      created_date: s.created_date ?? null,
      invoices: s.invoices,
    }));

    const q = orderSearch.trim().toLowerCase();
    if (!q) return mapped;
    return mapped.filter(
      (o) =>
        o.order_no.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.store_name.toLowerCase().includes(q) ||
        o.invoices.some((inv) => inv.invoice_no.toLowerCase().includes(q))
    );
  }, [plan, orderSearch]);

  const stops: RouteStopItem[] = useMemo(() => {
    if (!plan) return [];
    if (plan.stops && plan.stops.length > 0) {
      return plan.stops;
    }
    return plan.sales_orders.map((s, idx) => ({
      id: `so-${s.sales_order_id}`,
      type: "DELIVERY" as const,
      sequence: idx + 1,
      sales_order_id: s.sales_order_id,
      order_no: s.order_no,
      order_status: s.order_status,
      customer_name: s.customer_name,
      store_name: s.store_name,
      city: s.city,
      invoices: s.invoices,
      amount: s.amount,
      weight: s.weight,
    }));
  }, [plan]);

  if (!plan) return null;

  const statusBadge = getDispatchStatusBadgeStyle(plan.status);
  const isPending = plan.status === "Pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[96vw] max-w-[96vw] sm:max-w-[96vw] xl:max-w-[1400px] h-[86vh] max-h-[86vh] min-h-0 p-0 gap-0 overflow-hidden rounded-xl border border-border/60 shadow-xl flex flex-col justify-start [&>button:last-child]:hidden"
      >
        <DialogHeader className="px-6 py-4 border-b shrink-0 bg-background">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                {isPending ? "Review Dispatch Plan" : "Dispatch Plan Decision Record"}
                <span className="font-mono text-sm text-primary">{plan.dispatch_no}</span>
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Verify linked Sales Orders, Invoices, 3rd Party Logistics assignment, crew, schedule, and route sequence.
              </DialogDescription>
            </div>
            <Badge variant="outline" className={statusBadge.className}>
              {statusBadge.label}
            </Badge>
          </div>

          {plan.status === "Approved" && (
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Approved by <strong>{plan.approved_by_name || "-"}</strong> on{" "}
                <span className="font-mono">{formatDateTime(plan.approved_at)}</span> — Sales Orders moved to{" "}
                <strong>Dispatched</strong>.
              </span>
            </div>
          )}

          {plan.status === "Rejected" && (
            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span>
                  Returned by <strong>{plan.rejected_by_name || "-"}</strong> on{" "}
                  <span className="font-mono">{formatDateTime(plan.rejected_at)}</span>
                </span>
                {plan.rejection_reason && (
                  <p className="mt-0.5 font-medium">Reason: {plan.rejection_reason}</p>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        {/* 3-Panel Read-Only Review Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          <div className="lg:col-span-3 min-h-0 flex flex-col overflow-hidden">
            <SalesOrderInvoicePanel
              orders={orderCards}
              selectedOrderIds={plan.sales_orders.map((s) => s.sales_order_id)}
              searchQuery={orderSearch}
              onSearchChange={setOrderSearch}
              isLoading={false}
              readOnly
              selectedBranchId={plan.branch_id}
              selectedBranchName={plan.branch_name}
            />
          </div>

          <div className="lg:col-span-6 min-h-0 flex flex-col overflow-hidden">
            <TripConfigPanel
              values={{
                branch_id: plan.branch_id,
                vehicle_id: plan.vehicle_id,
                driver_id: plan.driver_id,
                helper_id: plan.helper_id,
                departure_date: toDateTimeLocalValue(plan.departure_date),
                arrival_date: toDateTimeLocalValue(plan.arrival_date),
                remarks: plan.remarks || "",
              }}
              branches={[]}
              drivers={[]}
              helpers={[]}
              lockedVehicleName={plan.vehicle_name || "3rd Party Logistics"}
              branchNameFallback={plan.branch_name}
              driverNameFallback={plan.driver_name}
              helperNameFallback={plan.helper_name}
              readOnly
            >
              <BudgetSection
                rows={plan.budget_rows.map((b) => ({
                  id: b.id,
                  coa_id: b.coa_id,
                  account_title: b.account_title,
                  amount: String(b.amount ?? 0),
                  remarks: b.remarks || "",
                }))}
                coaOptions={[]}
                readOnly
              />
            </TripConfigPanel>
          </div>

          <div className="lg:col-span-3 min-h-0 flex flex-col overflow-hidden">
            <RouteSequencePanel stops={stops} vehicleCapacity={0} readOnly />
          </div>
        </div>

        {/* Footer: Actionable decision panel only when Pending; otherwise locked Close */}
        {isPending ? (
          <ApprovalDecisionPanel
            dispatchNo={plan.dispatch_no}
            stopCount={plan.sales_orders.length}
            isSubmitting={isSubmitting}
            onDecide={onDecide}
            onClose={() => onOpenChange(false)}
            onPrint={() => exportDispatchManifestPDF(plan, timeZone)}
          />
        ) : (
          <div className="px-6 py-3.5 border-t bg-background shrink-0 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              This dispatch plan decision has already been recorded and is locked.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => exportDispatchManifestPDF(plan, timeZone)}
              >
                <Printer className="h-4 w-4" />
                Print PDF
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
