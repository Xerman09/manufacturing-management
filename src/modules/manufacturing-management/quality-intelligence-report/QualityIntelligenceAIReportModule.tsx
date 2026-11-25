"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
    Activity,
    AlertCircle,
    GitBranch,
    Lightbulb,
    RefreshCw
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "./components/ReportFilterBar";
import { KpiSummaryStrip } from "./components/KpiSummaryStrip";
import { QualityOverviewTab } from "./components/QualityOverviewTab";
import { LotTraceabilityTab } from "./components/LotTraceabilityTab";
import { RootCauseHypothesesTab } from "./components/RootCauseHypothesesTab";
import { BatchTraceDetailModal } from "./components/BatchTraceDetailModal";
import { QualityAICopilotDrawer } from "./components/QualityAICopilotDrawer";
import { getThisMonthDates } from "./utils/dateUtils";
import type {
    QualityAICommentaryPayload,
    QualityFilterCatalogPayload,
    QualityFilters,
    QualityReportPayload,
    QualityTabKey
} from "./types";

function defaultFilters(): QualityFilters {
    const { start, end } = getThisMonthDates();
    return {
        dateFrom: start,
        dateTo: end,
        productId: "all",
        workCenterId: "all",
        shiftName: "all",
        status: "all"
    };
}

const INITIAL_FILTERS: QualityFilters = defaultFilters();

const TABS: Array<{
    key: QualityTabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { key: "overview", label: "Defects & Yield Overview", icon: Activity },
    { key: "traceability", label: "Lot Traceability Matrix", icon: GitBranch },
    { key: "root-cause", label: "Root-Cause & Hypotheses", icon: Lightbulb }
];

export default function QualityIntelligenceAIReportModule() {
    // Dual filter state: draft vs applied
    const [draftFilters, setDraftFilters] = useState<QualityFilters>(INITIAL_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState<QualityFilters>(INITIAL_FILTERS);
    const appliedReasonRef = useRef<"apply" | "reset" | null>(null);

    const [catalog, setCatalog] = useState<QualityFilterCatalogPayload>({
        products: [],
        workCenters: [],
        shifts: []
    });
    const [catalogLoading, setCatalogLoading] = useState(true);

    const [payload, setPayload] = useState<QualityReportPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<QualityTabKey>("overview");

    // AI Copilot state
    const [aiCommentary, setAiCommentary] = useState<QualityAICommentaryPayload | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

    // Export state
    const [exportingFormat, setExportingFormat] = useState<"pdf" | "xlsx" | null>(null);

    // Detail drilldown modal
    const [selectedJobOrderId, setSelectedJobOrderId] = useState<number | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Load filter options on mount
    useEffect(() => {
        const controller = new AbortController();
        const fetchFilters = async () => {
            setCatalogLoading(true);
            try {
                const res = await fetch(
                    "/api/manufacturing/reports/quality-intelligence-report/filters",
                    { signal: controller.signal }
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${res.status}`);
                }
                const data = (await res.json()) as QualityFilterCatalogPayload;
                setCatalog({
                    products: Array.isArray(data.products) ? data.products : [],
                    workCenters: Array.isArray(data.workCenters) ? data.workCenters : [],
                    shifts: Array.isArray(data.shifts) ? data.shifts : []
                });
            } catch (err: unknown) {
                if ((err as Error)?.name === "AbortError") return;
                toast.error("Unable to load quality filter options.");
            } finally {
                setCatalogLoading(false);
            }
        };

        fetchFilters();
        return () => controller.abort();
    }, []);

    // Load report data whenever appliedFilters changes
    const loadReport = useCallback(
        async (signal?: AbortSignal) => {
            setIsLoading(true);
            setError(null);
            setAiCommentary(null);
            setAiError(null);

            try {
                const query = new URLSearchParams({
                    dateFrom: appliedFilters.dateFrom,
                    dateTo: appliedFilters.dateTo,
                    productId: appliedFilters.productId,
                    workCenterId: appliedFilters.workCenterId,
                    shiftName: appliedFilters.shiftName,
                    status: appliedFilters.status
                });

                const res = await fetch(
                    `/api/manufacturing/reports/quality-intelligence-report?${query.toString()}`,
                    { signal }
                );

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${res.status}`);
                }

                const data = (await res.json()) as QualityReportPayload;
                setPayload(data);

                // Notify with Sonner only when request completes successfully
                if (appliedReasonRef.current === "apply") {
                    toast.success("Filters applied.");
                    appliedReasonRef.current = null;
                } else if (appliedReasonRef.current === "reset") {
                    toast.info("Filters reset to default this-month range.");
                    appliedReasonRef.current = null;
                }
            } catch (err: unknown) {
                appliedReasonRef.current = null;
                if ((err as Error)?.name === "AbortError") return;
                const msg = (err as Error)?.message || "Failed to load quality report telemetry.";
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

    // Handle Apply button click: mark reason and update applied filters
    const handleApplyFilters = () => {
        appliedReasonRef.current = "apply";
        setAppliedFilters({ ...draftFilters });
    };

    // Handle Reset button click: mark reason and update applied filters
    const handleResetFilters = () => {
        const resetObj = defaultFilters();
        setDraftFilters(resetObj);
        appliedReasonRef.current = "reset";
        setAppliedFilters(resetObj);
    };

    // Trigger AI Narrative Generation
    const handleGenerateAiAnalysis = async () => {
        if (!payload) return;
        setAiLoading(true);
        setAiError(null);

        try {
            const res = await fetch(
                "/api/manufacturing/reports/quality-intelligence-report/ai-analysis",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reportPayload: payload })
                }
            );

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = (await res.json()) as QualityAICommentaryPayload;
            setAiCommentary(data);
            toast.success("Quality Copilot analysis synthesized.");
        } catch (err: unknown) {
            const msg = (err as Error)?.message || "Failed to generate Quality AI analysis.";
            setAiError(msg);
            toast.error(msg);
        } finally {
            setAiLoading(false);
        }
    };

    const handleExport = async (format: "pdf" | "xlsx") => {
        if (!payload) return;
        setExportingFormat(format);

        try {
            const res = await fetch("/api/manufacturing/reports/quality-intelligence-report/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    format,
                    filters: appliedFilters,
                    aiAnalysis: aiCommentary
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            if (format === "pdf") {
                const html = await res.text();
                const printWindow = window.open("", "_blank");
                if (printWindow) {
                    printWindow.document.write(html);
                    printWindow.document.close();
                } else {
                    toast.error("Popup blocked. Please allow popups to print report.");
                }
                return;
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Quality-Intelligence-Report-${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Excel report downloaded successfully.");
        } catch (err: unknown) {
            const msg =
                (err as Error)?.message ||
                (format === "pdf" ? "Failed to prepare printable report." : "Failed to download Excel workbook.");
            toast.error(msg);
        } finally {
            setExportingFormat(null);
        }
    };

    const handleSelectJobOrder = (jobOrderId: number) => {
        setSelectedJobOrderId(jobOrderId);
        setIsDetailModalOpen(true);
    };

    return (
        <div className="flex flex-col min-h-full bg-background/50">
            {/* Main Content Area */}
            <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-5 w-full">
                {/* Filter Bar Card */}
                <ReportFilterBar
                    draftFilters={draftFilters}
                    appliedFilters={appliedFilters}
                    catalog={catalog}
                    catalogLoading={catalogLoading}
                    isLoading={isLoading}
                    aiLoading={aiLoading}
                    exportingFormat={exportingFormat}
                    onDraftChange={(updates) =>
                        setDraftFilters((prev) => ({ ...prev, ...updates }))
                    }
                    onApplyFilters={handleApplyFilters}
                    onResetFilters={handleResetFilters}
                    onOpenAiInsights={() => setIsAiDrawerOpen(true)}
                    onExport={handleExport}
                />
                {/* Error Banner */}
                {error && (
                    <Alert variant="destructive" className="rounded-2xl shadow-sm">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Telemetry Query Error</AlertTitle>
                        <AlertDescription className="flex items-center justify-between">
                            <span>{error}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => loadReport()}
                                className="h-7 text-xs ml-4"
                            >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Retry
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}

                {/* Loading Skeleton */}
                {isLoading && !payload ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                            ))}
                        </div>
                        <Skeleton className="h-72 w-full rounded-2xl" />
                        <Skeleton className="h-80 w-full rounded-2xl" />
                    </div>
                ) : payload ? (
                    <>
                        {/* KPI Summary Strip */}
                        <KpiSummaryStrip kpis={payload.kpis} isLoading={isLoading} />

                        {/* Navigation Tabs */}
                        <div className="border-b border-border/60 pb-1">
                            <div className="flex space-x-1 sm:space-x-2 overflow-x-auto">
                                {TABS.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                                                isActive
                                                    ? "bg-primary text-primary-foreground shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                            }`}
                                        >
                                            <Icon className="h-3.5 w-3.5 shrink-0" />
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Animated Tab Content */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.2 }}
                            >
                                {activeTab === "overview" && <QualityOverviewTab payload={payload} />}
                                {activeTab === "traceability" && (
                                    <LotTraceabilityTab
                                        rows={payload.lotTrace}
                                        onSelectJobOrder={handleSelectJobOrder}
                                    />
                                )}
                                {activeTab === "root-cause" && (
                                    <RootCauseHypothesesTab
                                        payload={payload}
                                        aiCommentary={aiCommentary}
                                        onOpenAiDrawer={() => setIsAiDrawerOpen(true)}
                                    />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </>
                ) : null}
            </div>

            {/* Batch Trace Detail Drilldown Modal */}
            <BatchTraceDetailModal
                jobOrderId={selectedJobOrderId}
                open={isDetailModalOpen}
                onOpenChange={setIsDetailModalOpen}
            />

            {/* AI Copilot Side Drawer */}
            {payload && (
                <QualityAICopilotDrawer
                    open={isAiDrawerOpen}
                    onClose={() => setIsAiDrawerOpen(false)}
                    payload={payload}
                    aiCommentary={aiCommentary}
                    isLoading={aiLoading}
                    error={aiError}
                    onGenerateAnalysis={handleGenerateAiAnalysis}
                />
            )}
        </div>
    );
}
