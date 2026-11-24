"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
    Activity,
    AlertCircle,
    ClipboardList,
    RefreshCw,
    ShieldCheck,
    TrendingUp
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "./components/ReportFilterBar";
import { KpiSummaryStrip } from "./components/KpiSummaryStrip";
import { OverviewTab } from "./components/OverviewTab";
import { BottleneckTab } from "./components/BottleneckTab";
import { QualityTab } from "./components/QualityTab";
import { JobOrderTable } from "./components/JobOrderTable";
import { JobOrderDetailModal } from "./components/JobOrderDetailModal";
import { AIInsightDrawer } from "./components/AIInsightDrawer";
import type {
    PPRFilterCatalogPayload,
    PPRTabKey,
    ProductionAIAnalysisPayload,
    ProductionPerformanceFilters,
    ProductionPerformanceReportPayload
} from "./types";

function getThisMonthDates() {
    const now = new Date();
    // Offset by +8 hours for Manila timezone
    const manilaTime = new Date(now.getTime() + 8 * 3600 * 1000);
    const y = manilaTime.getUTCFullYear();
    const m = manilaTime.getUTCMonth();

    const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

    return { start, end };
}

const initialDates = getThisMonthDates();

const INITIAL_FILTERS: ProductionPerformanceFilters = {
    dateFrom: initialDates.start,
    dateTo: initialDates.end,
    productId: "all",
    workCenterId: "all",
    routeId: "all",
    status: "all"
};

const TABS: Array<{
    key: PPRTabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { key: "overview", label: "Overview & Trends", icon: TrendingUp },
    { key: "bottlenecks", label: "Bottlenecks & Stations", icon: Activity },
    { key: "quality", label: "Quality & Defects", icon: ShieldCheck },
    { key: "job-orders", label: "Job Orders", icon: ClipboardList }
];

export default function ProductionPerformanceReportModule() {
    const [draftFilters, setDraftFilters] = useState<ProductionPerformanceFilters>(INITIAL_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState<ProductionPerformanceFilters>(INITIAL_FILTERS);

    const [catalog, setCatalog] = useState<PPRFilterCatalogPayload>({
        products: [],
        workCenters: [],
        routes: []
    });
    const [catalogLoading, setCatalogLoading] = useState(true);

    const [payload, setPayload] = useState<ProductionPerformanceReportPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<PPRTabKey>("overview");

    // AI Analysis state
    const [aiAnalysis, setAiAnalysis] = useState<ProductionAIAnalysisPayload | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

    // Export state
    const [exportingFormat, setExportingFormat] = useState<"pdf" | "xlsx" | null>(null);

    // Detail modal state
    const [selectedJobOrderId, setSelectedJobOrderId] = useState<number | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Load filter options on mount
    useEffect(() => {
        const controller = new AbortController();
        const fetchFilters = async () => {
            setCatalogLoading(true);
            try {
                const res = await fetch(
                    "/api/manufacturing/reports/production-performance-report/filters",
                    { signal: controller.signal }
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${res.status}`);
                }
                const data = (await res.json()) as PPRFilterCatalogPayload;
                setCatalog({
                    products: Array.isArray(data.products) ? data.products : [],
                    workCenters: Array.isArray(data.workCenters) ? data.workCenters : [],
                    routes: Array.isArray(data.routes) ? data.routes : []
                });
            } catch (err: unknown) {
                if ((err as Error)?.name === "AbortError") return;
                toast.error("Unable to load filter options.");
            } finally {
                setCatalogLoading(false);
            }
        };

        fetchFilters();
        return () => controller.abort();
    }, []);

    // Load report whenever appliedFilters change
    const loadReport = useCallback(
        async (signal?: AbortSignal) => {
            setIsLoading(true);
            setError(null);
            setAiAnalysis(null);
            setAiError(null);

            try {
                const query = new URLSearchParams({
                    dateFrom: appliedFilters.dateFrom,
                    dateTo: appliedFilters.dateTo,
                    productId: appliedFilters.productId,
                    workCenterId: appliedFilters.workCenterId,
                    routeId: appliedFilters.routeId,
                    status: appliedFilters.status
                });

                const res = await fetch(
                    `/api/manufacturing/reports/production-performance-report?${query.toString()}`,
                    { signal }
                );

                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    throw new Error(
                        errJson.error || `Failed to load production report (HTTP ${res.status}).`
                    );
                }

                const data = (await res.json()) as ProductionPerformanceReportPayload;
                setPayload(data);

                if (data.meta.notices && data.meta.notices.length > 0) {
                    for (const notice of data.meta.notices) {
                        if (notice.severity === "error") {
                            toast.error(notice.message);
                        } else {
                            toast.warning(notice.message);
                        }
                    }
                }
            } catch (err: unknown) {
                if ((err as Error)?.name === "AbortError") return;
                const msg =
                    err instanceof Error ? err.message : "Failed to load production performance report.";
                setError(msg);
                toast.error(msg);
            } finally {
                setIsLoading(false);
            }
        },
        [appliedFilters]
    );

    useEffect(() => {
        const controller = new AbortController();
        loadReport(controller.signal);
        return () => controller.abort();
    }, [loadReport]);

    const handleDraftChange = useCallback((updates: Partial<ProductionPerformanceFilters>) => {
        setDraftFilters((prev) => ({ ...prev, ...updates }));
    }, []);

    const handleApplyFilters = useCallback(() => {
        if (
            draftFilters.dateFrom &&
            draftFilters.dateTo &&
            draftFilters.dateFrom > draftFilters.dateTo
        ) {
            toast.error("From Date must be on or before To Date.");
            return;
        }
        setAppliedFilters({ ...draftFilters });
        toast.success("Applied filter parameters.");
    }, [draftFilters]);

    const handleResetFilters = useCallback(() => {
        const fresh = getThisMonthDates();
        const reset: ProductionPerformanceFilters = {
            dateFrom: fresh.start,
            dateTo: fresh.end,
            productId: "all",
            workCenterId: "all",
            routeId: "all",
            status: "all"
        };
        setDraftFilters(reset);
        setAppliedFilters(reset);
        toast.info("Filters reset to current month.");
    }, []);

    const handleGenerateAiAnalysis = useCallback(async () => {
        if (!payload) {
            toast.error("Please wait for report data to load first.");
            return;
        }
        setAiLoading(true);
        setAiError(null);
        try {
            const res = await fetch(
                "/api/manufacturing/reports/production-performance-report/ai-analysis",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reportPayload: payload })
                }
            );

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || `Analysis failed (HTTP ${res.status}).`);
            }

            const data = (await res.json()) as ProductionAIAnalysisPayload;
            setAiAnalysis(data);
            toast.success("AI Production Performance Insights generated.");
        } catch (err: unknown) {
            const msg =
                err instanceof Error ? err.message : "Failed to generate AI production analysis.";
            setAiError(msg);
            toast.error(msg);
        } finally {
            setAiLoading(false);
        }
    }, [payload]);

    const handleOpenAiDrawer = useCallback(() => {
        setIsAiDrawerOpen(true);
        if (!aiAnalysis && !aiLoading) {
            void handleGenerateAiAnalysis();
        }
    }, [aiAnalysis, aiLoading, handleGenerateAiAnalysis]);

    const handleExport = useCallback(
        async (format: "pdf" | "xlsx") => {
            if (!payload) {
                toast.error("No data available to export.");
                return;
            }
            setExportingFormat(format);
            try {
                const res = await fetch(
                    "/api/manufacturing/reports/production-performance-report/export",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            format,
                            filters: appliedFilters,
                            aiAnalysis
                        })
                    }
                );

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `Export failed (HTTP ${res.status}).`);
                }

                if (format === "pdf") {
                    const htmlText = await res.text();
                    const printWindow = window.open("", "_blank");
                    if (printWindow) {
                        printWindow.document.write(htmlText);
                        printWindow.document.close();
                    } else {
                        // Popup blocked fallback
                        const blob = new Blob([htmlText], { type: "text/html" });
                        const url = URL.createObjectURL(blob);
                        window.open(url, "_blank");
                    }
                    toast.success("Opened printable PDF brief in print dialog.");
                } else {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `Production-Performance-Report-${new Date().toISOString().slice(0, 10)}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                    toast.success("Downloaded Excel spreadsheet report.");
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Export failed.";
                toast.error(msg);
            } finally {
                setExportingFormat(null);
            }
        },
        [payload, appliedFilters, aiAnalysis]
    );

    const handleRowClick = useCallback((id: number) => {
        setSelectedJobOrderId(id);
        setIsDetailModalOpen(true);
    }, []);

    return (
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
            {/* Header Title & Scope */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-border/60 pb-3.5">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                            Production Performance AI Report
                        </h1>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                            Manufacturing AI
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Analyze production trends, identify bottlenecks and loss drivers, and propose corrective actions.
                    </p>
                </div>
                {payload && (
                    <div className="text-[11px] text-muted-foreground text-left sm:text-right">
                        <div className="font-semibold text-foreground/80">
                            {payload.meta.productLabel} · {payload.meta.workCenterLabel}
                        </div>
                        <div>Last updated: {payload.meta.freshnessCutoff}</div>
                    </div>
                )}
            </div>

            {/* Filter Bar */}
            <ReportFilterBar
                draftFilters={draftFilters}
                appliedFilters={appliedFilters}
                catalog={catalog}
                catalogLoading={catalogLoading}
                isLoading={isLoading}
                aiLoading={aiLoading}
                exportingFormat={exportingFormat}
                onDraftChange={handleDraftChange}
                onApplyFilters={handleApplyFilters}
                onResetFilters={handleResetFilters}
                onOpenAiInsights={handleOpenAiDrawer}
                onExport={handleExport}
            />

            {/* Error Banner */}
            {error && (
                <Alert variant="destructive" className="rounded-2xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-bold">Unable to Load Report</AlertTitle>
                    <AlertDescription className="text-xs flex items-center justify-between gap-3">
                        <span>{error}</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void loadReport()}
                            className="h-7 text-xs gap-1.5 shrink-0"
                        >
                            <RefreshCw className="h-3 w-3" />
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {/* KPI Summary Strip */}
            {isLoading && !payload ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-[96px] w-full rounded-2xl" />
                    ))}
                </div>
            ) : (
                <KpiSummaryStrip
                    kpis={payload?.kpis || null}
                    hasError={Boolean(error)}
                    onSelectCard={(key) => {
                        if (key === "qa") setActiveTab("quality");
                        else if (key === "downtime" || key === "scrap") setActiveTab("bottlenecks");
                        else if (key === "yield") setActiveTab("job-orders");
                        else setActiveTab("overview");
                    }}
                />
            )}

            {/* Tab Navigation */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
                <div className="inline-flex items-center gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                    active
                                        ? "text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {active && (
                                    <motion.span
                                        layoutId="ppr-active-tab"
                                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                                        className="absolute inset-0 rounded-xl bg-background shadow-sm border border-border/60"
                                    />
                                )}
                                <Icon className="relative z-10 h-3.5 w-3.5" />
                                <span className="relative z-10">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Workspace with Smooth AnimatePresence */}
            {isLoading && !payload ? (
                <Skeleton className="h-[420px] w-full rounded-2xl" />
            ) : payload ? (
                <div className={isLoading ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                            {activeTab === "overview" && <OverviewTab payload={payload} />}
                            {activeTab === "bottlenecks" && <BottleneckTab payload={payload} />}
                            {activeTab === "quality" && <QualityTab payload={payload} />}
                            {activeTab === "job-orders" && (
                                <JobOrderTable
                                    jobOrders={payload.jobOrders}
                                    onSelectJobOrder={handleRowClick}
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            ) : null}

            {/* AI Insights Slide-Over Drawer */}
            <AIInsightDrawer
                isOpen={isAiDrawerOpen}
                onClose={() => setIsAiDrawerOpen(false)}
                payload={payload}
                analysis={aiAnalysis}
                isLoading={aiLoading}
                error={aiError}
                onGenerateAnalysis={handleGenerateAiAnalysis}
            />

            {/* Job Order Detail Modal */}
            <JobOrderDetailModal
                jobOrderId={selectedJobOrderId}
                open={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
            />
        </div>
    );
}

export { ProductionPerformanceReportModule };
