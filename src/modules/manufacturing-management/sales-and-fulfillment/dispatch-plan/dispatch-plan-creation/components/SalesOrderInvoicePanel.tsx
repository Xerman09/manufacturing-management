"use client";

import React from "react";
import { motion } from "framer-motion";
import { Search, CheckCircle2, FileText, Loader2, X, Inbox, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { EligibleSalesOrder } from "../../shared.types";
import {
  formatCurrency,
  formatDateTimeDisplay,
  getOrderStatusBadgeStyle,
} from "../../shared.utils";

interface SalesOrderInvoicePanelProps {
  orders: EligibleSalesOrder[];
  selectedOrderIds: number[];
  onToggleOrder?: (order: EligibleSalesOrder) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  isLoading: boolean;
  readOnly?: boolean;
  selectedBranchId?: number | null;
  selectedBranchName?: string;
}

export const SalesOrderInvoicePanel: React.FC<SalesOrderInvoicePanelProps> = ({
  orders,
  selectedOrderIds,
  onToggleOrder,
  searchQuery,
  onSearchChange,
  isLoading,
  readOnly = false,
  selectedBranchId,
  selectedBranchName,
}) => {
  const selectedSet = new Set(selectedOrderIds);
  const isBranchMissing = !selectedBranchId && !readOnly;

  return (
    <div className="flex flex-col h-full min-h-0 border-r bg-muted/10">
      <div className="p-4 border-b space-y-2.5 bg-background/60">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Sales Orders &amp; Invoices
            </h4>
            {selectedBranchName && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium truncate">
                <Building2 className="h-3 w-3 text-primary shrink-0" />
                <span className="truncate">{selectedBranchName}</span>
              </div>
            )}
          </div>
          <Badge
            variant={isBranchMissing ? "outline" : "secondary"}
            className={cn(
              "text-[10px] font-semibold shrink-0",
              isBranchMissing &&
                "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
            )}
          >
            {isBranchMissing ? "Branch Required" : `${selectedOrderIds.length} Selected`}
          </Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              isBranchMissing
                ? "Select a branch to search orders..."
                : "Search sales orders / invoices..."
            }
            disabled={isBranchMissing}
            className="h-8 pl-8 pr-7 text-xs disabled:opacity-60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2.5">
          {isBranchMissing ? (
            <div className="flex flex-col items-center justify-center py-16 px-5 text-center border-2 border-dashed rounded-xl text-muted-foreground gap-3 bg-muted/5">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">Select Source Branch First</p>
                <p className="text-[11px] text-muted-foreground max-w-[210px] leading-relaxed">
                  Please select a Source Branch in Trip Configuration to view and select eligible Sales Orders.
                </p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Loading eligible sales orders...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed rounded-xl text-muted-foreground gap-2">
              <Inbox className="h-7 w-7 opacity-50" />
              <p className="text-xs font-medium text-foreground">No Eligible Orders</p>
              <p className="text-[11px]">
                {searchQuery
                  ? "No Sales Order or Invoice matches your search."
                  : "No orders in 'For Loading' status found for this branch."}
              </p>
            </div>
          ) : (
            orders.map((order, idx) => {
              const isSelected = selectedSet.has(order.order_id);
              const invCount = order.invoices.length;
              const orderStatusStyle = getOrderStatusBadgeStyle(order.order_status);

              return (
                <motion.button
                  key={order.order_id}
                  type="button"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: Math.min(idx * 0.025, 0.2) }}
                  disabled={readOnly}
                  onClick={() => onToggleOrder?.(order)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3 transition-all relative bg-card",
                    !readOnly && "cursor-pointer hover:border-primary/50 hover:shadow-sm",
                    readOnly && "cursor-default",
                    isSelected
                      ? "border-primary ring-1 ring-primary/30 bg-primary/[0.03]"
                      : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-[10px] text-muted-foreground">
                        Created at: {formatDateTimeDisplay(order.created_date)}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0 h-5",
                            orderStatusStyle.className
                          )}
                        >
                          {orderStatusStyle.label}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs font-bold text-foreground pt-0.5 truncate">
                        {order.order_no}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground truncate mt-1">
                    {order.store_name || order.customer_name} •{" "}
                    {invCount > 0 ? `${invCount} ${invCount === 1 ? "Invoice" : "Invoices"}` : "No Invoice"}
                  </p>

                  {invCount > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {order.invoices.map((inv) => (
                        <span
                          key={inv.invoice_id}
                          className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-foreground"
                        >
                          <FileText className="h-2.5 w-2.5 text-muted-foreground" />
                          {inv.invoice_no}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 pt-1.5 border-t flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground truncate max-w-[130px]">
                      {order.city || order.branch_name || "-"}
                    </span>
                    <span className="font-mono text-xs font-bold text-foreground">
                      {formatCurrency(order.total_amount)}
                    </span>
                  </div>
                </motion.button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
