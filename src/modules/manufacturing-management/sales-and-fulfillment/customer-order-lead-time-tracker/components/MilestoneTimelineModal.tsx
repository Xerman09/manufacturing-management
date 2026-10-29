"use client";

import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { inversionDetails } from "../utils/inversions";
import { AssessmentBadge } from "./AssessmentBadge";
import {
    X,
    CheckCircle2,
    Clock,
    FileText,
    ArrowDown,
    Building2,
    User,
} from "lucide-react";
import { CustomerOrderLeadTimeItem } from "../types";
import { Button } from "@/components/ui/button";

interface MilestoneTimelineModalProps {
    targetPair?: string;
    isOpen: boolean;
    onClose: () => void;
    order: CustomerOrderLeadTimeItem | null;
}

export function MilestoneTimelineModal({ isOpen, onClose, order, targetPair }: MilestoneTimelineModalProps) {
    const [reviewPair, setReviewPair] = useState<string | undefined>();
    const content = useRef<HTMLDivElement>(null);
    const invoker = useRef<HTMLElement | null>(null);
    const activePair = reviewPair || targetPair;
    useEffect(() => {
        if (isOpen) invoker.current = document.activeElement as HTMLElement;
    }, [isOpen]);
    useEffect(() => {
        if (!isOpen || !activePair) return;
        const timer = setTimeout(() => {
            const target = content.current?.querySelector<HTMLElement>(`[data-pair="${activePair}"]`);
            target?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            target?.focus({ preventScroll: true });
        }, 100);
        return () => clearTimeout(timer);
    }, [isOpen, activePair]);
    if (!isOpen || !order) return null;
    const inversions = inversionDetails(order);
    const selected = inversions.find(pair => pair.key === activePair);

    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent ref={content} showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); if (invoker.current?.isConnected) invoker.current.focus(); }} className="sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
                {inversions.length > 0 && <section className="border-b p-4 text-xs space-y-2"><p>Expected lifecycle sequence differs from recorded timestamps; review the source records.</p>{inversions.map(pair => <button type="button" key={pair.key} onClick={() => setReviewPair(pair.key)} className="block text-left text-destructive underline focus-visible:outline-2">{pair.explanation}</button>)}</section>}
                <section className="px-6 py-3 space-y-1 border-b text-xs">
                    <AssessmentBadge assessment={order.assessment} />
                    {order.assessment.reasons.map(reason => <p key={reason}>{reason}</p>)}
                    <p>Assessed {new Date(order.assessment.assessedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} PHT. Approval SLA: 8 continuous elapsed hours.</p>
                    <p>On Track checks delivery date and approval turnaround only. Other stage SLAs are not assessed.</p>
                </section>
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <DialogTitle className="text-lg font-bold text-foreground">
                                Lifecycle Milestones & Lead Time Audit
                            </DialogTitle>
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                                {order.orderNo}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5" />
                                {order.customerName}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5" />
                                {order.branchName}
                            </span>
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Summary metrics header */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/40 border border-border rounded-xl p-3.5">
                        <div>
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                                Order Date
                            </span>
                            <span className="text-sm font-semibold text-foreground">
                                {order.orderDate}
                            </span>
                        </div>
                        <div>
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                                Delivery Date
                            </span>
                            <span className="text-sm font-semibold text-foreground">
                                {order.promisedDate ? new Date(order.promisedDate).toLocaleDateString() : "Not Specified"}
                            </span>
                        </div>
                        <div>
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                                Reporting Status
                            </span>
                            <span className="text-sm font-semibold text-foreground">
                                {order.reportingStatus}
                            </span>
                        </div>
                        <div>
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                                Total Lead / Age
                            </span>
                            <span className="text-sm font-bold text-primary">
                                {order.reportingStatus === "Completed"
                                    ? order.totalLeadTimeFormatted || "—"
                                    : order.ongoingAgeFormatted
                                    ? `${order.ongoingAgeFormatted} (Ongoing)`
                                    : "—"}
                            </span>
                        </div>
                    </div>

                    {/* Timeline stepper */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-foreground">
                                Milestone Event Timeline
                            </h3>
                            <span className="text-xs font-normal text-muted-foreground">
                                {order.milestones.filter((m) => m.timestamp).length} of {order.milestones.length} Recorded
                            </span>
                        </div>

                        <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                            {order.milestones.map((m) => {
                                const isRecorded = Boolean(m.timestamp);
                                const stageDur = order.stages.find((s) => s.fromStage === m.stage);

                                return (
                                    <div key={m.id} className="relative group">
                                        {/* Milestone Node Icon */}
                                        <div
                                            className={`absolute -left-6 top-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                                isRecorded
                                                    ? "bg-emerald-500 border-background text-white shadow-sm"
                                                    : "bg-background border-border text-muted-foreground border-dashed"
                                            }`}
                                        >
                                            {isRecorded ? (
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                            ) : (
                                                <Clock className="w-3 h-3 text-muted-foreground" />
                                            )}
                                        </div>

                                        {/* Milestone Card */}
                                        <div
                                            className={`p-3.5 rounded-xl border text-xs transition-all ${selected && [selected.fromStage, selected.toStage].includes(m.stage) ? "ring-2 ring-destructive " : ""}${
                                                isRecorded
                                                    ? "bg-card border-border shadow-sm text-foreground"
                                                    : "bg-muted/20 border-dashed border-border text-muted-foreground"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="font-bold text-foreground text-sm">
                                                    {m.stageName}
                                                </div>
                                                <div className="text-muted-foreground font-mono text-[11px]">
                                                    {m.timestamp ? new Date(m.timestamp).toLocaleString() : "Pending Event"}
                                                </div>
                                            </div>

                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                                                {m.referenceModule && (
                                                    <span className="px-2 py-0.5 rounded bg-muted text-foreground text-[10px] border border-border">
                                                        {m.referenceModule}
                                                    </span>
                                                )}
                                                {m.referenceDocumentNo && (
                                                    <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                                                        <FileText className="w-3 h-3 text-muted-foreground" />
                                                        {m.referenceDocumentNo}
                                                    </span>
                                                )}
                                                {m.remarks && (
                                                    <span className="text-[11px] italic text-muted-foreground">{m.remarks}</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Stage Duration Pill to next node */}
                                        {stageDur && (
                                            <div data-pair={`${stageDur.fromStage}-${stageDur.toStage}`} tabIndex={-1} className={activePair === `${stageDur.fromStage}-${stageDur.toStage}` ? "rounded ring-2 ring-destructive focus:outline-none" : ""}>
                                            {stageDur.isNegative && <p className="text-destructive">{inversions.find(pair => pair.key === `${stageDur.fromStage}-${stageDur.toStage}`)?.explanation}</p>}
                                            <div className="my-2 ml-4 flex items-center gap-2">
                                                <div
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                                        stageDur.isNegative
                                                            ? "bg-destructive/10 text-destructive border-destructive/20"
                                                            : stageDur.isDelayed
                                                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                                            : "bg-muted text-muted-foreground border-border"
                                                    }`}
                                                >
                                                    <ArrowDown className="w-3 h-3" />
                                                    <span>{stageDur.durationFormatted}</span>
                                                    {stageDur.isNegative && (
                                                        <span className="text-[10px] text-destructive font-normal">
                                                            (Sequence Inversion)
                                                        </span>
                                                    )}
                                                    {stageDur.isDelayed && !stageDur.isNegative && (
                                                        <span className="text-[10px] text-amber-500 font-normal">
                                                            (Over 48 hours; duration marker, not SLA)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-border bg-muted/40 flex items-center justify-end">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold rounded-lg"
                    >
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
