"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
    AlertCircle,
    Boxes,
    Gauge,
    RefreshCw,
    Table2,
    TrendingUp
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "./components/ReportFilterBar";
import { KpiSummaryStrip } from "./components/KpiSummaryStrip";
import { ForecastTrendTab } from "./components/ForecastTrendTab";
import { ProductRegionTab } from "./components/ProductRegionTab";
import { AccuracyBiasTab } from "./components/AccuracyBiasTab";
import { PlanningScenariosTab } from "./components/PlanningScenariosTab";
import { AICommentaryDrawer } from "./components/AICommentaryDrawer";
import {
    EvidenceDrilldownModal,
    type EvidenceModalContext
} from "./components/EvidenceDrilldownModal";
import {
    DEFAULT_SCENARIO_ASSUMPTIONS,
    getManilaDateString
} from "./utils/scenarioMath";
import type {
    DemandAICommentaryPayload,
    DemandForecastFilters,
    DemandForecastReportPayload,
    FilterCatalogPayload,
    ForecastCadence,
    ScenarioAssumptions,
    TabKey
} from "./types";

const INITIAL_FILTERS: DemandForecastFilters = {
    cadence: "monthly",
    period: "last6Months",
    dateFrom: "",
    dateTo: "",
    branchId: "all",
    productId: "all",
    regionKey: "all",
    forecastHorizon: "6m",
    includeUnmappedRegions: true
};

const TABS: Array<{
    key: TabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { key: "forecast", label: "Forecast & Trend", icon: TrendingUp },
    { key: "matrix", label: "Product & Region", icon: Table2 },
    { key: "accuracy", label: "Accuracy & Bias", icon: Gauge },
    { key: "planning", label: "Planning & Scenarios", icon: Boxes }
];

export default function DemandForecastingAIReportModule() {
    const [draftFilters, setDraftFilters] = useState<DemandForecastFilters>(INITIAL_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState<DemandForecastFilters>(INITIAL_FILTERS);
    const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(
        DEFAULT_SCENARIO_ASSUMPTIONS
    );

    const [catalog, setCatalog] = useState<FilterCatalogPayload>({
        branches: [],
        products: [],
        regions: []
    });
    const [catalogLoading, setCatalogLoading] = useState(true);

    const [payload, setPayload] = useState<DemandForecastReportPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<TabKey>("forecast");

    // AI Commentary state
    const [aiCommentary, setAiCommentary] = useState<DemandAICommentaryPayload | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [reviewedCommentaryIds, setReviewedCommentaryIds] = useState<Record<string, boolean>>({});
    const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

    // Export state
    const [exportingFormat, setExportingFormat] = useState<"pdf" | "xlsx" | null>(null);

    // Evidence drilldown modal state
    const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
    const [evidenceContext, setEvidenceContext] = useState<EvidenceModalContext | null>(null);

    // Load filter catalogs on mount
    useEffect(() => {
        const controller = new AbortController();
        const fetchCatalog = async () => {
            setCatalogLoading(true);
            try {
                const res = await fetch(
                    "/api/manufacturing/reports/demand-forecasting-ai-report/filters",
                    { signal: controller.signal }
                );
                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    throw new Error(
                        errJson.error || `Failed to load filter options (HTTP ${res.status}).`
                    );
                }
                const data = (await res.json()) as FilterCatalogPayload;
                setCatalog({
                    branches: Array.isArray(data.branches) ? data.branches : [],
                    products: Array.isArray(data.products) ? data.products : [],
                    regions: Array.isArray(data.regions) ? data.regions : []
                });
            } catch (err: unknown) {
                if ((err as Error)?.name === "AbortError") return;
                const msg =
                    err instanceof Error ? err.message : "Unable to load filter dropdown options.";
                toast.error(msg);
            } finally {
                setCatalogLoading(false);
            }
        };
        fetchCatalog();
        return () => controller.abort();
    }, []);

    // Load report data whenever appliedFilters change
    const loadReport = useCallback(
        async (signal?: AbortSignal) => {
            setIsLoading(true);
            setError(null);
            setAiCommentary(null);
            setAiError(null);
            setReviewedCommentaryIds({});

            try {
                const query = new URLSearchParams({
                    cadence: appliedFilters.cadence,
                    period: appliedFilters.period,
                    dateFrom: appliedFilters.dateFrom,
                    dateTo: appliedFilters.dateTo,
                    branchId: appliedFilters.branchId,
                    productId: appliedFilters.productId,
                    regionKey: appliedFilters.regionKey,
                    forecastHorizon: appliedFilters.forecastHorizon,
                    includeUnmappedRegions: String(appliedFilters.includeUnmappedRegions)
                });

                const res = await fetch(
                    `/api/manufacturing/reports/demand-forecasting-ai-report?${query.toString()}`,
                    { signal }
                );
                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    throw new Error(
                        errJson.error || `Failed to load demand forecast (HTTP ${res.status}).`
                    );
                }

                const data = (await res.json()) as DemandForecastReportPayload;
                setPayload(data);

                // Surface user-relevant notices (strictly no silent fallback)
                for (const notice of data.meta.notices || []) {
                    if (notice.severity === "error") {
                        toast.error(notice.message);
                    } else {
                        toast.warning(notice.message);
                    }
                }
            } catch (err: unknown) {
                if ((err as Error)?.name === "AbortError") return;
                const msg = err instanceof Error ? err.message : "Failed to compute demand forecast.";
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

    const handleDraftChange = useCallback((updates: Partial<DemandForecastFilters>) => {
        setDraftFilters((prev) => ({ ...prev, ...updates }));
    }, []);

    // Pure cadence switch (no side effects inside state updater; consistent with explicit Apply or instant pure update)
    const handleCadenceSwitch = useCallback(
        (cadence: ForecastCadence) => {
            const nextPeriod =
                cadence === "weekly"
                    ? draftFilters.period === "last6Months" || draftFilters.period === "last12Months"
                        ? "last12Weeks"
                        : draftFilters.period
                    : draftFilters.period === "last8Weeks" || draftFilters.period === "last12Weeks"
                    ? "last6Months"
                    : draftFilters.period;

            const nextHorizon = cadence === "weekly" ? "8w" : "6m";

            const updated: DemandForecastFilters = {
                ...draftFilters,
                cadence,
                period: nextPeriod,
                forecastHorizon: nextHorizon
            };
            setDraftFilters(updated);
            setAppliedFilters(updated);
        },
        [draftFilters]
    );

    const handleApplyFilters = useCallback(() => {
        if (
            draftFilters.period === "custom" &&
            (!draftFilters.dateFrom || !draftFilters.dateTo)
        ) {
            toast.error("Please select both Start Date and End Date for a custom historical window.");
            return;
        }
        if (draftFilters.period === "custom" && draftFilters.dateFrom > draftFilters.dateTo) {
            toast.error("Start Date must be on or before End Date.");
            return;
        }
        setAppliedFilters({ ...draftFilters });
    }, [draftFilters]);

    const handleResetFilters = useCallback(() => {
        setDraftFilters(INITIAL_FILTERS);
        setAppliedFilters(INITIAL_FILTERS);
        toast.success("Filters reset to default planning scope.");
    }, []);

    // Invalidate stale AI commentary whenever scenario assumptions change so prose never contradicts recalculated planning numbers
    const handleChangeAssumptions = useCallback((updates: Partial<ScenarioAssumptions>) => {
        setAssumptions((prev) => ({ ...prev, ...updates }));
        setAiCommentary(null);
        setAiError(null);
        setReviewedCommentaryIds({});
    }, []);

    const handleResetAssumptions = useCallback(() => {
        setAssumptions(DEFAULT_SCENARIO_ASSUMPTIONS);
        setAiCommentary(null);
        setAiError(null);
        setReviewedCommentaryIds({});
        toast.success("Scenario assumptions reset to baseline.");
    }, []);

    const handleGenerateAI = useCallback(async () => {
        if (!payload) {
            toast.error("Load a demand forecast dataset before generating AI commentary.");
            return;
        }
        setAiLoading(true);
        setAiError(null);
        try {
            const res = await fetch(
                "/api/manufacturing/reports/demand-forecasting-ai-report/copilot",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        reportPayload: payload,
                        scenarioAssumptions: assumptions
                    })
                }
            );
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || `AI commentary failed (HTTP ${res.status}).`);
            }
            const data = (await res.json()) as DemandAICommentaryPayload;
            setAiCommentary(data);
            setReviewedCommentaryIds({});
            if (data.meta.governance.isFallback) {
                toast.info("Commentary generated using deterministic advisory mode.");
            } else {
                toast.success("Reviewable AI demand commentary is ready.");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to generate AI commentary.";
            setAiError(msg);
            toast.error(msg);
        } finally {
            setAiLoading(false);
        }
    }, [payload, assumptions]);

    const handleOpenAICommentary = useCallback(() => {
        setIsAiDrawerOpen(true);
        if (!aiCommentary && !aiLoading) {
            void handleGenerateAI();
        }
    }, [aiCommentary, aiLoading, handleGenerateAI]);

    const handleExport = useCallback(
        async (format: "pdf" | "xlsx") => {
            if (!payload) {
                toast.error("No report data available to export.");
                return;
            }
            setExportingFormat(format);
            try {
                // Send filters + scenario assumptions so server recomputes authoritative numbers
                const res = await fetch(
                    "/api/manufacturing/reports/demand-forecasting-ai-report/export",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            format,
                            filters: appliedFilters,
                            scenarioAssumptions: assumptions,
                            aiCommentary
                        })
                    }
                );
                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    throw new Error(errJson.error || `Export failed (HTTP ${res.status}).`);
                }
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                const safeBranch = payload.meta.branchLabel.replace(/[^a-zA-Z0-9_-]+/g, "_");
                anchor.href = url;
                anchor.download = `Demand-Forecast-${safeBranch}-${getManilaDateString()}.${format}`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                window.URL.revokeObjectURL(url);
                toast.success(`Exported ${format.toUpperCase()} demand forecasting report.`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Export failed.";
                toast.error(msg);
            } finally {
                setExportingFormat(null);
            }
        },
        [payload, appliedFilters, assumptions, aiCommentary]
    );

    const handleOpenEvidence = useCallback(
        (
            title: string,
            subtitle: string,
            evidenceIds: string[],
            totalEvidenceCount?: number,
            formulaNote?: string
        ) => {
            setEvidenceContext({
                title,
                subtitle,
                evidenceIds,
                totalEvidenceCount,
                formulaNote
            });
            setEvidenceModalOpen(true);
        },
        []
    );

    const handleInspectMetric = useCallback(
        (metricKey: "forecast" | "interval" | "wape" | "bias" | "trend") => {
            if (!payload) return;
            // Collect real metric-relevant evidence sorted by top volume / error impact
            const topRows =
                metricKey === "wape" || metricKey === "bias"
                    ? [...payload.matrixRows].sort((a, b) => b.absErrorUnits - a.absErrorUnits)
                    : payload.matrixRows;
            const relevantEvidenceIds = Array.from(
                new Set(topRows.flatMap((r) => r.evidenceIds))
            ).slice(0, 60);

            const k = payload.kpis;

            if (metricKey === "wape") {
                handleOpenEvidence(
                    "Forecast Error (WAPE) Audit",
                    `Evaluated across ${k.evaluatedBacktestPeriods} out-of-sample period(s) · ${k.evaluatedActualUnits.toLocaleString()} evaluated actual units`,
                    relevantEvidenceIds,
                    k.totalEvidenceCount,
                    `WAPE = ${k.sumAbsoluteErrorUnits.toLocaleString()} (abs error) ÷ ${k.evaluatedActualUnits.toLocaleString()} (evaluated actual) × 100 = ${k.wapePct !== null ? `${k.wapePct}%` : "-"}`
                );
                return;
            }
            if (metricKey === "bias") {
                handleOpenEvidence(
                    "Forecast Bias Audit",
                    `Out-of-sample Backtest (${k.backtestForecastUnits.toLocaleString()}) vs Evaluated Actual (${k.evaluatedActualUnits.toLocaleString()})`,
                    relevantEvidenceIds,
                    k.totalEvidenceCount,
                    `Forecast Bias = (${k.backtestForecastUnits.toLocaleString()} − ${k.evaluatedActualUnits.toLocaleString()}) ÷ ${k.evaluatedActualUnits.toLocaleString()} × 100 = ${k.biasPct !== null ? `${k.biasPct > 0 ? "+" : ""}${k.biasPct}%` : "-"}`
                );
                return;
            }
            if (metricKey === "interval") {
                handleOpenEvidence(
                    `Expected Range (${assumptions.confidenceLevel}% Confidence)`,
                    `Calibrated from out-of-sample walk-forward forecast errors across ${payload.meta.forecastHorizonLabel}`,
                    relevantEvidenceIds,
                    k.totalEvidenceCount
                );
                return;
            }
            if (metricKey === "trend") {
                handleOpenEvidence(
                    "Demand Trend Evidence",
                    `Direction: ${k.trendDirection} (${k.trendPct !== null ? `${k.trendPct > 0 ? "+" : ""}${k.trendPct}%` : "-"} average change per period)`,
                    relevantEvidenceIds,
                    k.totalEvidenceCount
                );
                return;
            }
            handleOpenEvidence(
                "Expected Demand Supporting Orders",
                `${payload.meta.branchLabel} · ${payload.meta.forecastHorizonLabel} · ${payload.matrixRows.length} product-region series (reconciled bottom-up)`,
                relevantEvidenceIds,
                k.totalEvidenceCount
            );
        },
        [payload, assumptions.confidenceLevel, handleOpenEvidence]
    );

    const handleToggleReviewed = useCallback((id: string) => {
        setReviewedCommentaryIds((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    return (
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
            {/* Page Title & Context Strip */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-border/60 pb-3.5">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                            Demand Forecasting AI Report
                        </h1>
                        {payload && (
                            <Badge variant="outline" className="text-[10px] font-semibold">
                                {payload.meta.cadence === "weekly" ? "Weekly Cycle" : "Monthly Cycle"} ·{" "}
                                {payload.meta.forecastHorizonLabel}
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Forecast customer demand from Sales Orders, track forecast accuracy, and turn demand scenarios into Inventory, Labor, and Production plans.
                    </p>
                </div>
                {payload && (
                    <div className="text-[11px] text-muted-foreground text-left sm:text-right">
                        <div className="font-semibold text-foreground/80">
                            {payload.meta.branchLabel} · {payload.meta.regionLabel}
                        </div>
                        <div>Updated: {payload.meta.freshnessCutoff}</div>
                    </div>
                )}
            </div>

            {/* Filter Command Bar */}
            <ReportFilterBar
                draftFilters={draftFilters}
                appliedFilters={appliedFilters}
                catalog={catalog}
                catalogLoading={catalogLoading}
                isLoading={isLoading}
                exportingFormat={exportingFormat}
                aiLoading={aiLoading}
                onDraftChange={handleDraftChange}
                onCadenceSwitch={handleCadenceSwitch}
                onApplyFilters={handleApplyFilters}
                onResetFilters={handleResetFilters}
                onOpenAICommentary={handleOpenAICommentary}
                onExport={handleExport}
            />

            {/* Explicit Error Banner (strictly no silent fallback) */}
            {error && (
                <Alert variant="destructive" className="rounded-2xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-bold">Unable to Load Forecast</AlertTitle>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />
                    ))}
                </div>
            ) : (
                <KpiSummaryStrip
                    kpis={payload?.kpis || null}
                    assumptions={assumptions}
                    hasError={Boolean(error)}
                    onInspectMetric={handleInspectMetric}
                />
            )}

            {/* Smooth Spring-Animated Tab Navigation */}
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
                                        layoutId="demand-active-tab"
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

            {/* Tab Workspace Content with Smooth AnimatePresence */}
            {isLoading && !payload ? (
                <Skeleton className="h-[420px] w-full rounded-2xl" />
            ) : payload ? (
                <div
                    className={
                        isLoading ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"
                    }
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                        >
                            {activeTab === "forecast" && (
                                <ForecastTrendTab
                                    payload={payload}
                                    assumptions={assumptions}
                                    onOpenProductRegionEvidence={(title, subtitle, ids, total) =>
                                        handleOpenEvidence(title, subtitle, ids, total)
                                    }
                                />
                            )}

                            {activeTab === "matrix" && (
                                <ProductRegionTab
                                    payload={payload}
                                    assumptions={assumptions}
                                    onOpenEvidence={(title, subtitle, ids, total) =>
                                        handleOpenEvidence(title, subtitle, ids, total)
                                    }
                                />
                            )}

                            {activeTab === "accuracy" && (
                                <AccuracyBiasTab
                                    payload={payload}
                                    onOpenEvidence={(title, subtitle, ids, total) =>
                                        handleOpenEvidence(
                                            title,
                                            subtitle,
                                            ids,
                                            total,
                                            "WAPE = sum of absolute forecast errors ÷ sum of evaluated actual demand × 100"
                                        )
                                    }
                                />
                            )}

                            {activeTab === "planning" && (
                                <PlanningScenariosTab
                                    payload={payload}
                                    assumptions={assumptions}
                                    onChangeAssumptions={handleChangeAssumptions}
                                    onResetAssumptions={handleResetAssumptions}
                                    onOpenEvidence={(title, subtitle, ids, total) =>
                                        handleOpenEvidence(title, subtitle, ids, total)
                                    }
                                />
                            )}

                        </motion.div>
                    </AnimatePresence>
                </div>
            ) : null}

            {/* AI Demand Planning Commentary Slide-Over Drawer */}
            <AICommentaryDrawer
                isOpen={isAiDrawerOpen}
                onClose={() => setIsAiDrawerOpen(false)}
                payload={payload}
                assumptions={assumptions}
                commentary={aiCommentary}
                isLoading={aiLoading}
                error={aiError}
                reviewedIds={reviewedCommentaryIds}
                onToggleReviewed={handleToggleReviewed}
                onGenerateCommentary={handleGenerateAI}
                onOpenEvidence={(title, subtitle, ids, total) =>
                    handleOpenEvidence(title, subtitle, ids, total)
                }
            />

            {/* Evidence Drilldown Modal */}
            <EvidenceDrilldownModal
                open={evidenceModalOpen}
                context={evidenceContext}
                evidenceRegistry={payload?.evidenceRegistry || {}}
                onClose={() => setEvidenceModalOpen(false)}
            />
        </div>
    );
}
