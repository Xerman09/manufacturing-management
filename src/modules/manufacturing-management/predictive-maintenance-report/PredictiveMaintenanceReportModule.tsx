"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, Layers } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportFilterBar } from "./components/ReportFilterBar";
import { StatusWorkflowBar } from "./components/StatusWorkflowBar";
import { KpiSummaryStrip } from "./components/KpiSummaryStrip";
import { AssetRiskRankedTab } from "./components/AssetRiskRankedTab";
import { ConditionSignalsTab } from "./components/ConditionSignalsTab";
import { AiFindingsDrawer } from "./components/AiFindingsDrawer";
import { EvidenceDrilldownModal } from "./components/EvidenceDrilldownModal";
import { SnapshotSelectorCombobox, type SnapshotMetaItem } from "./components/SnapshotSelectorCombobox";
import { SnapshotPreviewModal } from "./components/SnapshotPreviewModal";
import { RejectSnapshotModal } from "./components/RejectSnapshotModal";
import { ReportPulseSkeletonLoader } from "./components/ReportPulseSkeletonLoader";
import { exportToCsv } from "./utils/exportUtils";
import { getDefaultDateRange } from "./utils/dateUtils";
import type {
    AssetRiskRow,
    FilterCatalogPayload,
    PredictiveAiCommentaryPayload,
    PredictiveMaintenanceFilters,
    PredictiveMaintenanceReportPayload,
    PredictiveReportTabKey
} from "./types";

function initialFilters(): PredictiveMaintenanceFilters {
    const { start, end } = getDefaultDateRange();
    return {
        dateFrom: start,
        dateTo: end,
        horizon: "30d",
        assetId: "all",
        workCenterId: "all",
        branchId: "all",
        status: "all"
    };
}

export default function PredictiveMaintenanceReportModule() {
    const [draftFilters, setDraftFilters] = useState<PredictiveMaintenanceFilters>(initialFilters());
    const [appliedFilters, setAppliedFilters] = useState<PredictiveMaintenanceFilters>(initialFilters());

    const [catalog, setCatalog] = useState<FilterCatalogPayload>({
        assets: [],
        workCenters: [],
        branches: [],
        horizons: [
            { id: "7d", label: "7 Days (Immediate)", days: 7 },
            { id: "14d", label: "14 Days (Bi-weekly)", days: 14 },
            { id: "30d", label: "30 Days (Monthly)", days: 30 },
            { id: "60d", label: "60 Days (Bi-monthly)", days: 60 },
            { id: "90d", label: "90 Days (Quarterly)", days: 90 }
        ]
    });

    const [payload, setPayload] = useState<PredictiveMaintenanceReportPayload | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Snapshot Management State
    const [snapshots, setSnapshots] = useState<SnapshotMetaItem[]>([]);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
    const [previewSnapshot, setPreviewSnapshot] = useState<SnapshotMetaItem | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);

    // AI Drawer & Commentary
    const [commentary, setCommentary] = useState<PredictiveAiCommentaryPayload | null>(null);
    const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // Selected asset for Evidence Modal
    const [selectedAsset, setSelectedAsset] = useState<AssetRiskRow | null>(null);
    const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

    // Active tab
    const [activeTab, setActiveTab] = useState<PredictiveReportTabKey>("ranked-risk");

    // Load filter catalogs
    useEffect(() => {
        let isMounted = true;
        fetch("/api/manufacturing/reports/predictive-maintenance-report/filters")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (isMounted && data) {
                    setCatalog(data);
                }
            })
            .catch(() => {});
        return () => {
            isMounted = false;
        };
    }, []);

    // Load saved snapshots list
    const refreshSnapshots = useCallback(() => {
        fetch("/api/manufacturing/reports/predictive-maintenance-report/snapshots")
            .then((r) => (r.ok ? r.json() : null))
            .then((res) => {
                if (res?.data && Array.isArray(res.data)) {
                    setSnapshots(res.data);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        refreshSnapshots();
    }, [refreshSnapshots]);

    // Fetch Live Report
    const fetchReport = useCallback(async (filters: PredictiveMaintenanceFilters) => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
                horizon: filters.horizon,
                assetId: filters.assetId,
                workCenterId: filters.workCenterId,
                branchId: filters.branchId,
                status: filters.status
            });

            const res = await fetch(`/api/manufacturing/reports/predictive-maintenance-report?${params.toString()}`);
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || `HTTP ${res.status}`);
            }

            const data: PredictiveMaintenanceReportPayload = await res.json();
            setPayload(data);

            // Fetch AI analysis
            setIsAiLoading(true);
            fetch("/api/manufacturing/reports/predictive-maintenance-report/ai-analysis", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportPayload: data })
            })
                .then((r) => (r.ok ? r.json() : null))
                .then((aiData) => {
                    if (aiData) setCommentary(aiData);
                })
                .catch(() => {})
                .finally(() => setIsAiLoading(false));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to load report data";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load Snapshot from DB
    const loadSnapshot = useCallback(async (snapshotId: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/manufacturing/reports/predictive-maintenance-report/snapshots/${snapshotId}`);
            if (!res.ok) throw new Error("Failed to load snapshot from database");
            const json = await res.json();
            const snap = json.data;

            if (snap?.report_payload) {
                const restoredPayload: PredictiveMaintenanceReportPayload = snap.report_payload;
                // Sync status & review notes from DB record
                restoredPayload.meta.status = snap.status;
                restoredPayload.meta.version = snap.version;
                restoredPayload.meta.reportId = snap.report_code;
                restoredPayload.meta.notes = snap.reviewer_notes || "";

                setPayload(restoredPayload);
                setSelectedSnapshotId(snapshotId);

                // Sync filter controls to snapshot parameters
                const synchedFilters: PredictiveMaintenanceFilters = {
                    dateFrom: snap.cutoff_date_from,
                    dateTo: snap.cutoff_date_to,
                    horizon: snap.prediction_horizon || "30d",
                    assetId: snap.filter_asset_id ? String(snap.filter_asset_id) : "all",
                    workCenterId: snap.filter_work_center_id ? String(snap.filter_work_center_id) : "all",
                    branchId: "all",
                    status: snap.status
                };
                setDraftFilters(synchedFilters);
                setAppliedFilters(synchedFilters);

                toast.success(`Loaded snapshot: ${snap.report_code} (v${snap.version})`);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error loading snapshot";
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedSnapshotId === null) {
            fetchReport(appliedFilters);
        }
    }, [appliedFilters, selectedSnapshotId, fetchReport]);

    const handleFilterChange = (key: keyof PredictiveMaintenanceFilters, value: string) => {
        setDraftFilters((prev) => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        setSelectedSnapshotId(null);
        setAppliedFilters(draftFilters);
    };

    const handleReset = () => {
        const init = initialFilters();
        setSelectedSnapshotId(null);
        setDraftFilters(init);
        setAppliedFilters(init);
    };

    // Save active report as snapshot or update existing
    const handleSaveSnapshot = async (targetStatus: "Draft" | "In Review" | "Published" = "Draft") => {
        if (!payload) return;
        setIsSavingSnapshot(true);
        try {
            // If already loaded as a snapshot, update status via PATCH
            if (selectedSnapshotId) {
                const patchRes = await fetch(`/api/manufacturing/reports/predictive-maintenance-report/snapshots/${selectedSnapshotId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: targetStatus })
                });
                if (!patchRes.ok) throw new Error("Failed to update snapshot status");
                toast.success(`Snapshot status transitioned to ${targetStatus}`);
                refreshSnapshots();
                loadSnapshot(selectedSnapshotId);
                return;
            }

            // Otherwise, create a new snapshot record via POST
            const res = await fetch("/api/manufacturing/reports/predictive-maintenance-report/snapshots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reportCode: payload.meta.reportId,
                    version: payload.meta.version,
                    status: targetStatus,
                    cutoffDateFrom: draftFilters.dateFrom,
                    cutoffDateTo: draftFilters.dateTo,
                    predictionHorizon: draftFilters.horizon,
                    filterAssetId: draftFilters.assetId !== "all" ? Number(draftFilters.assetId) : null,
                    filterWorkCenterId: draftFilters.workCenterId !== "all" ? Number(draftFilters.workCenterId) : null,
                    reportPayload: payload
                })
            });

            if (!res.ok) throw new Error("Failed to save snapshot");
            const resJson = await res.json();
            toast.success(`Snapshot saved successfully as ${targetStatus}`);
            refreshSnapshots();
            if (resJson?.data?.id) {
                setSelectedSnapshotId(resJson.data.id);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save snapshot";
            toast.error(msg);
        } finally {
            setIsSavingSnapshot(false);
        }
    };

    // Handle Reject
    const handleConfirmReject = async (reason: string) => {
        if (!selectedSnapshotId) {
            toast.error("Please save the report as a snapshot before rejecting.");
            return;
        }

        try {
            const res = await fetch(`/api/manufacturing/reports/predictive-maintenance-report/snapshots/${selectedSnapshotId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "Draft",
                    reviewerNotes: reason
                })
            });

            if (!res.ok) throw new Error("Failed to reject snapshot");
            toast.success("Snapshot returned to Draft with rejection notes.");
            setIsRejectOpen(false);
            refreshSnapshots();
            loadSnapshot(selectedSnapshotId);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error rejecting snapshot";
            toast.error(msg);
        }
    };

    // Handle Publish
    const handlePublish = async () => {
        if (!selectedSnapshotId) {
            await handleSaveSnapshot("Published");
            return;
        }

        try {
            const res = await fetch(`/api/manufacturing/reports/predictive-maintenance-report/snapshots/${selectedSnapshotId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "Published" })
            });

            if (!res.ok) throw new Error("Failed to publish snapshot");
            toast.success("Report published and retained successfully!");
            refreshSnapshots();
            loadSnapshot(selectedSnapshotId);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error publishing snapshot";
            toast.error(msg);
        }
    };

    const hasPendingChanges = JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters);

    return (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-5 space-y-5">
            {/* Title & Snapshot Navigation Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Predictive Maintenance AI Report</h1>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                        Identify rising breakdown risks, evaluate condition signals and run-hours, and review actionable AI maintenance priorities.
                    </p>
                </div>

                {/* Searchable Snapshot Combobox & Preview */}
                <SnapshotSelectorCombobox
                    snapshots={snapshots}
                    selectedId={selectedSnapshotId}
                    onSelectSnapshot={(id) => {
                        if (id === null) {
                            setSelectedSnapshotId(null);
                            fetchReport(appliedFilters);
                        } else {
                            loadSnapshot(id);
                        }
                    }}
                    onPreviewSnapshot={(snap) => {
                        setPreviewSnapshot(snap);
                        setIsPreviewOpen(true);
                    }}
                    isLoading={isLoading}
                />
            </div>

            {/* Workflow Progression Bar */}
            {payload && (
                <StatusWorkflowBar
                    status={payload.meta.status}
                    version={payload.meta.version}
                    reportId={payload.meta.reportId}
                    isSnapshotMode={selectedSnapshotId !== null}
                    onSaveSnapshot={() => handleSaveSnapshot("Draft")}
                    onSubmitForReview={() => handleSaveSnapshot("In Review")}
                    onOpenRejectModal={() => setIsRejectOpen(true)}
                    onPublish={handlePublish}
                    canPublish={true}
                    isSaving={isSavingSnapshot}
                />
            )}

            {/* Filter Bar */}
            <ReportFilterBar
                draftFilters={draftFilters}
                catalog={catalog}
                onFilterChange={handleFilterChange}
                onApply={handleApply}
                onReset={handleReset}
                onOpenAiDrawer={() => setIsAiDrawerOpen(true)}
                onExportCsv={() => payload && exportToCsv(payload)}
                isLoading={isLoading}
                hasPendingChanges={hasPendingChanges}
            />

            {/* Error Alert */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Report Generation Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Pulse Skeleton Loader */}
            {isLoading ? (
                <ReportPulseSkeletonLoader />
            ) : payload ? (
                <>
                    {/* Executive KPI Strip */}
                    <KpiSummaryStrip kpis={payload.kpis} />

                    {/* Navigation Tabs */}
                    <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as PredictiveReportTabKey)}>
                        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
                            <TabsTrigger value="ranked-risk" className="flex items-center gap-1.5 text-xs">
                                <Activity className="h-3.5 w-3.5" />
                                Asset Risk Ranking
                            </TabsTrigger>
                            <TabsTrigger value="degradation" className="flex items-center gap-1.5 text-xs">
                                <Layers className="h-3.5 w-3.5" />
                                Degradation & Categories
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="ranked-risk" className="mt-4">
                            <AssetRiskRankedTab
                                rows={payload.assetRiskRows}
                                onSelectRow={(row) => {
                                    setSelectedAsset(row);
                                    setIsEvidenceOpen(true);
                                }}
                            />
                        </TabsContent>

                        <TabsContent value="degradation" className="mt-4">
                            <ConditionSignalsTab
                                trends={payload.degradationTrends}
                                categories={payload.categoryDistribution}
                            />
                        </TabsContent>
                    </Tabs>
                </>
            ) : null}

            {/* Evidence Modal */}
            <EvidenceDrilldownModal
                asset={selectedAsset}
                episodes={payload?.breakdownEpisodes || []}
                isOpen={isEvidenceOpen}
                onClose={() => setIsEvidenceOpen(false)}
            />

            {/* Snapshot Preview Modal */}
            <SnapshotPreviewModal
                snapshot={previewSnapshot}
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                onLoadSnapshot={(id) => loadSnapshot(id)}
            />

            {/* Reject Snapshot Modal */}
            <RejectSnapshotModal
                isOpen={isRejectOpen}
                reportCode={payload?.meta.reportId || "PMR"}
                version={payload?.meta.version || 1}
                onClose={() => setIsRejectOpen(false)}
                onConfirmReject={handleConfirmReject}
            />

            {/* AI Findings & Chat Drawer */}
            {payload && (
                <AiFindingsDrawer
                    isOpen={isAiDrawerOpen}
                    onClose={() => setIsAiDrawerOpen(false)}
                    commentary={commentary}
                    reportPayload={payload}
                    isLoading={isAiLoading}
                />
            )}
        </div>
    );
}
