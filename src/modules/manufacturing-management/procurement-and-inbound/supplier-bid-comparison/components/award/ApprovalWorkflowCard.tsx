"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { ApprovalHistoryEntry, ProjectStatus } from "../../types";
import { toast } from "sonner";


export const ApprovalWorkflowCard: React.FC = () => {
    const { currentProject, updateProject, currentUser } = useBidComparisonStore();
    const [actionComment, setActionComment] = useState("");

    if (!currentProject) return null;

    const items = currentProject.items || [];
    const awards = currentProject.awards || [];
    const summary = evaluateAndCompareSuppliers(currentProject);
    const status = currentProject.status;
    const isAwarded = status === "Awarded" || status === "Approved";

    // Pre-submission Checks
    const unawardedItems = items.filter((it) => !awards.some((a) => a.rfqItemId === it.id));
    const missingJustification = !currentProject.justification || !currentProject.justification.trim();

    const awardedDisqualified = awards.some((a) => summary.results[a.rfqBidId]?.isDisqualified);
    const awardedExpired = awards.some((a) => summary.results[a.rfqBidId]?.isExpired);

    const canFinalize =
        status === "Draft" &&
        items.length > 0 &&
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
        const actorName = (currentUser?.name && currentUser.name !== "-")
            ? currentUser.name
            : (currentUser?.email || "-");

        const newEntry: ApprovalHistoryEntry = {
            id: "hist-" + Date.now(),
            action,
            fromStatus,
            toStatus,
            actorName: actorName || "-",
            comment,
            createdAt: new Date().toISOString(),
        };

        return [...(currentProject.approvalHistory || []), newEntry];
    };

    // 1. Finalize Award (Draft -> Awarded)
    const handleFinalize = () => {
        if (!canFinalize) {
            toast.error("Please resolve all pre-finalization validation issues first.");
            return;
        }

        const justificationText = currentProject.justification?.trim() || "";
        const extraNote = actionComment.trim();
        const commentText = extraNote
            ? `${justificationText} (Remarks: ${extraNote})`
            : justificationText;

        const newHistory = addHistoryEntry(
            "FINALIZE",
            "Draft",
            "Awarded",
            commentText
        );

        updateProject((prev) => ({
            ...prev,
            status: "Awarded",
            approvalRemarks: commentText,
            approvedBy: currentUser?.name || currentUser?.email || "Award Signatory",
            approvalHistory: newHistory,
        }));

        setActionComment("");
        toast.success("Award finalized successfully! Abstract of Bids is official.");
    };

    // 2. Reopen to Draft (Awarded -> Draft)
    const handleReopen = () => {
        const commentText = actionComment.trim();
        if (!commentText) {
            toast.error("Please enter remarks/reason for reopening the draft.");
            return;
        }

        const newHistory = addHistoryEntry(
            "REOPEN",
            status,
            "Draft",
            commentText
        );

        updateProject((prev) => ({
            ...prev,
            status: "Draft",
            approvalRemarks: commentText,
            approvalHistory: newHistory,
        }));

        setActionComment("");
        toast.info("Project reopened to Draft status. Changes can now be edited.");
    };

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        {isAwarded ? "4.2 Award Lifecycle & Reopening" : "4.2 Award Justification & Finalization"}
                    </CardTitle>
                    <CardDescription className="text-xs">
                        {isAwarded
                            ? "This canvass is finalized and locked. Provide a mandatory reason below to reopen the project to Draft for revisions."
                            : "Record justification for audit compliance and advance through direct Draft \u2192 Awarded lifecycle."}
                    </CardDescription>
                </div>
                {isAwarded && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        Awarded (Locked)
                    </span>
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {isAwarded ? (
                    /* Awarded State: Read-Only Approved Justification + Dynamic Reopening Textarea */
                    <>
                        {/* Approved Award Justification Display */}
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                Approved Award Justification:
                            </span>
                            <p className="text-xs text-foreground italic whitespace-pre-wrap">
                                &ldquo;{currentProject.justification || "-"}&rdquo;
                            </p>
                        </div>

                        {/* Dynamic Reopening Textarea */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">
                                Reason for Reopening <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                                value={actionComment}
                                onChange={(e) => setActionComment(e.target.value)}
                                placeholder="State detailed reasons for reopening to Draft (e.g. Supplier amended quotation validity date, scope adjusted by requesting unit)..."
                                className="text-xs resize-none h-32"
                            />
                            <span className="text-[10px] text-muted-foreground block">
                                Mandatory for reopening. This explanation is permanently recorded in the audit trail.
                            </span>
                        </div>

                        {/* Reopen Action Button */}
                        <div className="flex items-center justify-end pt-2 border-t">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleReopen}
                                className="h-8 text-xs gap-1.5 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 text-amber-800 dark:text-amber-200"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reopen Draft
                            </Button>
                        </div>
                    </>
                ) : (
                    /* Draft State: Editable Justification Textarea + Integrity Checks + Finalize CTA */
                    <>
                        {/* Justification Textarea */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">
                                Justification / Reason for Award <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                                value={currentProject.justification || ""}
                                onChange={(e) => updateProject((prev) => ({ ...prev, justification: e.target.value }))}
                                placeholder="State the commercial and technical reasons for the chosen award (e.g. Lowest total landed cost compliant with specifications; certified ISO 9001)."
                                className="text-xs resize-none h-36"
                            />
                            <span className="text-[10px] text-muted-foreground block">
                                Mandatory for award finalization. This statement is permanently printed on the official Abstract of Bids.
                            </span>
                        </div>

                        {/* Pre-Finalization Validation Checklist */}
                        <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5 text-xs">
                            <span className="font-semibold block text-[11px] text-muted-foreground uppercase tracking-wider">
                                Pre-Finalization Integrity Checks:
                            </span>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    {items.length > 0 && unawardedItems.length === 0 ? (
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

                        {/* Finalization Action Controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t">
                            <div className="flex-1 max-w-sm">
                                <Label className="text-[11px] text-muted-foreground block mb-1">
                                    Additional Finalization Remarks (Optional)
                                </Label>
                                <Input
                                    value={actionComment}
                                    onChange={(e) => setActionComment(e.target.value)}
                                    placeholder="Optional extra notes..."
                                    className="h-8 text-xs"
                                />
                            </div>

                            <Button
                                size="sm"
                                onClick={handleFinalize}
                                disabled={!canFinalize}
                                className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Finalize Award
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
