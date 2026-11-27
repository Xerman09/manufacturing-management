"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, Clock, FileCheck, Layers, X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { SnapshotMetaItem } from "./SnapshotSelectorCombobox";

interface SnapshotPreviewModalProps {
    snapshot: SnapshotMetaItem | null;
    isOpen: boolean;
    onClose: () => void;
    onLoadSnapshot: (id: number) => void;
}

export function SnapshotPreviewModal({
    snapshot,
    isOpen,
    onClose,
    onLoadSnapshot
}: SnapshotPreviewModalProps) {
    const [detail, setDetail] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!snapshot || !isOpen) {
            setDetail(null);
            return;
        }

        setIsLoading(true);
        fetch(`/api/manufacturing/reports/predictive-maintenance-report/snapshots/${snapshot.id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((res) => {
                if (res?.data) {
                    setDetail(res.data);
                }
            })
            .catch(() => {})
            .finally(() => setIsLoading(false));
    }, [snapshot, isOpen]);

    if (!snapshot) return null;

    const payload = detail?.report_payload;
    const kpis = payload?.kpis;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between text-base">
                        <span>Snapshot Preview: {snapshot.report_code} (v{snapshot.version})</span>
                        <Badge
                            className={
                                snapshot.status === "Published"
                                    ? "bg-emerald-600 text-white"
                                    : snapshot.status === "In Review"
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-500 text-white"
                            }
                        >
                            {snapshot.status}
                        </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Created {snapshot.created_at ? new Date(snapshot.created_at).toLocaleString() : "N/A"}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="space-y-3 py-4">
                        <Skeleton className="h-16 w-full rounded-md" />
                        <Skeleton className="h-24 w-full rounded-md" />
                    </div>
                ) : (
                    <div className="space-y-4 text-xs py-2">
                        {/* Scope & Dates */}
                        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                            <div>
                                <span className="text-muted-foreground block text-[11px]">Evaluation Cutoff Range</span>
                                <span className="font-semibold">{snapshot.cutoff_date_from} → {snapshot.cutoff_date_to}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block text-[11px]">Prediction Horizon</span>
                                <span className="font-semibold">{snapshot.prediction_horizon}</span>
                            </div>
                        </div>

                        {/* Snapshot KPI Highlights */}
                        {kpis && (
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-md border p-2 bg-card">
                                    <span className="text-[10px] text-muted-foreground block">Fleet Risk</span>
                                    <span className="font-bold text-sm text-foreground">{kpis.fleetRiskScore}%</span>
                                </div>
                                <div className="rounded-md border p-2 bg-card">
                                    <span className="text-[10px] text-muted-foreground block">At-Risk Assets</span>
                                    <span className="font-bold text-sm text-amber-600">{kpis.highRiskAssetCount}</span>
                                </div>
                                <div className="rounded-md border p-2 bg-card">
                                    <span className="text-[10px] text-muted-foreground block">Operating Hours</span>
                                    <span className="font-bold text-sm text-foreground">{kpis.totalOperatingRunHours}</span>
                                </div>
                            </div>
                        )}

                        {/* Reviewer / Rejection Notes if present */}
                        {snapshot.reviewer_notes && (
                            <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-2.5 space-y-1">
                                <span className="font-semibold text-amber-700 dark:text-amber-400 block text-[11px]">
                                    Reviewer Feedback / Rejection Notes:
                                </span>
                                <p className="text-muted-foreground">{snapshot.reviewer_notes}</p>
                                {snapshot.rejected_at && (
                                    <div className="text-[10px] text-muted-foreground pt-1 border-t border-amber-200/50">
                                        Rejected on {new Date(snapshot.rejected_at).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Asset Summary preview */}
                        {payload?.assetRiskRows && (
                            <div className="space-y-1.5">
                                <span className="font-semibold block text-[11px]">
                                    Evaluated Assets ({payload.assetRiskRows.length} total)
                                </span>
                                <div className="max-h-36 overflow-y-auto space-y-1 border rounded-md p-2 bg-card">
                                    {payload.assetRiskRows.slice(0, 5).map((row: any) => (
                                        <div key={row.assetId} className="flex items-center justify-between py-1 border-b last:border-b-0 text-[11px]">
                                            <span className="truncate max-w-[240px] font-medium">{row.assetName}</span>
                                            <Badge variant="outline" className="text-[10px]">{row.predictedBreakdownRiskPct}% - {row.riskLevel}</Badge>
                                        </div>
                                    ))}
                                    {payload.assetRiskRows.length > 5 && (
                                        <div className="text-[10px] text-muted-foreground text-center pt-1 italic">
                                            + {payload.assetRiskRows.length - 5} more assets in snapshot
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-3">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        size="sm"
                        className="bg-primary text-primary-foreground font-semibold"
                        onClick={() => {
                            onLoadSnapshot(snapshot.id);
                            onClose();
                        }}
                    >
                        <Layers className="mr-1.5 h-3.5 w-3.5" />
                        Load Snapshot to Canvas
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
