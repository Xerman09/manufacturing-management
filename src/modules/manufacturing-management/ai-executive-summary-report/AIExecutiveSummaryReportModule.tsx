"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { ReportFilters } from "./components/ReportFilters";
import { MetricKPICards } from "./components/MetricKPICards";
import { DetailMetricsGrid } from "./components/DetailMetricsGrid";
import { RecordDrilldownModal } from "./components/RecordDrilldownModal";
import { AICopilotSideDrawer } from "./components/AICopilotSideDrawer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type {
    AIExecutiveReportPayload,
    AIExecutiveReportFilters,
    PlantOption,
    DetailedKPIRow,
    AIInsightsPayload
} from "./types";

export default function AIExecutiveSummaryReportModule() {
    // Draft filters manipulated by the UI controls
    const [draftFilters, setDraftFilters] = useState<AIExecutiveReportFilters>({
        plantId: "all",
        period: "thisMonth",
        dateFrom: "",
        dateTo: ""
    });

    // Applied filters that actually drive query execution
    const [appliedFilters, setAppliedFilters] = useState<AIExecutiveReportFilters>({
        plantId: "all",
        period: "thisMonth",
        dateFrom: "",
        dateTo: ""
    });

    const [branches, setBranches] = useState<PlantOption[]>([]);
    const [payload, setPayload] = useState<AIExecutiveReportPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // AI Copilot state
    const [showAICopilot, setShowAICopilot] = useState(false);
    const [aiInsights, setAiInsights] = useState<AIInsightsPayload | null>(null);
    const [copilotLoading, setCopilotLoading] = useState(false);
    const [copilotError, setCopilotError] = useState<string | null>(null);

    // Drilldown modal
    const [selectedDrilldownRow, setSelectedDrilldownRow] = useState<DetailedKPIRow | null>(null);
    const [drilldownOpen, setDrilldownOpen] = useState(false);

    // Fetch branches on mount
    useEffect(() => {
        const fetchFilters = async () => {
            try {
                const res = await fetch("/api/manufacturing/reports/ai-executive-summary-report/filters");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.branches)) {
                        setBranches(data.branches);
                    }
                }
            } catch (err) {
                console.error("Failed to load branches", err);
            }
        };
        fetchFilters();
    }, []);

    // Fetch deterministic report data based on appliedFilters
    const loadReport = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setAiInsights(null); // Reset AI insights when operational filter parameters change
        try {
            const query = new URLSearchParams({
                plantId: appliedFilters.plantId,
                period: appliedFilters.period,
                dateFrom: appliedFilters.dateFrom,
                dateTo: appliedFilters.dateTo
            });
            const res = await fetch(`/api/manufacturing/reports/ai-executive-summary-report?${query.toString()}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to load executive summary data.");
            }
            const data: AIExecutiveReportPayload = await res.json();
            setPayload(data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error loading report.";
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [appliedFilters]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    // Handle user clicking "Apply Filters"
    const handleApplyFilters = () => {
        setAppliedFilters({ ...draftFilters });
    };

    // Handle user clicking "Reset"
    const handleResetDefaults = () => {
        const defaults: AIExecutiveReportFilters = {
            plantId: "all",
            period: "thisMonth",
            dateFrom: "",
            dateTo: ""
        };
        setDraftFilters(defaults);
        setAppliedFilters(defaults);
    };

    // Fetch AI Copilot Insights
    const fetchAICopilot = async () => {
        if (!payload) return;
        if (!payload.meta.aiTier.assigned || payload.meta.aiTier.tierLevel === 0) return;

        setCopilotLoading(true);
        setCopilotError(null);
        try {
            const res = await fetch("/api/manufacturing/reports/ai-executive-summary-report/copilot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportPayload: payload })
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || "AI Copilot analysis failed.");
            }
            const data: AIInsightsPayload = await res.json();
            setAiInsights(data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to load AI Copilot insights.";
            setCopilotError(msg);
        } finally {
            setCopilotLoading(false);
        }
    };

    // Handle toggle AI Copilot on-demand
    const handleToggleAICopilot = async () => {
        if (showAICopilot) {
            setShowAICopilot(false);
            return;
        }

        setShowAICopilot(true);
        if (!aiInsights) {
            await fetchAICopilot();
        }
    };

    const handleDraftChange = (updates: Partial<AIExecutiveReportFilters>) => {
        setDraftFilters((prev) => ({ ...prev, ...updates }));
    };

    const handleOpenDrilldown = (row: DetailedKPIRow) => {
        setSelectedDrilldownRow(row);
        setDrilldownOpen(true);
    };

    const handleExportPdf = async () => {
        if (!payload) return;
        try {
            const res = await fetch("/api/manufacturing/reports/ai-executive-summary-report/export/pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reportPayload: payload,
                    insights: aiInsights
                })
            });
            if (!res.ok) throw new Error("PDF generation failed");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `AI-Executive-Summary-${payload.meta.plantName.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export error", err);
            alert("Could not generate PDF. Please try again.");
        }
    };

    return (
        <div className="flex-1 space-y-4 p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                        AI Executive Summary Report
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        High-level synthesis of plant productivity, weighted OEE, scrap rates, downtime, delivery adherence, and production variance.
                    </p>
                </div>
            </div>

            {/* Filter Bar with SearchableSelect Date Presets & Explicit Apply Button */}
            {payload && (
                <ReportFilters
                    draftFilters={draftFilters}
                    appliedFilters={appliedFilters}
                    branches={branches}
                    aiTier={payload.meta.aiTier}
                    showAICopilot={showAICopilot}
                    copilotLoading={copilotLoading}
                    isLoading={isLoading}
                    onDraftChange={handleDraftChange}
                    onApplyFilters={handleApplyFilters}
                    onResetDefaults={handleResetDefaults}
                    onToggleAICopilot={handleToggleAICopilot}
                    onExportPdf={handleExportPdf}
                />
            )}

            {/* Error Banner */}
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Report Generation Error</AlertTitle>
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
            )}

            {/* On-Demand AI Copilot Slide-Over Drawer */}
            <AnimatePresence>
                {showAICopilot && payload && (
                    <AICopilotSideDrawer
                        isOpen={showAICopilot}
                        insights={aiInsights}
                        reportPayload={payload}
                        aiTier={payload.meta.aiTier}
                        isLoading={copilotLoading}
                        error={copilotError}
                        onClose={() => setShowAICopilot(false)}
                        onRegenerate={fetchAICopilot}
                        onDownloadPdf={handleExportPdf}
                    />
                )}
            </AnimatePresence>

            {/* Main Content when loaded */}
            {payload && (
                <>
                    {/* Sleek Color-Themed Metric Cards */}
                    <MetricKPICards
                        kpis={payload.kpiCards}
                        onSelectKpi={(key) => {
                            const match = payload.detailedRows.find((r) => r.key.includes(key) || key.includes(r.key));
                            if (match) handleOpenDrilldown(match);
                        }}
                    />

                    {/* Detailed Verified KPI Grid with Directional Variance */}
                    <DetailMetricsGrid
                        rows={payload.detailedRows}
                        onOpenDrilldown={handleOpenDrilldown}
                    />
                </>
            )}

            {/* Module-Local Dedicated Record Drilldown Modal (Expanded & Responsive) */}
            <RecordDrilldownModal
                row={selectedDrilldownRow}
                open={drilldownOpen}
                onClose={() => setDrilldownOpen(false)}
            />
        </div>
    );
}
