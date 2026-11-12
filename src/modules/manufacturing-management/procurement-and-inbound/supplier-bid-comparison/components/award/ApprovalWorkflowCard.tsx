"use client";

import React, { useState } from "react";
import { Send, CheckCircle2, XCircle, RotateCcw, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { ApprovalHistoryEntry, ProjectStatus } from "../../types";
import { toast } from "sonner";

export const ApprovalWorkflowCard: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    const [actionComment, setActionComment] = useState("");
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState("");

    if (!currentProject) return null;

    const items = currentProject.items || [];
    const awards = currentProject.awards || [];
    const summary = evaluateAndCompareSuppliers(currentProject);
    const status = currentProject.status;

    // Pre-submission Checks
    const unawardedItems = items.filter((it) => !awards.some((a) => a.rfqItemId === it.id));
    const missingJustification = !currentProject.justification || !currentProject.justification.trim();

    const awardedDisqualified = awards.some((a) => summary.results[a.rfqBidId]?.isDisqualified);
    const awardedExpired = awards.some((a) => summary.results[a.rfqBidId]?.isExpired);

    const canSubmit =
        status === "Draft" &&
        unawardedItems.length === 0 &&
        !missingJustification &&
        !awardedDisqualified &&
        !awardedExpired;

    const addHistoryEntry = (
        action: ApprovalHistoryEntry["action"],
        fromStatus: ProjectStatus,
        toStatus: ProjectStatus,
        comment: string
    ) => {
        const newEntry: ApprovalHistoryEntry = {
            id: "hist-" + Date.now(),
            action,
            fromStatus,
            toStatus,
            actorName: currentProject.preparedBy || "Current User",
            comment,
            createdAt: new Date().toISOString(),
        };

        return [...(currentProject.approvalHistory || []), newEntry];
    };

    // 1. Submit for Approval
    const handleSubmit = () => {
        if (!canSubmit) {
            toast.error("Please resolve all pre-submission validation issues first.");
            return;
        }

        const newHistory = addHistoryEntry(
            "SUBMIT",
            "Draft",
            "Submitted",
            actionComment.trim() || "Submitted for BAC executive approval."
        );

        updateProject((prev) => ({
            ...prev,
            status: "Submitted",
            approvalHistory: newHistory,
        }));

        setActionComment("");
        toast.success("Award submitted for approval! RFQ is now locked.");
    };

    // 2. Approve Award
    const handleApprove = () => {
        const newHistory = addHistoryEntry(
            "APPROVE",
            "Submitted",
            "Approved",
            actionComment.trim() || "Award approved by authority."
        );

        updateProject((prev) => ({
            ...prev,
            status: "Approved",
            approvedBy: prev.approvedBy || prev.reviewedBy || "Approving Authority",
            approvalHistory: newHistory,
        }));

        setActionComment("");
        toast.success("Award successfully Approved! Abstract of Bids is ready to print.");
    };

    // 3. Reject Award
    const handleRejectSubmit = () => {
        if (!rejectionReason.trim()) {
            toast.error("A rejection reason is required.");
            return;
        }

        const newHistory = addHistoryEntry(
            "REJECT",
            "Submitted",
            "Rejected",
            rejectionReason.trim()
        );

        updateProject((prev) => ({
            ...prev,
            status: "Rejected",
            rejectionReason: rejectionReason.trim(),
            approvalHistory: newHistory,
        }));

        setIsRejectDialogOpen(false);
        setRejectionReason("");
        toast.error("Award rejected. Returned to editable state.");
    };

    // 4. Withdraw to Draft
    const handleWithdraw = () => {
        const newHistory = addHistoryEntry(
            "WITHDRAW",
            "Submitted",
            "Draft",
            actionComment.trim() || "Withdrawn to Draft for adjustments."
        );

        updateProject((prev) => ({
            ...prev,
            status: "Draft",
            approvalHistory: newHistory,
        }));

        setActionComment("");
        toast.info("Submission withdrawn. RFQ is now editable.");
    };

    // 5. Reopen for Changes
    const handleReopen = () => {
        const newHistory = addHistoryEntry(
            "REOPEN",
            status,
            "Draft",
            actionComment.trim() || "Reopened for modifications."
        );

        updateProject((prev) => ({
            ...prev,
            status: "Draft",
            approvalHistory: newHistory,
        }));

        setActionComment("");
        toast.info("Project reopened to Draft status.");
    };

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    4.2 Award Justification &amp; Executive Approval Workflow
                </CardTitle>
                <CardDescription className="text-xs">
                    Record justification for audit compliance and advance through submission, review, and signing.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {/* Justification Textarea */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                        Justification / Reason for Award <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                        value={currentProject.justification || ""}
                        onChange={(e) => updateProject((prev) => ({ ...prev, justification: e.target.value }))}
                        placeholder="State the commercial and technical reasons for the chosen award (e.g. Lowest total landed cost compliant with specifications; certified ISO 9001)."
                        disabled={status === "Submitted" || status === "Approved"}
                        className="text-xs resize-none h-20"
                    />
                    <span className="text-[10px] text-muted-foreground block">
                        Mandatory for submission. This statement is permanently printed on the official Abstract of Bids.
                    </span>
                </div>

                {/* Pre-Submission Validation Checklist (When in Draft) */}
                {status === "Draft" && (
                    <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5 text-xs">
                        <span className="font-semibold block text-[11px] text-muted-foreground uppercase tracking-wider">
                            Pre-Submission Integrity Checks:
                        </span>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                {unawardedItems.length === 0 ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                                )}
                                <span>
                                    All items awarded ({items.length - unawardedItems.length}/{items.length})
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                {!missingJustification ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                                )}
                                <span>Award justification provided</span>
                            </div>

                            <div className="flex items-center gap-2">
                                {!awardedDisqualified ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                                )}
                                <span>No disqualified suppliers awarded</span>
                            </div>

                            <div className="flex items-center gap-2">
                                {!awardedExpired ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                )}
                                <span>No expired quotations awarded</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Status-Aware Action Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t">
                    <div className="flex-1 max-w-sm">
                        <Label className="text-[11px] text-muted-foreground block mb-1">
                            {status === "Draft"
                                ? "Note for Approver (Optional)"
                                : status === "Submitted"
                                    ? "Approval / Review Remarks"
                                    : "Action Remarks"}
                        </Label>
                        <Input
                            value={actionComment}
                            onChange={(e) => setActionComment(e.target.value)}
                            placeholder="Add comment for history log..."
                            className="h-8 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {status === "Draft" && (
                            <Button
                                size="sm"
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                                className="h-8 text-xs gap-1.5"
                            >
                                <Send className="h-3.5 w-3.5" />
                                Submit for Approval
                            </Button>
                        )}

                        {status === "Submitted" && (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleWithdraw}
                                    className="h-8 text-xs gap-1.5"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Withdraw
                                </Button>

                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => {
                                        setRejectionReason("");
                                        setIsRejectDialogOpen(true);
                                    }}
                                    className="h-8 text-xs gap-1.5"
                                >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Reject
                                </Button>

                                <Button
                                    size="sm"
                                    onClick={handleApprove}
                                    className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Approve Award
                                </Button>
                            </>
                        )}

                        {(status === "Approved" || status === "Rejected") && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleReopen}
                                className="h-8 text-xs gap-1.5"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reopen for Changes
                            </Button>
                        )}
                    </div>
                </div>

                {/* Reject Reason Dialog */}
                <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                    <DialogContent className="sm:max-w-[420px]">
                        <DialogHeader>
                            <DialogTitle className="text-destructive flex items-center gap-2">
                                <XCircle className="h-4 w-4" />
                                Reject Award
                            </DialogTitle>
                            <DialogDescription>
                                Please provide the official reason for rejecting this award. It will be permanently recorded in the audit history.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-2">
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Specify why the award was rejected (e.g. Budget ceiling exceeded, alternative quotation requested)."
                                className="text-xs h-24"
                                autoFocus
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" size="sm" onClick={() => setIsRejectDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleRejectSubmit}>
                                Confirm Rejection
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
};
