"use client";

import React, { useState } from "react";
import { CheckCircle2, RotateCcw, Loader2, ShieldCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import type { ApprovalActionPayload } from "../../shared.types";

interface ApprovalDecisionPanelProps {
  dispatchNo: string;
  stopCount: number;
  isSubmitting: boolean;
  onDecide: (payload: ApprovalActionPayload) => Promise<void>;
  onClose: () => void;
  onPrint?: () => void;
}

export const ApprovalDecisionPanel: React.FC<ApprovalDecisionPanelProps> = ({
  dispatchNo,
  stopCount,
  isSubmitting,
  onDecide,
  onClose,
  onPrint,
}) => {
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);

  const handleOpenRejectConfirm = () => {
    if (!reason.trim()) {
      toast.error("Reason Required", {
        description: "Please enter a clear reason before returning this trip for correction.",
      });
      return;
    }
    setConfirmAction("reject");
  };

  const handleExecuteConfirm = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    await onDecide(
      action === "approve" ? { action: "approve" } : { action: "reject", reason: reason.trim() }
    );
  };

  return (
    <>
      <div className="px-6 py-3.5 border-t bg-background shrink-0 space-y-3">
        {mode === "reject" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-900 p-3 space-y-2">
            <Label className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              Reason for Returning to Planner <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain what needs to be corrected (e.g., wrong driver, missing invoice, schedule conflict)..."
              className="text-xs bg-background resize-none"
              disabled={isSubmitting}
            />
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Approving authorizes <strong>{dispatchNo}</strong> for dispatch and updates all{" "}
            <strong>{stopCount}</strong> linked Sales Order(s) to <strong>Dispatched</strong>.
          </p>

          <div className="flex items-center justify-end gap-2 shrink-0">
            {onPrint && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={onPrint}
                disabled={isSubmitting}
              >
                <Printer className="h-4 w-4" />
                Print PDF
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Close
            </Button>

            {mode === "idle" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => setMode("reject")}
                  className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Return for Correction
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmAction("approve")}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Approve Dispatch Plan
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setMode("idle");
                    setReason("");
                  }}
                  disabled={isSubmitting}
                >
                  Cancel Return
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleOpenRejectConfirm}
                  className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Confirm Return
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmAction === "approve" ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Approve {dispatchNo}?
                </>
              ) : (
                <>
                  <RotateCcw className="h-5 w-5 text-amber-600" />
                  Return {dispatchNo} for Correction?
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs text-muted-foreground pt-1">
                {confirmAction === "approve" ? (
                  <>
                    <p>
                      This action will mark <strong className="text-foreground">{dispatchNo}</strong>{" "}
                      as <strong className="text-foreground">Approved</strong> and lock it from
                      further editing.
                    </p>
                    <p>
                      All <strong className="text-foreground">{stopCount}</strong> linked Sales
                      Order(s) will transition from{" "}
                      <strong className="text-foreground">For Shipping</strong> to{" "}
                      <strong className="text-foreground">Dispatched</strong>.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong className="text-foreground">{dispatchNo}</strong> will be marked{" "}
                      <strong className="text-foreground">Returned for Correction</strong> and all
                      linked Sales Orders will revert to{" "}
                      <strong className="text-foreground">For Loading</strong>.
                    </p>
                    <p className="rounded-md bg-muted p-2 text-foreground">
                      <strong>Reason:</strong> {reason}
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleExecuteConfirm();
              }}
              disabled={isSubmitting}
              className={
                confirmAction === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  : "bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
              }
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirmAction === "approve" ? "Confirm Approval" : "Confirm Return"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
