"use client";

import { create } from "zustand";
import { toast } from "sonner";
import {
    ProjectStatus,
    RfqProject,
    RequestedItem,
    SupplierBid,
    StorageSyncStatus,
} from "../types";
import {
    DEFAULT_CUSTOMS_RATES,
    DEFAULT_IPC_BRACKETS,
    DEFAULT_QUALITY_CRITERIA,
    DEFAULT_PASS_FAIL_REQUIREMENTS,
} from "../constants/default-customs-rates";
import { getPhilippineTimestamp } from "../utils/timestamp";
interface MasterLookupData {
    suppliers: any[];
    products: any[];
    units: Array<{ unitId: number; unitName: string; unitShortcut: string }>;
    forex: any[];
    evaluations: any[];
}

interface BidComparisonState {
    // Navigation & Workspace
    currentStep: number; // 1 to 5
    activeBidId: string | null;
    storageStatus: StorageSyncStatus;
    lastSavedTimestamp: string | null;
    lastSavedUser: string | null;

    // Realtime Sync & Throttle Pipeline
    isDirty: boolean;
    isSaving: boolean;
    saveError: string | null;
    lastSyncedTimestamp: string | null;

    // Projects
    projectsList: Array<{
        id: string;
        rfqTitle: string;
        rfqReference: string;
        status: ProjectStatus;
        roundNo: number;
        updatedAt?: string;
    }>;
    currentProject: RfqProject | null;

    // Master data
    lookups: MasterLookupData;
    isLoadingLookups: boolean;

    // Actions
    setCurrentStep: (step: number) => void;
    setActiveBidId: (id: string | null) => void;
    fetchProjects: () => Promise<void>;
    fetchLookups: () => Promise<void>;
    selectProject: (projectId: string) => void;
    createNewProject: (title?: string, ref?: string) => void;
    updateProject: (updater: (prev: RfqProject) => RfqProject, allowWhenLocked?: boolean) => void;
    duplicateProject: (newTitle?: string) => void;
    deleteProject: () => Promise<void>;
    saveCurrentProject: () => Promise<void>;
    saveProjectNow: () => Promise<void>;
    emergencyKeepaliveSave: () => void;
}

const LOCAL_STORAGE_KEY_PREFIX = "mm_rfq_project_";
const LOCAL_STORAGE_INDEX_KEY = "mm_rfq_projects_index";

function createEmptyProject(title = "New Canvass Project", ref = ""): RfqProject {
    const id = "rfq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const reference = ref || `RFQ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    return {
        id,
        rfqTitle: title,
        rfqReference: reference,
        roundNo: 1,
        comparisonCurrency: "PHP",
        budget: null,
        notes: "",
        fxRiskBufferPct: 3.0,
        costOfMoneyPctPerYear: 8.0,
        defaultVatPct: 12.0,
        countVatAsCost: true,
        calcCustomsAuto: true,
        scoringWeightPricePct: 50.0,
        scoringWeightQualityPct: 35.0,
        scoringWeightLeadTimePct: 15.0,
        status: "Draft",
        version: 1,
        preparedBy: "",
        preparedByTitle: "Procurement Officer",
        reviewedBy: "",
        reviewedByTitle: "BAC Reviewer",
        approvedBy: "",
        approvedByTitle: "Approving Authority",
        justification: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
        qualityCriteria: DEFAULT_QUALITY_CRITERIA.map((c, i) => ({
            id: `crit-${i + 1}`,
            criterionType: "SCORED",
            criterionName: c.criterionName,
            weightPct: c.weightPct,
            sortOrder: i + 1,
        })),
        exchangeRates: [
            { currencyCode: "USD", rateToComparison: 58.50 },
            { currencyCode: "CNY", rateToComparison: 8.10 },
            { currencyCode: "EUR", rateToComparison: 63.20 },
            { currencyCode: "JPY", rateToComparison: 0.38 },
            { currencyCode: "SGD", rateToComparison: 44.50 },
        ],
        customsRates: { ...DEFAULT_CUSTOMS_RATES },
        ipcBrackets: [...DEFAULT_IPC_BRACKETS],
        bids: [],
        awards: [],
        approvalHistory: [],
    };
}

function computeProjectFingerprint(p: RfqProject): string {
    return JSON.stringify({
        id: p.id,
        dbId: p.dbId,
        t: p.rfqTitle,
        r: p.rfqReference,
        pId: p.parentRfqId,
        rnd: p.roundNo,
        curr: p.comparisonCurrency,
        bgt: p.budget,
        notes: p.notes,
        st: p.status,
        itms: p.items,
        bids: p.bids,
        aw: p.awards,
        qc: p.qualityCriteria,
        rates: p.exchangeRates,
        cust: p.customsRates,
        ipc: p.ipcBrackets,
        fx: p.fxRiskBufferPct,
        com: p.costOfMoneyPctPerYear,
        vat: p.defaultVatPct,
        cVat: p.countVatAsCost,
        cCust: p.calcCustomsAuto,
        wp: p.scoringWeightPricePct,
        wq: p.scoringWeightQualityPct,
        wl: p.scoringWeightLeadTimePct,
        prep: p.preparedBy,
        prepT: p.preparedByTitle,
        rev: p.reviewedBy,
        revT: p.reviewedByTitle,
        appr: p.approvedBy,
        apprT: p.approvedByTitle,
        just: p.justification,
    });
}

let debounceTimer: NodeJS.Timeout | null = null;
let maxWaitTimer: NodeJS.Timeout | null = null;
let localStorageTimer: NodeJS.Timeout | null = null;
let inFlightSave: Promise<void> | null = null;
let queuedSaveNeeded = false;
let lastSavedContentHash = "";
const DEBOUNCE_DELAY_MS = 2500;
const MAX_WAIT_MS = 10000;

export const useBidComparisonStore = create<BidComparisonState>((set, get) => ({
    currentStep: 1,
    activeBidId: null,
    storageStatus: "SHARED_LIVE",
    lastSavedTimestamp: null,
    lastSavedUser: null,

    // Realtime Sync Pipeline
    isDirty: false,
    isSaving: false,
    saveError: null,
    lastSyncedTimestamp: null,

    projectsList: [],
    currentProject: null,
    lookups: { suppliers: [], products: [], units: [], forex: [], evaluations: [] },
    isLoadingLookups: false,

    setCurrentStep: (step) => set({ currentStep: step }),
    setActiveBidId: (id) => set({ activeBidId: id }),

    fetchLookups: async () => {
        set({ isLoadingLookups: true });
        try {
            const res = await fetch("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison/lookups");
            if (res.ok) {
                const data = await res.json();
                set({
                    lookups: {
                        suppliers: data.suppliers || [],
                        products: data.products || [],
                        units: data.units || [],
                        forex: data.forex || [],
                        evaluations: data.evaluations || [],
                    },
                });
            }
        } catch {
            // Master lookups failure
        } finally {
            set({ isLoadingLookups: false });
        }
    },

    fetchProjects: async () => {
        try {
            const res = await fetch("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison");
            if (res.ok) {
                const data = await res.json();
                if (data.projects && data.projects.length > 0) {
                    const formatted = data.projects.map((p: any) => ({
                        id: String(p.id),
                        rfqTitle: p.rfq_title || "Untitled",
                        rfqReference: p.rfq_reference || "-",
                        status: p.status || "Draft",
                        roundNo: p.round_no || 1,
                        updatedAt: p.updated_at,
                    }));
                    set({ projectsList: formatted, storageStatus: "SHARED_LIVE" });
                    return;
                }
            }
        } catch {
            // Shared storage unreachable
        }

        // Check local storage fallback
        if (typeof window !== "undefined") {
            try {
                const localIdx = localStorage.getItem(LOCAL_STORAGE_INDEX_KEY);
                if (localIdx) {
                    const parsed = JSON.parse(localIdx);
                    set({ projectsList: parsed, storageStatus: "SAVED_LOCAL" });
                }
            } catch {
                set({ storageStatus: "OFFLINE_ERROR" });
            }
        }
    },

    selectProject: (projectId: string) => {
        lastSavedContentHash = "";
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + projectId);
            if (saved) {
                try {
                    const parsed: RfqProject = JSON.parse(saved);
                    set({
                        currentProject: parsed,
                        activeBidId: parsed.bids.length > 0 ? parsed.bids[0].id : null,
                        storageStatus: parsed.status === "Approved" || parsed.status === "Submitted" ? "SHARED_VIEW_ONLY" : "SHARED_LIVE",
                        lastSavedTimestamp: getPhilippineTimestamp(),
                    });
                    return;
                } catch {
                    // JSON parse error
                }
            }
        }
    },

    createNewProject: (title, ref) => {
        lastSavedContentHash = "";
        const newProj = createEmptyProject(title, ref);
        const { lookups } = get();

        // Prefill active forex rates from lookup if available
        if (lookups.forex && lookups.forex.length > 0) {
            newProj.exchangeRates = lookups.forex.map((f) => ({
                currencyCode: f.currencyCode,
                rateToComparison: f.exchangeRate,
            }));
        }

        const updatedList = [
            {
                id: newProj.id,
                rfqTitle: newProj.rfqTitle,
                rfqReference: newProj.rfqReference,
                status: newProj.status,
                roundNo: newProj.roundNo,
                updatedAt: newProj.updatedAt,
            },
            ...get().projectsList,
        ];

        set({
            currentProject: newProj,
            activeBidId: null,
            currentStep: 1,
            projectsList: updatedList,
            storageStatus: "SHARED_LIVE",
            lastSavedTimestamp: getPhilippineTimestamp(),
        });

        if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + newProj.id, JSON.stringify(newProj));
            localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(updatedList));
        }

        toast.success(`Created project "${newProj.rfqTitle}"`);
    },

    updateProject: (updater, allowWhenLocked = false) => {
        const { currentProject } = get();
        if (!currentProject) return;

        // View only check (locked when Submitted or Approved, unless transitioning status or explicitly allowed)
        if (!allowWhenLocked && (currentProject.status === "Submitted" || currentProject.status === "Approved")) {
            const preview = updater({ ...currentProject });
            if (preview.status === currentProject.status) {
                toast.error("Project is locked and cannot be edited in this status.");
                return;
            }
        }

        const updated = updater(currentProject);
        updated.updatedAt = new Date().toISOString();

        // Tier 1: Instant in-memory reactive state (0ms) - completely jank-free
        set({
            currentProject: updated,
            isDirty: true,
            saveError: null,
            lastSavedTimestamp: getPhilippineTimestamp(),
            storageStatus:
                updated.status === "Approved" || updated.status === "Submitted"
                    ? "SHARED_VIEW_ONLY"
                    : "SHARED_LIVE",
        });

        // Debounce expensive JSON.stringify & synchronous localStorage disk I/O (150ms)
        // so rapid slider dragging and continuous typing execute at a solid 60fps
        if (localStorageTimer) clearTimeout(localStorageTimer);
        localStorageTimer = setTimeout(() => {
            if (typeof window !== "undefined") {
                try {
                    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + updated.id, JSON.stringify(updated));
                    const list = get().projectsList.map((p) =>
                        p.id === updated.id
                            ? { ...p, rfqTitle: updated.rfqTitle, rfqReference: updated.rfqReference, status: updated.status, updatedAt: updated.updatedAt }
                            : p
                    );
                    localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(list));
                } catch {
                    // LocalStorage write error handled safely
                }
            }
        }, 150);

        // Tier 2: Debounced network sync (2.5s idle debounce, 10s max wait flush)
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            get().saveProjectNow();
        }, DEBOUNCE_DELAY_MS);

        if (!maxWaitTimer) {
            maxWaitTimer = setTimeout(() => {
                get().saveProjectNow();
            }, MAX_WAIT_MS);
        }
    },

    duplicateProject: (newTitle) => {
        lastSavedContentHash = "";
        const { currentProject } = get();
        if (!currentProject) return;

        const nextRound = (currentProject.roundNo || 1) + 1;
        const duplicated: RfqProject = {
            ...currentProject,
            id: "rfq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            parentRfqId: currentProject.dbId || null,
            roundNo: nextRound,
            rfqTitle: newTitle || `${currentProject.rfqTitle} - Round ${nextRound}`,
            status: "Draft",
            version: 1,
            awards: [], // Reset awards
            approvalHistory: [], // Reset history
            bids: currentProject.bids.map((b) => ({
                ...b,
                attachments: [], // Clear attachments on duplication
            })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const updatedList = [
            {
                id: duplicated.id,
                rfqTitle: duplicated.rfqTitle,
                rfqReference: duplicated.rfqReference,
                status: duplicated.status,
                roundNo: duplicated.roundNo,
                updatedAt: duplicated.updatedAt,
            },
            ...get().projectsList,
        ];

        set({
            currentProject: duplicated,
            activeBidId: duplicated.bids.length > 0 ? duplicated.bids[0].id : null,
            projectsList: updatedList,
            storageStatus: "SHARED_LIVE",
            lastSavedTimestamp: getPhilippineTimestamp(),
        });

        if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + duplicated.id, JSON.stringify(duplicated));
            localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(updatedList));
        }

        toast.success(`Duplicated as Round ${nextRound}`);
    },

    deleteProject: async () => {
        const { currentProject, projectsList } = get();
        if (!currentProject) return;

        const remaining = projectsList.filter((p) => p.id !== currentProject.id);

        if (typeof window !== "undefined") {
            localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX + currentProject.id);
            localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(remaining));
        }

        const nextProj = remaining.length > 0 ? remaining[0] : null;
        set({
            projectsList: remaining,
            currentProject: null,
            activeBidId: null,
        });

        if (nextProj) {
            get().selectProject(nextProj.id);
        } else {
            get().createNewProject();
        }

        toast.success("Project deleted successfully");
    },

    saveCurrentProject: async () => {
        await get().saveProjectNow();
    },

    saveProjectNow: async () => {
        const { currentProject, isSaving } = get();
        if (!currentProject) return;

        // Cancel scheduled debounce/maxWait timers as we are saving immediately
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        if (maxWaitTimer) {
            clearTimeout(maxWaitTimer);
            maxWaitTimer = null;
        }

        // Fast-path: Skip redundant network PUT if data content hasn't changed
        const currentFingerprint = computeProjectFingerprint(currentProject);
        if (lastSavedContentHash === currentFingerprint && !get().isDirty) {
            return;
        }

        // If a save is already in-flight, queue a subsequent flush once current completes
        if (inFlightSave) {
            queuedSaveNeeded = true;
            return;
        }

        // Ensure local persistence is up-to-date
        if (typeof window !== "undefined") {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + currentProject.id, JSON.stringify(currentProject));
                const list = get().projectsList.map((p) =>
                    p.id === currentProject.id
                        ? { ...p, rfqTitle: currentProject.rfqTitle, rfqReference: currentProject.rfqReference, status: currentProject.status, updatedAt: currentProject.updatedAt }
                        : p
                );
                localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(list));
            } catch {
                // LocalStorage write error handled
            }
        }

        set({ isSaving: true, saveError: null });

        inFlightSave = (async () => {
            try {
                const res = await fetch("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(currentProject),
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.backendUnavailable || !data.success) {
                        set({
                            isSaving: false,
                            saveError: data.error || "Backend storage currently unavailable",
                            storageStatus: "SAVED_LOCAL",
                        });
                        return;
                    }

                    // CRITICAL: Always preserve user's in-progress keystrokes and live state
                    const liveProject = get().currentProject;
                    if (!liveProject) {
                        set({ isSaving: false });
                        return;
                    }

                    if (data.project) {
                        const serverId = String(data.project.id);
                        const serverDbId = data.project.dbId || (typeof data.project.id === "number" ? data.project.id : undefined);
                        const oldId = liveProject.id;

                        if (serverId !== oldId || (serverDbId && liveProject.dbId !== serverDbId)) {
                            // Update IDs on the live project without overwriting user's active fields
                            const updatedProject = {
                                ...liveProject,
                                id: serverId,
                                dbId: serverDbId || liveProject.dbId,
                            };

                            if (typeof window !== "undefined") {
                                try {
                                    localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX + oldId);
                                    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + serverId, JSON.stringify(updatedProject));
                                    const updatedList = get().projectsList.map((p) =>
                                        p.id === oldId ? { ...p, id: serverId } : p
                                    );
                                    localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(updatedList));
                                    set({ currentProject: updatedProject, projectsList: updatedList });
                                } catch {
                                    // LocalStorage quota error handled safely
                                }
                            }
                        }
                    }

                    // Update fingerprint cache on successful backend persist
                    lastSavedContentHash = currentFingerprint;

                    // If user typed new characters while this save was in flight, keep isDirty true
                    const hasPendingKeystrokes = queuedSaveNeeded;
                    set({
                        isDirty: hasPendingKeystrokes,
                        isSaving: false,
                        saveError: null,
                        lastSyncedTimestamp: getPhilippineTimestamp(),
                        storageStatus:
                            liveProject.status === "Approved" || liveProject.status === "Submitted"
                                ? "SHARED_VIEW_ONLY"
                                : "SHARED_LIVE",
                    });
                } else {
                    const errJson = await res.json().catch(() => null);
                    set({
                        isSaving: false,
                        saveError: errJson?.error || `HTTP ${res.status}`,
                        storageStatus: "SAVED_LOCAL",
                    });
                }
            } catch (err) {
                set({
                    isSaving: false,
                    saveError: (err as Error).message || "Network unreachable",
                    storageStatus: "SAVED_LOCAL",
                });
            } finally {
                inFlightSave = null;
                if (queuedSaveNeeded) {
                    queuedSaveNeeded = false;
                    get().saveProjectNow();
                }
            }
        })();
    },

    emergencyKeepaliveSave: () => {
        const { currentProject, isDirty } = get();
        if (!currentProject || !isDirty) return;

        try {
            fetch("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(currentProject),
                keepalive: true,
            });
        } catch {
            // Keepalive best-effort fallback
        }
    },
}));
