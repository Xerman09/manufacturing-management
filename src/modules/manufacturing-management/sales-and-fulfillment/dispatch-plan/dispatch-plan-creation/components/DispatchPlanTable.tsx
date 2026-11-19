"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  Pencil,
  Loader2,
  Truck,
  CalendarClock,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DispatchPlanListItem } from "../../shared.types";
import {
  formatCurrency,
  formatDateTimeDisplay,
  getDispatchStatusBadgeStyle,
  getOrderStatusBadgeStyle,
} from "../../shared.utils";

interface DispatchPlanTableProps {
  plans: DispatchPlanListItem[];
  isLoading: boolean;
  error: string | null;
  loadingPlanId: number | null;
  page: number;
  pageSize: number;
  totalPlans: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onRetry: () => void;
}

export const DispatchPlanTable: React.FC<DispatchPlanTableProps> = ({
  plans,
  isLoading,
  error,
  loadingPlanId,
  page,
  pageSize,
  totalPlans,
  onPageChange,
  onPageSizeChange,
  onView,
  onEdit,
  onRetry,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalPlans / pageSize));
  const startRow = totalPlans === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalPlans);

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-16 px-6 text-center"
      >
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Failed to Load Dispatch Plans</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[175px] font-semibold text-xs uppercase tracking-wider">
                Dispatch No.
              </TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider">
                Source Branch
              </TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider">
                Driver &amp; Vehicle / Crew
              </TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider">
                Departure / Arrival
              </TableHead>
              <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">
                Trip Value / Stops
              </TableHead>
              <TableHead className="font-semibold text-xs uppercase tracking-wider">
                Status
              </TableHead>
              <TableHead className="text-right font-semibold text-xs uppercase tracking-wider w-[150px]">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <TableRow key={`skeleton-${idx}`}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-44" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-28 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-56 text-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center gap-2 py-8"
                  >
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <PackageOpen className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">No Dispatch Plans Found</p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Click &ldquo;+ Create&rdquo; to group invoiced Sales Orders (For Loading) into a new dispatch trip.
                    </p>
                  </motion.div>
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence mode="popLayout">
                {plans.map((plan, index) => {
                  const statusBadge = getDispatchStatusBadgeStyle(plan.status);
                  const canEdit =
                    plan.status === "Pending" ||
                    plan.status === "For Approval" ||
                    plan.status === "Rejected" ||
                    plan.status === "Returned for Correction";
                  const isRowLoading = loadingPlanId === plan.dispatch_id;

                  return (
                    <motion.tr
                      key={plan.dispatch_id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.25) }}
                      className="border-b transition-colors hover:bg-muted/40"
                    >
                      <TableCell className="font-mono font-semibold text-xs text-primary">
                        <div>{plan.dispatch_no}</div>
                        <div className="text-[11px] font-sans font-normal text-muted-foreground mt-0.5">
                          {formatDateTimeDisplay(plan.created_at)}
                        </div>
                      </TableCell>

                      <TableCell className="text-sm font-medium">
                        {plan.branch_name || "-"}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-foreground">
                            {plan.driver_name || "-"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Helper: {plan.helper_name || "-"}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                            <Truck className="h-3 w-3" />
                            {plan.vehicle_name || "3rd Party Logistics"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <div className="flex items-center gap-1.5 text-foreground">
                            <CalendarClock className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span>ETD: {formatDateTimeDisplay(plan.departure_date)}</span>
                          </div>
                          <div className="pl-4 text-muted-foreground">
                            ETDA: {formatDateTimeDisplay(plan.arrival_date)}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="font-mono font-semibold text-sm text-foreground">
                          {formatCurrency(plan.total_amount)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {plan.stop_count ?? 0} {plan.stop_count === 1 ? "Stop" : "Stops"}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant="outline"
                            className={cn("text-[11px] font-medium", statusBadge.className)}
                          >
                            {statusBadge.label}
                          </Badge>
                          {plan.order_statuses && plan.order_statuses.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {plan.order_statuses.map((soStatus) => {
                                const soStyle = getOrderStatusBadgeStyle(soStatus);
                                return (
                                  <Badge
                                    key={soStatus}
                                    variant="outline"
                                    className={cn("text-[10px] font-medium px-1.5 py-0 h-4", soStyle.className)}
                                  >
                                    SO: {soStyle.label}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                          {plan.status === "Rejected" && plan.rejection_reason && (
                            <span
                              className="text-[11px] text-rose-600 dark:text-rose-400 max-w-[180px] truncate"
                              title={plan.rejection_reason}
                            >
                              {plan.rejection_reason}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isRowLoading}
                            onClick={() => onView(plan.dispatch_id)}
                            className="h-8 px-2.5 text-xs gap-1"
                          >
                            {isRowLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                            View
                          </Button>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={isRowLoading}
                              onClick={() => onEdit(plan.dispatch_id)}
                              className="h-8 px-2.5 text-xs gap-1"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {plan.status === "Rejected" || plan.status === "Returned for Correction"
                                ? "Revise"
                                : "Edit"}
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
      </div>

      {/* Pagination Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground bg-muted/20">
        <div>
          Showing <strong className="text-foreground">{startRow}</strong>–
          <strong className="text-foreground">{endRow}</strong> of{" "}
          <strong className="text-foreground">{totalPlans}</strong> trips
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border bg-background px-2 text-xs text-foreground"
            >
              {[10, 20, 50].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-medium text-foreground">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
