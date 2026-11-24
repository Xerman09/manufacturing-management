"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock,
    FileSpreadsheet,
    Layers,
    ListTree,
    ShieldCheck,
    X,
    XCircle
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import type { PPRJobOrderDetail } from "../types";

interface JobOrderDetailModalProps {
    jobOrderId: number | null;
    open: boolean;
    onClose: () => void;
}

type DetailTabKey = "yield" | "bom" | "qa" | "timeline";

export const JobOrderDetailModal: React.FC<JobOrderDetailModalProps> = ({
    jobOrderId,
    open,
    onClose
}) => {
    const [detail, setDetail] = useState<PPRJobOrderDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<DetailTabKey>("yield");

    useEffect(() => {
        if (!open || !jobOrderId) {
            setDetail(null);
            setError(null);
            return;
        }

        const controller = new AbortController();
        const fetchDetail = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/manufacturing/reports/production-performance-report/detail?jobOrderId=${jobOrderId}`,
                    { signal: controller.signal }
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${res.status}`);
                }
                const data = (await res.json()) as PPRJobOrderDetail;
                setDetail(data);
            } catch (err: unknown) {
                if ((err as Error)?.name === "AbortError") return;
                setError(err instanceof Error ? err.message : "Failed to load details.");
            } finally {
                setLoading(false);
            }
        };

        fetchDetail();
        return () => controller.abort();
    }, [open, jobOrderId]);

    const tabs: Array<{ key: DetailTabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
        { key: "yield", label: "Yield Ledger", icon: Activity },
        { key: "bom", label: "BOM Variance", icon: Layers },
        { key: "qa", label: "QA Checks", icon: ShieldCheck },
        { key: "timeline", label: "Status Timeline", icon: ListTree }
    ];

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border-border/80 shadow-2xl">
                <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20 shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-lg font-black tracking-tight">
                                    {detail?.jobOrderNo || `Job Order #${jobOrderId}`}
                                </DialogTitle>
                                {detail && (
                                    <Badge variant="outline" className="text-xs">
                                        {detail.status}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {detail?.productName || "Finished Good"} · Target:{" "}
                                {detail ? `${detail.targetQty.toLocaleString()} units` : "-"}
                            </p>
                        </div>
                    </div>

                    {/* Internal Tab Bar */}
                    <div className="flex items-center gap-1 mt-3 border-t pt-3">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                        isActive
                                            ? "text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {isActive && (
                                        <motion.span
                                            layoutId="qi-modal-tab-pill"
                                            transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                            className="absolute inset-0 rounded-lg bg-background shadow-sm border border-border/60"
                                        />
                                    )}
                                    <Icon className="relative z-10 h-3.5 w-3.5" />
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                    {loading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-8 w-full rounded-lg" />
                            <Skeleton className="h-12 w-full rounded-lg" />
                            <Skeleton className="h-12 w-full rounded-lg" />
                            <Skeleton className="h-12 w-full rounded-lg" />
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center text-xs text-rose-600 dark:text-rose-400">
                            <AlertCircle className="h-6 w-6 mx-auto mb-2 text-rose-500" />
                            {error}
                        </div>
                    ) : !detail ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                            No detail records found for this batch.
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.18 }}
                            >
                                {/* Tab 1: Yield Ledger */}
                                {activeTab === "yield" && (
                                    <div className="space-y-2">
                                        {detail.yieldLedger.length === 0 ? (
                                            <div className="text-center py-8 text-xs text-muted-foreground">
                                                No shift yield entries recorded for this job order.
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted/30">
                                                        <TableHead title="Shift Name" className="text-xs">Shift</TableHead>
                                                        <TableHead title="Work Center / Station" className="text-xs">Station</TableHead>
                                                        <TableHead title="Yield Quantity Produced" className="text-xs">Yield Qty</TableHead>
                                                        <TableHead title="Scrap Quantity Incurred" className="text-xs">Scrap Qty</TableHead>
                                                        <TableHead title="Rejected Quantity" className="text-xs">Rejected Qty</TableHead>
                                                        <TableHead title="QA Inspection Status" className="text-xs">QA Status</TableHead>
                                                        <TableHead title="Timestamp Logged" className="text-xs">Logged At</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {detail.yieldLedger.map((yl) => (
                                                        <TableRow key={yl.ledgerId}>
                                                            <TableCell className="text-xs font-semibold">
                                                                {yl.shiftName}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">
                                                                {yl.workCenterName || "-"}
                                                            </TableCell>
                                                            <TableCell className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                                {yl.yieldQty.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-amber-600 dark:text-amber-400">
                                                                {yl.scrapQty.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-rose-600 dark:text-rose-400">
                                                                {yl.rejectedQty.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                <Badge
                                                                    variant={
                                                                        yl.qaStatus === "Passed"
                                                                            ? "outline"
                                                                            : "destructive"
                                                                    }
                                                                    className="text-[10px]"
                                                                >
                                                                    {yl.qaStatus}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">
                                                                {yl.loggedAt}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </div>
                                )}

                                {/* Tab 2: BOM Variance */}
                                {activeTab === "bom" && (
                                    <div className="space-y-2">
                                        {detail.bomVariance.length === 0 ? (
                                            <div className="text-center py-8 text-xs text-muted-foreground">
                                                No BOM materials allocated to this job order.
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted/30">
                                                        <TableHead title="Allocated Material / Packaging Component" className="text-xs">Material Component</TableHead>
                                                        <TableHead title="Standard BOM Quantity Spec" className="text-xs">Theoretical (BOM)</TableHead>
                                                        <TableHead title="Actual Physical Stock Consumed" className="text-xs">Actual Consumed</TableHead>
                                                        <TableHead title="Difference (Actual - Theoretical)" className="text-xs">Variance Qty</TableHead>
                                                        <TableHead title="Percentage Variance" className="text-xs">Variance %</TableHead>
                                                        <TableHead title="Unit of Measurement" className="text-xs">UOM</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {detail.bomVariance.map((bm, i) => {
                                                        const varPct = bm.variancePct ?? 0;
                                                        const isExcess = varPct > 2;
                                                        return (
                                                            <TableRow key={i}>
                                                                <TableCell className="text-xs font-semibold">
                                                                    {bm.materialName}
                                                                </TableCell>
                                                                <TableCell className="text-xs">
                                                                    {bm.theoreticalQty !== null
                                                                        ? bm.theoreticalQty.toLocaleString()
                                                                        : "-"}
                                                                </TableCell>
                                                                <TableCell className="text-xs font-semibold">
                                                                    {bm.actualConsumedQty.toLocaleString()}
                                                                </TableCell>
                                                                <TableCell className="text-xs">
                                                                    {bm.varianceQty !== null
                                                                        ? `${bm.varianceQty > 0 ? "+" : ""}${bm.varianceQty.toLocaleString()}`
                                                                        : "-"}
                                                                </TableCell>
                                                                <TableCell className="text-xs">
                                                                    {bm.variancePct !== null ? (
                                                                        <span
                                                                            className={`font-semibold ${
                                                                                isExcess
                                                                                    ? "text-rose-600 dark:text-rose-400"
                                                                                    : "text-emerald-600 dark:text-emerald-400"
                                                                            }`}
                                                                        >
                                                                            {bm.variancePct > 0 ? "+" : ""}
                                                                            {bm.variancePct}%
                                                                        </span>
                                                                    ) : (
                                                                        "-"
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {bm.uomLabel}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </div>
                                )}

                                {/* Tab 3: QA Checks */}
                                {activeTab === "qa" && (
                                    <div className="space-y-2">
                                        {detail.qaRecords.length === 0 ? (
                                            <div className="text-center py-8 text-xs text-muted-foreground">
                                                No quality inspection parameter tests recorded.
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-muted/30">
                                                        <TableHead title="Inspection Parameter Test Description" className="text-xs">Parameter</TableHead>
                                                        <TableHead title="Test Type (Numeric / Text / Boolean)" className="text-xs">Type</TableHead>
                                                        <TableHead title="Recorded Test Value" className="text-xs">Result Value</TableHead>
                                                        <TableHead title="Inspection Verdict" className="text-xs">Verdict</TableHead>
                                                        <TableHead title="Quality Criticality Flag" className="text-xs">Criticality</TableHead>
                                                        <TableHead title="Inspection Timestamp" className="text-xs">Inspected At</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {detail.qaRecords.map((qr) => (
                                                        <TableRow key={qr.qaRecordId}>
                                                            <TableCell className="text-xs font-semibold">
                                                                {qr.parameterName}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">
                                                                {qr.testType}
                                                            </TableCell>
                                                            <TableCell className="text-xs font-mono">
                                                                {qr.valueLabel}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                {qr.isPassed ? (
                                                                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                                                                        <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                                                                        <XCircle className="h-3.5 w-3.5" /> Failed
                                                                    </span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                {qr.isCritical ? (
                                                                    <Badge variant="destructive" className="text-[9px]">
                                                                        Critical
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="secondary" className="text-[9px]">
                                                                        Standard
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-xs text-muted-foreground">
                                                                {qr.inspectedAt}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </div>
                                )}

                                {/* Tab 4: Status Timeline */}
                                {activeTab === "timeline" && (
                                    <div className="space-y-3">
                                        {detail.statusTimeline.length === 0 ? (
                                            <div className="text-center py-8 text-xs text-muted-foreground">
                                                No status transitions logged for this job order.
                                            </div>
                                        ) : (
                                            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/70">
                                                {detail.statusTimeline.map((st) => (
                                                    <div key={st.historyId} className="relative space-y-1">
                                                        <div className="absolute -left-6 top-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-foreground">
                                                                {st.newStatus}
                                                            </span>
                                                            {st.oldStatus && (
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    (from {st.oldStatus})
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] text-muted-foreground ml-auto">
                                                                {st.changedAt}
                                                            </span>
                                                        </div>
                                                        {st.changedByLabel && (
                                                            <div className="text-[11px] text-muted-foreground">
                                                                Updated by: {st.changedByLabel}
                                                            </div>
                                                        )}
                                                        {st.remarks && (
                                                            <div className="text-xs bg-muted/40 p-2 rounded-lg border border-border/50 text-foreground/80">
                                                                {st.remarks}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
