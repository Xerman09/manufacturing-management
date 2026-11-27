"use client";

import React from "react";
import { CheckCircle, Clock, FileCheck, ArrowRight, Save, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReportStatus } from "../types";

interface StatusWorkflowBarProps {
    status: ReportStatus;
    version: number;
    reportId: string;
    isSnapshotMode: boolean;
    onSaveSnapshot: () => void;
    onSubmitForReview: () => void;
    onOpenRejectModal: () => void;
    onPublish: () => void;
    canPublish: boolean;
    isSaving?: boolean;
}

const ORDERED_STEPS: ReportStatus[] = ["Draft", "In Review", "Published"];

export function StatusWorkflowBar({
    status,
    version,
    reportId,
    isSnapshotMode,
    onSaveSnapshot,
    onSubmitForReview,
    onOpenRejectModal,
    onPublish,
    canPublish,
    isSaving
}: StatusWorkflowBarProps) {
    const getStatusVariant = (st: ReportStatus) => {
        switch (st) {
            case "Published":
                return "bg-emerald-600 text-white";
            case "In Review":
                return "bg-blue-600 text-white";
            case "Draft":
                return "bg-slate-600 text-white";
            case "Needs Data":
                return "bg-amber-600 text-white";
            case "Failed":
                return "bg-red-600 text-white";
            default:
                return "bg-muted text-muted-foreground";
        }
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-2.5">
            <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-medium text-muted-foreground">
                    {reportId} (v{version})
                </span>
                <Badge className={getStatusVariant(status)}>{status}</Badge>
                {isSnapshotMode && (
                    <Badge variant="outline" className="text-[10px] text-primary border-primary">
                        Snapshot Mode
                    </Badge>
                )}
            </div>

            {/* Stepper Visualization */}
            <div className="hidden md:flex items-center gap-2 text-xs">
                {ORDERED_STEPS.map((step, idx) => {
                    const isCurrent = status === step;
                    const isPassed =
                        (step === "Draft" && (status === "In Review" || status === "Published")) ||
                        (step === "In Review" && status === "Published");

                    return (
                        <React.Fragment key={step}>
                            <div
                                className={`flex items-center gap-1 font-medium ${
                                    isCurrent ? "text-primary font-bold" : isPassed ? "text-muted-foreground" : "text-muted-foreground/50"
                                }`}
                            >
                                {isPassed ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Clock className="h-3.5 w-3.5" />}
                                <span>{step}</span>
                            </div>
                            {idx < ORDERED_STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
                {status === "Draft" && (
                    <>
                        <Button size="sm" variant="outline" onClick={onSaveSnapshot} disabled={isSaving}>
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            {isSaving ? "Saving..." : "Save Snapshot"}
                        </Button>
                        <Button size="sm" onClick={onSubmitForReview} disabled={isSaving}>
                            Submit for Review
                        </Button>
                    </>
                )}
                {status === "In Review" && (
                    <>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={onOpenRejectModal}
                            disabled={isSaving}
                        >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Reject
                        </Button>
                        <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                            disabled={!canPublish || isSaving}
                            onClick={onPublish}
                        >
                            <FileCheck className="mr-1.5 h-3.5 w-3.5" />
                            Publish Report
                        </Button>
                    </>
                )}
                {status === "Published" && (
                    <Badge variant="outline" className="text-emerald-600 border-emerald-500">
                        <CheckCircle className="mr-1 h-3 w-3" /> Published & Retained
                    </Badge>
                )}
            </div>
        </div>
    );
}
