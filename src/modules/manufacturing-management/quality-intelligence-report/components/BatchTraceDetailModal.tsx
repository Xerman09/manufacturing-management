"use client";

import React, { useEffect, useState } from "react";
import {
    AlertCircle,
    Boxes,
    CheckCircle2,


    GitBranch,
    ShieldAlert,
    ShieldCheck,

} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeFormatNumber } from "../utils/qualityMath";
import type { QualityJobOrderDetail } from "../types";

interface BatchTraceDetailModalProps {
    jobOrderId: number | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const BatchTraceDetailModal: React.FC<BatchTraceDetailModalProps> = ({
    jobOrderId,
    open,
    onOpenChange
}) => {
    const [detail, setDetail] = useState<QualityJobOrderDetail | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !jobOrderId) {
            setDetail(null);
            setError(null);
            return;
        }

        const controller = new AbortController();
        const fetchDetail = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/manufacturing/reports/quality-intelligence-report/detail?jobOrderId=${jobOrderId}`,
                    { signal: controller.signal }
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${res.status}`);
                }
                const data = (await res.json()) as QualityJobOrderDetail;
                setDetail(data);
            } catch (err: unknown) {
                if ((err as Error)?.name === "AbortError") return;
                const msg = (err as Error)?.message || "Failed to load Job Order details.";
                setError(msg);
                toast.error(msg);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetail();
        return () => controller.abort();
    }, [open, jobOrderId]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-6xl xl:max-w-7xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl border-border/70 shadow-2xl">
                <DialogHeader className="p-5 pb-3 border-b border-border/60 bg-muted/20">
                    <div className="flex items-center justify-between gap-3 pr-6">
                        <div>
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-lg font-bold tracking-tight">
                                    {detail?.jobOrderNo || `Job Order #${jobOrderId}`}
                                </DialogTitle>
                                {detail && (
                                    <Badge variant="outline" className="text-xs">
                                        {detail.status}
                                    </Badge>
                                )}
                            </div>
                            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                {detail?.productName || "Finished Goods SKU"} • Quality & Genealogy Deep Dive
                            </DialogDescription>
                        </div>
                        {detail && (
                            <div className="text-right text-xs">
                                <span className="text-muted-foreground">Target: </span>
                                <span className="font-bold text-foreground">
                                    {safeFormatNumber(detail.targetQty)} units
                                </span>
                                {detail.actualQtyProduced !== null && (
                                    <span className="ml-2 text-muted-foreground">
                                        (Produced: <strong className="text-foreground">{safeFormatNumber(detail.actualQtyProduced)}</strong>)
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    {detail && (
                        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-border/50 text-xs">
                            <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-md border border-border/60">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground font-sans">Output Lot:</span>
                                <span className="font-mono font-medium text-foreground">{detail.outputLotNo || "-"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-md border border-border/60">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground font-sans">Output Batch:</span>
                                <span className="font-mono font-medium text-foreground">{detail.outputBatchNo || "-"}</span>
                            </div>
                            {detail.workCenterName && detail.workCenterName !== "-" && (
                                <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-md border border-border/60">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground font-sans">Line / Station:</span>
                                    <span className="font-medium text-foreground">{detail.workCenterName}</span>
                                </div>
                            )}
                        </div>
                    )}
                </DialogHeader>

                <div className="p-5">
                    {isLoading ? (
                        <div className="space-y-3 py-6">
                            <Skeleton className="h-6 w-1/3" />
                            <Skeleton className="h-24 w-full" />
                            <Skeleton className="h-24 w-full" />
                        </div>
                    ) : error ? (
                        <div className="py-12 text-center text-xs text-rose-600 dark:text-rose-400">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-80" />
                            {error}
                        </div>
                    ) : detail ? (
                        <Tabs defaultValue="genealogy" className="w-full space-y-4">
                            <TabsList className="grid grid-cols-4 h-9 p-1 bg-muted/60 rounded-xl text-xs">
                                <TabsTrigger value="genealogy" className="rounded-lg text-xs font-semibold">
                                    <GitBranch className="h-3.5 w-3.5 mr-1.5" />
                                    Genealogy ({detail.genealogy.length})
                                </TabsTrigger>
                                <TabsTrigger value="yield" className="rounded-lg text-xs font-semibold">
                                    <Boxes className="h-3.5 w-3.5 mr-1.5" />
                                    Yield Shifts ({detail.yieldLedger.length})
                                </TabsTrigger>
                                <TabsTrigger value="inspections" className="rounded-lg text-xs font-semibold">
                                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                                    QA Checks ({detail.qaRecords.length})
                                </TabsTrigger>
                                <TabsTrigger value="dispositions" className="rounded-lg text-xs font-semibold">
                                    <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                                    Dispositions ({detail.dispositions.length})
                                </TabsTrigger>
                            </TabsList>

                            {/* Tab 1: Genealogy */}
                            <TabsContent value="genealogy" className="space-y-3">
                                {detail.genealogy.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-muted-foreground">
                                        No raw material genealogy records found for this batch.
                                    </div>
                                ) : (
                                    <div className="border border-border/70 rounded-xl overflow-hidden shadow-sm">
                                        <table className="w-full text-xs">
                                            <thead className="bg-muted/40 border-b border-border/70 text-muted-foreground font-bold">
                                                <tr>
                                                    <th className="py-2.5 px-3 text-left">Component SKU</th>
                                                    <th className="py-2.5 px-3 text-left">Raw Material Lot No</th>
                                                    <th className="py-2.5 px-3 text-left">Raw Material Batch No</th>
                                                    <th className="py-2.5 px-3 text-right">Consumed Quantity</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                                {detail.genealogy.map((g, idx) => (
                                                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                                                        <td className="py-2 px-3 font-medium text-foreground">
                                                            {g.componentProductName}
                                                        </td>
                                                        <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">
                                                            {g.componentLotName || "-"}
                                                        </td>
                                                        <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">
                                                            {g.componentBatchNo || "-"}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-semibold">
                                                            {safeFormatNumber(g.consumedQty, 2)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </TabsContent>

                            {/* Tab 2: Yield Ledger Shifts */}
                            <TabsContent value="yield" className="space-y-3">
                                {detail.yieldLedger.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-muted-foreground">
                                        No shift yield records logged.
                                    </div>
                                ) : (
                                    <div className="border border-border/70 rounded-xl overflow-hidden shadow-sm">
                                        <table className="w-full text-xs">
                                            <thead className="bg-muted/40 border-b border-border/70 text-muted-foreground font-bold">
                                                <tr>
                                                    <th className="py-2.5 px-3 text-left">Shift / Time</th>
                                                    <th className="py-2.5 px-3 text-left">Station / Lot</th>
                                                    <th className="py-2.5 px-3 text-right">Yield Qty</th>
                                                    <th className="py-2.5 px-3 text-right">Scrap Qty</th>
                                                    <th className="py-2.5 px-3 text-right">Rejected Qty</th>
                                                    <th className="py-2.5 px-3 text-center">QA Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                                {detail.yieldLedger.map((yr) => (
                                                    <tr key={yr.ledgerId} className="hover:bg-muted/20 transition-colors">
                                                        <td className="py-2 px-3">
                                                            <div className="font-semibold text-foreground">{yr.shiftName}</div>
                                                            <div className="text-[10px] text-muted-foreground">{yr.loggedAt}</div>
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            <div>{yr.workCenterName || "-"}</div>
                                                            <div className="text-[10px] font-mono text-muted-foreground">
                                                                {yr.lotNumber || "-"}
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                                            {safeFormatNumber(yr.yieldQty)}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-semibold text-amber-600 dark:text-amber-400">
                                                            {safeFormatNumber(yr.scrapQty)}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                                                            {safeFormatNumber(yr.rejectedQty)}
                                                        </td>
                                                        <td className="py-2 px-3 text-center">
                                                            <Badge
                                                                variant="outline"
                                                                className={
                                                                    yr.qaStatus === "Passed"
                                                                        ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                                                                        : "border-rose-500/50 text-rose-600 dark:text-rose-400"
                                                                }
                                                            >
                                                                {yr.qaStatus}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </TabsContent>

                            {/* Tab 3: In-Process QA Inspections */}
                            <TabsContent value="inspections" className="space-y-3">
                                {detail.qaRecords.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-muted-foreground">
                                        No in-process inspection checks recorded for this Job Order.
                                    </div>
                                ) : (
                                    <div className="border border-border/70 rounded-xl overflow-hidden shadow-sm">
                                        <table className="w-full text-xs">
                                            <thead className="bg-muted/40 border-b border-border/70 text-muted-foreground font-bold">
                                                <tr>
                                                    <th className="py-2.5 px-3 text-left">Inspection Parameter</th>
                                                    <th className="py-2.5 px-3 text-left">Test Type</th>
                                                    <th className="py-2.5 px-3 text-left">Recorded Value</th>
                                                    <th className="py-2.5 px-3 text-center">Result</th>
                                                    <th className="py-2.5 px-3 text-left">Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                                {detail.qaRecords.map((qr) => (
                                                    <tr key={qr.qaRecordId} className="hover:bg-muted/20 transition-colors">
                                                        <td className="py-2 px-3">
                                                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                                                                {qr.parameterName}
                                                                {qr.isCritical && (
                                                                    <Badge variant="destructive" className="text-[9px] py-0 px-1">
                                                                        Critical
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground">{qr.inspectedAt}</div>
                                                        </td>
                                                        <td className="py-2 px-3 text-muted-foreground">{qr.testType}</td>
                                                        <td className="py-2 px-3 font-mono font-medium">{qr.valueLabel}</td>
                                                        <td className="py-2 px-3 text-center">
                                                            {qr.isPassed ? (
                                                                <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                                                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                                                    Passed
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                                                                    <AlertCircle className="h-3.5 w-3.5 mr-1" />
                                                                    Failed
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3 text-muted-foreground text-[11px]">
                                                            {qr.remarks || "-"}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </TabsContent>

                            {/* Tab 4: Dispositions */}
                            <TabsContent value="dispositions" className="space-y-3">
                                {detail.dispositions.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-muted-foreground">
                                        No QA dispositions recorded for this Job Order.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {detail.dispositions.map((d) => (
                                            <div
                                                key={d.id}
                                                className="border border-border/70 rounded-xl p-3.5 bg-background shadow-sm space-y-2 text-xs"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="font-bold text-foreground">
                                                        {d.taskName} {d.stationName ? `• ${d.stationName}` : ""}
                                                    </div>
                                                    <Badge variant="secondary">
                                                        Decision: {d.decision || "Pending"}
                                                    </Badge>
                                                </div>
                                                <div className="text-muted-foreground text-[11px]">
                                                    Expected: <strong>{safeFormatNumber(d.expectedQty)}</strong> | Actual: <strong>{safeFormatNumber(d.actualQty)}</strong> (Loss: {safeFormatNumber(Math.max(0, d.expectedQty - d.actualQty))} units)
                                                </div>
                                                {d.failedParameters && d.failedParameters.length > 0 && (
                                                    <div className="pt-1.5 border-t border-border/50">
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                                            Failed Inspection Parameters:
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            {d.failedParameters.map((p, pIdx) => (
                                                                <Badge
                                                                    key={pIdx}
                                                                    variant="outline"
                                                                    className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                                                >
                                                                    {p.test_name || "Parameter failure"}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
};
