"use client";

import { create } from "zustand";
import { toast } from "sonner";
import {
    ProjectStatus,
    RfqProject,
    RequestedItem,
    QualityCriterion,
    SupplierBid,
    ItemQuotation,
    ItemAward,
    StorageSyncStatus,
} from "../types";
import {
    DEFAULT_CUSTOMS_RATES,
    DEFAULT_IPC_BRACKETS,
    DEFAULT_QUALITY_CRITERIA,
 
} from "../constants/default-customs-rates";
import { getPhilippineTimestamp } from "../utils/timestamp";
export interface MasterLookupSupplier {
    id: number;
    supplierName: string;
    contactPerson: string;
    emailAddress: string;
    phoneNumber: string;
    country: string;
    isForeign: boolean;
    supplierType: string;
    currency: string;
    paymentTerms: string;
    deliveryTerms: string;
    [key: string]: unknown;
}

export interface MasterLookupProduct {
    productId: number;
    productName: string;
    productCode: string;
    uom: string;
    targetUnitPrice: number;
    weightKg: number;
    cbmLength: number;
    cbmWidth: number;
    cbmHeight: number;
    [key: string]: unknown;
}

export interface MasterLookupForex {
    currencyCode: string;
    currencyName: string;
    exchangeRate: number;
    effectiveDate: string;
    [key: string]: unknown;
}

interface MasterLookupData {
    suppliers: MasterLookupSupplier[];
    products: MasterLookupProduct[];
    units: Array<{ unitId: number; unitName: string; unitShortcut: string }>;
    forex: MasterLookupForex[];
    evaluations: Record<string, unknown>[];
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
    isLoadingProject: boolean;
    switchingToProjectId: string | null;

    // Master data
    lookups: MasterLookupData;
    isLoadingLookups: boolean;

    // Frankfurter Forex Cache
    forexCache: { base: string; date: string; ratesToComparison: Record<string, number> } | null;
    isLoadingForex: boolean;
    fetchForexRates: (baseCurrency?: string, force?: boolean) => Promise<{ success: boolean; date?: string; error?: string }>;

    // User session
    currentUser: { name?: string; email?: string } | null;
    setCurrentUser: (user: { name?: string; email?: string } | null) => void;

    // Actions
    setCurrentStep: (step: number) => void;
    setActiveBidId: (id: string | null) => void;
    fetchProjects: () => Promise<void>;
    fetchLookups: () => Promise<void>;
    selectProject: (projectId: string) => Promise<void>;
    clearCurrentProject: () => void;
    createNewProject: (title?: string, ref?: string) => void;
    importFullProject: (project: RfqProject) => void;
    updateProject: (updater: (prev: RfqProject) => RfqProject, allowWhenLocked?: boolean) => void;
    duplicateProject: (newTitle?: string) => void;
    deleteProject: () => Promise<boolean>;
    saveCurrentProject: () => Promise<void>;
    saveProjectNow: () => Promise<void>;
    emergencyKeepaliveSave: () => void;
}

const LOCAL_STORAGE_KEY_PREFIX = "mm_rfq_project_";
const LOCAL_STORAGE_INDEX_KEY = "mm_rfq_projects_index";
export const ACTIVE_PROJECT_ID_KEY = "mm_rfq_active_project_id";

function parseDbId(val: unknown): number | null {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string") {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 0 && String(parsed) === val.trim()) {
            return parsed;
        }
    }
    return null;
}

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
        strat: p.awardStrategy,
        tgt: p.targetDate,
        rej: p.rejectionReason,
        appRem: p.approvalRemarks,
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

function formatUserFriendlySaveError(raw: unknown): string {
    if (!raw) return "An unexpected error occurred while saving.";
    const str = typeof raw === "string" ? raw : (raw as Error)?.message || String(raw);
    let msg = str.replace(/^Directus (PATCH|POST) [a-zA-Z0-9_/-]+ failed:\s*/i, "");
    if (msg.includes("Incorrect date value")) {
        if (msg.includes("valid_until")) {
            return 'Invalid date in bid validity date ("Valid Until"). Please enter a valid 4-digit year (YYYY-MM-DD).';
        }
        if (msg.includes("quote_date")) {
            return 'Invalid quotation date. Please enter a valid 4-digit year (YYYY-MM-DD).';
        }
        if (msg.includes("target_date")) {
            return 'Invalid target delivery date. Please enter a valid 4-digit year (YYYY-MM-DD).';
        }
        return 'Incorrect date value detected. Please enter a valid 4-digit year (YYYY-MM-DD).';
    }
    if (msg.includes('Invalid Date format in field "valid_until"')) {
        return 'Invalid date in bid validity date ("Valid Until"). Please enter a valid date (YYYY-MM-DD).';
    }
    if (msg.includes('Invalid Date format in field "quote_date"')) {
        return 'Invalid quotation date format. Please enter a valid date (YYYY-MM-DD).';
    }
    if (msg.includes('Invalid Date format in field "target_date"')) {
        return 'Invalid target delivery date format. Please enter a valid date (YYYY-MM-DD).';
    }
    if (msg.includes("uq_rfq_currency")) {
        return "Duplicate currency code in exchange rates. Each currency code can only be added once.";
    }
    if (msg.includes("uq_bid_item")) {
        return "Duplicate item quotation detected for this supplier.";
    }
    if (msg.includes("chk_bid_score_range")) {
        return "Quality score must be between 1 and 5.";
    }
    if (msg.includes('Value in collection "mm_rfq" has to be unique') || msg.includes("uq_rfq_reference_round")) {
        return 'Reference Number Conflict: The Reference Number entered already exists in the system. Please change the "Reference no." field in Project Details to a unique value.';
    }
    if (msg.includes(" - ")) {
        msg = msg.split(" - ").pop() || msg;
    }
    return msg;
}

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
    isLoadingProject: false,
    switchingToProjectId: null,
    lookups: { suppliers: [], products: [], units: [], forex: [], evaluations: [] },
    isLoadingLookups: false,

    forexCache: null,
    isLoadingForex: false,

    fetchForexRates: async (baseCurrency?: string, force = false) => {
        const currentComp = baseCurrency || get().currentProject?.comparisonCurrency || "PHP";
        const existing = get().forexCache;
        if (!force && existing && existing.base === currentComp) {
            return { success: true, date: existing.date };
        }

        set({ isLoadingForex: true });
        try {
            const url = `/api/manufacturing/procurement-and-inbound/supplier-bid-comparison/forex?base=${encodeURIComponent(currentComp)}${force ? "&force=true" : ""}`;
            const res = await fetch(url);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            if (!data.success || !data.ratesToComparison) {
                throw new Error(data.error || "Invalid response from forex service");
            }

            const ratesMap: Record<string, number> = data.ratesToComparison;
            const rateDate = data.date || new Date().toISOString().split("T")[0];

            set({
                forexCache: {
                    base: currentComp,
                    date: rateDate,
                    ratesToComparison: ratesMap,
                },
            });

            // If forced refresh (manual user click), update existing project exchange rates to live values
            if (force) {
                const project = get().currentProject;
                if (project && project.exchangeRates && project.exchangeRates.length > 0) {
                    get().updateProject((prev) => ({
                        ...prev,
                        exchangeRates: prev.exchangeRates.map((r) => {
                            const liveRate = ratesMap[r.currencyCode];
                            return typeof liveRate === "number" && liveRate > 0
                                ? { ...r, rateToComparison: Number(Number(liveRate).toFixed(4)) }
                                : r;
                        }),
                    }));
                }
            }

            return { success: true, date: rateDate };
        } catch (err) {
            const msg = (err as Error)?.message || "Failed to fetch foreign exchange rates.";
            return { success: false, error: msg };
        } finally {
            set({ isLoadingForex: false });
        }
    },

    currentUser: null,
    setCurrentUser: (user) => set({ currentUser: user }),

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
                    const formatted = data.projects.map((p: Record<string, unknown>) => ({
                        id: String(p.id ?? ""),
                        rfqTitle: String(p.rfq_title ?? p.rfqTitle ?? "").trim() || "-",
                        rfqReference: String(p.rfq_reference || "-"),
                        status: (p.status as ProjectStatus) || "Draft",
                        roundNo: Number(p.round_no) || 1,
                        updatedAt: p.updated_at ? String(p.updated_at) : undefined,
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

    selectProject: async (projectId: string) => {
        // Flush any pending unsaved edits on the outgoing project before switching
        const outgoing = get().currentProject;
        if (outgoing && outgoing.id !== projectId && get().isDirty) {
            await get().saveProjectNow();
        }

        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        if (maxWaitTimer) {
            clearTimeout(maxWaitTimer);
            maxWaitTimer = null;
        }
        if (localStorageTimer) {
            clearTimeout(localStorageTimer);
            localStorageTimer = null;
        }

        lastSavedContentHash = "";
        let loadedFromLocal = false;

        set({ isLoadingProject: true, switchingToProjectId: projectId });

        // Save active project ID immediately so refresh preserves choice
        if (typeof window !== "undefined") {
            try {
                localStorage.setItem(ACTIVE_PROJECT_ID_KEY, projectId);
            } catch {
                // Ignore storage error
            }
        }

        try {
            // 1. Instant hydration from localStorage if available
            if (typeof window !== "undefined") {
                const saved = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + projectId);
                if (saved) {
                    try {
                        const parsed: RfqProject = JSON.parse(saved);
                        if (!parsed.rfqTitle && (parsed as unknown as { rfq_title?: string }).rfq_title) {
                            parsed.rfqTitle = String((parsed as unknown as { rfq_title?: string }).rfq_title || "");
                        }
                        set({
                            currentProject: parsed,
                            activeBidId: Array.isArray(parsed.bids) && parsed.bids.length > 0 ? parsed.bids[0].id : null,
                            storageStatus: parsed.status === "Awarded" || parsed.status === "Approved" || parsed.status === "Submitted" ? "SHARED_VIEW_ONLY" : "SHARED_LIVE",
                            lastSavedTimestamp: getPhilippineTimestamp(),
                        });
                        loadedFromLocal = true;
                    } catch {
                        // JSON parse error
                    }
                }
            }

            // 2. Fetch live project from Directus API
            let loadError: string | null = null;
            try {
                const res = await fetch(`/api/manufacturing/procurement-and-inbound/supplier-bid-comparison?id=${encodeURIComponent(projectId)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.project) {
                        const proj: RfqProject = data.project;

                        // Guard: If user navigated away to "All RFQs" or switched to another project while fetch was in-flight, discard
                        const currentActiveId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_PROJECT_ID_KEY) : null;
                        if (get().switchingToProjectId !== projectId || (currentActiveId && currentActiveId !== projectId)) {
                            return;
                        }

                        set({
                            currentProject: proj,
                            activeBidId: proj.bids && proj.bids.length > 0 ? proj.bids[0].id : null,
                            storageStatus: proj.status === "Awarded" || proj.status === "Approved" || proj.status === "Submitted" ? "SHARED_VIEW_ONLY" : "SHARED_LIVE",
                            lastSavedTimestamp: getPhilippineTimestamp(),
                        });

                        // Sync to localStorage
                        if (typeof window !== "undefined") {
                            try {
                                localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + proj.id, JSON.stringify(proj));
                            } catch {
                                // localStorage quota or disabled
                            }
                        }
                        return;
                    }
                    loadError = data.error || "Project data was empty.";
                } else {
                    const errJson = await res.json().catch(() => null);
                    loadError = errJson?.error || `Failed to load project (HTTP ${res.status})`;
                }
            } catch (err) {
                loadError = (err as Error)?.message || "Unable to reach server to load project.";
            }

            // 3. Report error explicitly if project could not be loaded (no silent blank project fallback)
            if (!loadedFromLocal && !get().currentProject && get().switchingToProjectId === projectId) {
                if (typeof window !== "undefined") {
                    try {
                        localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
                    } catch {
                        // Ignore storage error
                    }
                }
                toast.error(loadError || "Failed to open RFQ project.");
            }
        } finally {
            if (get().switchingToProjectId === projectId) {
                set({ isLoadingProject: false, switchingToProjectId: null });
            }
        }
    },

    clearCurrentProject: () => {
        // Flush any unsaved work via keepalive before leaving so recent typing is never lost
        const outgoing = get().currentProject;
        if (outgoing && get().isDirty && !inFlightSave) {
            try {
                fetch("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(outgoing),
                    keepalive: true,
                }).catch(() => null);
            } catch {
                // Ignore keepalive error
            }
        }

        // Cancel all in-flight and scheduled timers immediately
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        if (maxWaitTimer) {
            clearTimeout(maxWaitTimer);
            maxWaitTimer = null;
        }
        if (localStorageTimer) {
            clearTimeout(localStorageTimer);
            localStorageTimer = null;
        }
        inFlightSave = null;
        queuedSaveNeeded = false;
        lastSavedContentHash = "";

        if (typeof window !== "undefined") {
            try {
                localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
            } catch {
                // Ignore storage error
            }
        }
        set({
            currentProject: null,
            activeBidId: null,
            isDirty: false,
            isLoadingProject: false,
            switchingToProjectId: null,
            saveError: null,
            storageStatus: "SHARED_LIVE",
        });
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
            isLoadingProject: false,
            switchingToProjectId: null,
            projectsList: updatedList,
            storageStatus: "SHARED_LIVE",
            lastSavedTimestamp: getPhilippineTimestamp(),
        });

        if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + newProj.id, JSON.stringify(newProj));
            localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(updatedList));
            localStorage.setItem(ACTIVE_PROJECT_ID_KEY, newProj.id);
        }

        toast.success(`Created project "${newProj.rfqTitle}"`);
    },

    importFullProject: (importedProject: RfqProject) => {
        lastSavedContentHash = "";
        const id = "rfq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        // Ensure unique reference against projectsList to prevent "Value in collection mm_rfq has to be unique"
        let safeRef = (importedProject.rfqReference || `RFQ-${Date.now().toString().slice(-6)}`).trim();
        const baseRef = safeRef;
        let attempt = 1;
        while (
            get().projectsList.some((p) => p.rfqReference?.toLowerCase().trim() === safeRef.toLowerCase().trim()) &&
            attempt <= 20
        ) {
            attempt++;
            safeRef = `${baseRef}-COPY${attempt > 2 ? `-${attempt}` : ""}`;
        }

        // Strip dbId from items so they become fresh rows in Directus
        const cleanItems: RequestedItem[] = (importedProject.items || []).map((it) => ({
            ...it,
            dbId: undefined,
        }));

        // Strip dbId from quality criteria
        const cleanQualityCriteria: QualityCriterion[] = (importedProject.qualityCriteria || []).map((qc) => ({
            ...qc,
            dbId: undefined,
        }));

        // Strip dbId from bids, quotations, price breaks; keep quality scores and attachments intact
        const cleanBids: SupplierBid[] = (importedProject.bids || []).map((b) => {
            const cleanQuotes: Record<string, ItemQuotation> = {};
            if (b.quotations) {
                Object.entries(b.quotations).forEach(([itemId, q]) => {
                    cleanQuotes[itemId] = {
                        ...q,
                        dbId: undefined,
                        priceBreaks: (q.priceBreaks || []).map((pb) => ({
                            ...pb,
                            dbId: undefined,
                        })),
                    };
                });
            }

            return {
                ...b,
                dbId: undefined,
                quotations: cleanQuotes,
                scores: { ...(b.scores || {}) },
                attachments: [...(b.attachments || [])],
            };
        });

        // Strip dbId from awards
        const cleanAwards: ItemAward[] = (importedProject.awards || []).map((a) => ({
            ...a,
            dbId: undefined,
        }));

        const newProject: RfqProject = {
            ...importedProject,
            id,
            dbId: undefined, // CRITICAL: Reset dbId so saving inserts a new record in mm_rfq!
            rfqReference: safeRef,
            status: "Draft", // CRITICAL: Enforce Draft status
            version: 1,
            rejectionReason: undefined,
            approvalRemarks: undefined,
            customsRates: {
                ...DEFAULT_CUSTOMS_RATES,
                ...(importedProject.customsRates || {}),
            },
            ipcBrackets:
                Array.isArray(importedProject.ipcBrackets) && importedProject.ipcBrackets.length > 0
                    ? importedProject.ipcBrackets
                    : DEFAULT_IPC_BRACKETS.map((b) => ({ ...b })),
            items: cleanItems,
            qualityCriteria: cleanQualityCriteria,
            bids: cleanBids,
            awards: cleanAwards,
            approvalHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const updatedList = [
            {
                id: newProject.id,
                rfqTitle: newProject.rfqTitle,
                rfqReference: newProject.rfqReference,
                status: newProject.status,
                roundNo: newProject.roundNo || 1,
                updatedAt: newProject.updatedAt,
            },
            ...get().projectsList.filter((p) => p.id !== newProject.id),
        ];

        set({
            currentProject: newProject,
            activeBidId: newProject.bids.length > 0 ? newProject.bids[0].id : null,
            currentStep: 1,
            projectsList: updatedList,
            storageStatus: "SHARED_LIVE",
            lastSavedTimestamp: getPhilippineTimestamp(),
            isDirty: true,
        });

        if (typeof window !== "undefined") {
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + newProject.id, JSON.stringify(newProject));
                localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(updatedList));
                localStorage.setItem(ACTIVE_PROJECT_ID_KEY, newProject.id);
            } catch {
                // Storage quota handled safely
            }
        }

        toast.success(`Imported project "${newProject.rfqTitle}" (${newProject.bids.length} suppliers) as Draft`);
        // Trigger save to backend
        get().saveProjectNow();
    },

    updateProject: (updater, allowWhenLocked = false) => {
        const { currentProject } = get();
        if (!currentProject) return;

        // View only check (locked when Awarded, Submitted or Approved, unless transitioning status or explicitly allowed)
        if (!allowWhenLocked && (currentProject.status === "Awarded" || currentProject.status === "Submitted" || currentProject.status === "Approved")) {
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
                updated.status === "Awarded" || updated.status === "Approved" || updated.status === "Submitted"
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
        const parentId = parseDbId(currentProject.dbId) || parseDbId(currentProject.id) || null;
        const newClientId = "rfq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        // Strip dbId from items so they become new rows upon saving
        const cleanItems: RequestedItem[] = (currentProject.items || []).map((it) => ({
            ...it,
            dbId: undefined,
        }));

        // Strip dbId from quality criteria
        const cleanQualityCriteria: QualityCriterion[] = (currentProject.qualityCriteria || []).map((qc) => ({
            ...qc,
            dbId: undefined,
        }));

        // Strip dbId from bids, quotations, and price breaks
        const cleanBids: SupplierBid[] = (currentProject.bids || []).map((b) => {
            const cleanQuotes: Record<string, ItemQuotation> = {};
            if (b.quotations) {
                Object.entries(b.quotations).forEach(([itemId, q]) => {
                    cleanQuotes[itemId] = {
                        ...q,
                        dbId: undefined,
                        priceBreaks: (q.priceBreaks || []).map((pb) => ({
                            ...pb,
                            dbId: undefined,
                        })),
                    };
                });
            }

            return {
                ...b,
                dbId: undefined,
                quotations: cleanQuotes,
                scores: { ...(b.scores || {}) },
                attachments: [], // Clear attachments on duplication
            };
        });

        const duplicated: RfqProject = {
            ...currentProject,
            id: newClientId,
            dbId: undefined, // CRITICAL: Must be undefined so it never points to or overwrites parent ID!
            parentRfqId: parentId,
            roundNo: nextRound,
            rfqTitle: newTitle || `${currentProject.rfqTitle} - Round ${nextRound}`,
            status: "Draft",
            version: 1,
            rejectionReason: undefined,
            approvalRemarks: undefined,
            awardStrategy: "MANUAL",
            items: cleanItems,
            qualityCriteria: cleanQualityCriteria,
            bids: cleanBids,
            awards: [], // Reset awards
            approvalHistory: [], // Reset history
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
            isDirty: true,
        });

        if (typeof window !== "undefined") {
            localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + duplicated.id, JSON.stringify(duplicated));
            localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(updatedList));
            localStorage.setItem(ACTIVE_PROJECT_ID_KEY, duplicated.id);
        }

        toast.success(`Duplicated as Round ${nextRound}`);

        // Trigger immediate save so the duplicate creates its own distinct row in mm_rfq
        get().saveProjectNow();
    },

    deleteProject: async (): Promise<boolean> => {
        const { currentProject, projectsList } = get();
        if (!currentProject) return false;

        const serverDbId = parseDbId(currentProject.dbId) || parseDbId(currentProject.id);

        if (serverDbId) {
            try {
                const res = await fetch(`/api/manufacturing/procurement-and-inbound/supplier-bid-comparison?id=${encodeURIComponent(serverDbId)}`, {
                    method: "DELETE",
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => null);
                    toast.error(data?.error || `Failed to soft-delete project on server (${res.status})`);
                    return false;
                }
            } catch (err) {
                toast.error("Network error while deleting project: " + ((err as Error).message || "Offline"));
                return false;
            }
        }

        const currentClientId = String(currentProject.id);
        const currentDbIdStr = serverDbId ? String(serverDbId) : null;

        // ONLY filter out this specific project (by its own client ID or its own server DB ID)
        const remaining = projectsList.filter((p) => {
            const pid = String(p.id);
            if (pid === currentClientId) return false;
            if (currentDbIdStr && pid === currentDbIdStr) return false;
            return true;
        });

        if (typeof window !== "undefined") {
            localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
            localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX + currentProject.id);
            if (serverDbId) {
                localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX + serverDbId);
            }
            localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(remaining));
        }

        const nextProj = remaining.length > 0 ? remaining[0] : null;
        set({
            projectsList: remaining,
            currentProject: null,
            activeBidId: null,
        });

        if (nextProj) {
            await get().selectProject(nextProj.id);
        } else {
            get().createNewProject();
        }

        toast.success(`Project "${currentProject.rfqTitle}" soft-deleted successfully`);
        return true;
    },

    saveCurrentProject: async () => {
        await get().saveProjectNow();
    },

    saveProjectNow: async () => {
        const { currentProject } = get();
        if (!currentProject) return;

        // Map rfqTitle if stored in legacy snake_case
        const rawTitle = currentProject.rfqTitle ?? (currentProject as unknown as { rfq_title?: string }).rfq_title;
        const title = String(rawTitle ?? "").trim();
        if (!title) {
            toast.error("Project / RFQ title is required. Please enter a title before saving.");
            set({
                isSaving: false,
                saveError: "Project / RFQ title is required.",
                storageStatus: "SAVED_LOCAL",
                isDirty: true,
            });
            return;
        }

        const projectToSave = currentProject.rfqTitle !== title
            ? { ...currentProject, rfqTitle: title }
            : currentProject;

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
        const currentFingerprint = computeProjectFingerprint(projectToSave);
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
                localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + projectToSave.id, JSON.stringify(projectToSave));
                const list = get().projectsList.map((p) =>
                    p.id === projectToSave.id
                        ? { ...p, rfqTitle: projectToSave.rfqTitle, rfqReference: projectToSave.rfqReference, status: projectToSave.status, updatedAt: projectToSave.updatedAt }
                        : p
                );
                localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(list));
            } catch {
                // LocalStorage write error handled
            }
        }

        const sentProjectId = projectToSave.id;
        set({ currentProject: projectToSave, isSaving: true, saveError: null });

        inFlightSave = (async () => {
            try {
                const res = await fetch("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(projectToSave),
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.backendUnavailable || !data.success) {
                        const rawErr = data.error || (data.partialFailure ? `Partial failure in ${data.partialFailure.section}: ${data.partialFailure.error}` : "Backend storage currently unavailable");
                        const errMsg = formatUserFriendlySaveError(rawErr);
                        toast.error(errMsg);
                        set({
                            isSaving: false,
                            saveError: errMsg,
                            storageStatus: "SAVED_LOCAL",
                            isDirty: true,
                        });
                        return;
                    }

                    if (data.partialFailure) {
                        const sectionError = formatUserFriendlySaveError(data.partialFailure.error);
                        toast.error(`Save issue in "${data.partialFailure.section}": ${sectionError}. Retrying automatically.`);
                        set({
                            isSaving: false,
                            saveError: `Save issue in ${data.partialFailure.section}`,
                            storageStatus: "SAVED_LOCAL",
                            isDirty: true,
                        });
                        return;
                    }

                    // CRITICAL: Verify user is still on the exact same project before stamping server IDs
                    const liveProject = get().currentProject;
                    const activeKey = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_PROJECT_ID_KEY) : null;
                    if (!liveProject || !activeKey || liveProject.id !== sentProjectId) {
                        set({ isSaving: false });
                        return;
                    }

                    const serverId = data.project ? String(data.project.id) : liveProject.id;
                    const serverDbId = data.project?.dbId || (typeof data.project?.id === "number" ? data.project.id : undefined);
                    const oldId = liveProject.id;

                    // Stamp resolved database IDs for child entities to prevent duplicate rows on next save
                    const updatedProject = {
                        ...liveProject,
                        id: serverId,
                        dbId: serverDbId || liveProject.dbId,
                        rfqReference: data.project?.rfqReference || liveProject.rfqReference,
                    };

                    if (data.resolvedIds) {
                        const { items: itemMap, criteria: critMap, bids: bidMap, attachments: attMap } = data.resolvedIds as {
                            items?: Record<string, number>;
                            criteria?: Record<string, number>;
                            bids?: Record<string, number>;
                            attachments?: Record<string, number>;
                        };

                        if (itemMap && updatedProject.items) {
                            updatedProject.items = updatedProject.items.map((it) =>
                                itemMap[it.id] ? { ...it, dbId: itemMap[it.id] } : it
                            );
                        }
                        if (critMap && updatedProject.qualityCriteria) {
                            updatedProject.qualityCriteria = updatedProject.qualityCriteria.map((qc) =>
                                critMap[qc.id] ? { ...qc, dbId: critMap[qc.id] } : qc
                            );
                        }
                        if (bidMap && updatedProject.bids) {
                            updatedProject.bids = updatedProject.bids.map((b) =>
                                bidMap[b.id] ? { ...b, dbId: bidMap[b.id] } : b
                            );
                        }
                        if (attMap && updatedProject.bids) {
                            updatedProject.bids = updatedProject.bids.map((b) => ({
                                ...b,
                                attachments: (b.attachments || []).map((att) =>
                                    attMap[att.id] ? { ...att, dbId: attMap[att.id] } : att
                                ),
                            }));
                        }
                    }

                    if (typeof window !== "undefined") {
                        try {
                            if (serverId !== oldId) {
                                localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX + oldId);
                                localStorage.setItem(ACTIVE_PROJECT_ID_KEY, serverId);
                            }
                            localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + serverId, JSON.stringify(updatedProject));
                            const updatedList = get().projectsList.map((p) =>
                                p.id === oldId
                                    ? { ...p, id: serverId, rfqTitle: updatedProject.rfqTitle, rfqReference: updatedProject.rfqReference, status: updatedProject.status, updatedAt: updatedProject.updatedAt }
                                    : p
                            );
                            localStorage.setItem(LOCAL_STORAGE_INDEX_KEY, JSON.stringify(updatedList));
                            set({ currentProject: updatedProject, projectsList: updatedList });
                        } catch {
                            // LocalStorage quota error handled safely
                            set({ currentProject: updatedProject });
                        }
                    } else {
                        set({ currentProject: updatedProject });
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
                            liveProject.status === "Awarded" || liveProject.status === "Approved" || liveProject.status === "Submitted"
                                ? "SHARED_VIEW_ONLY"
                                : "SHARED_LIVE",
                    });
                } else {
                    const errJson = await res.json().catch(() => null);
                    const rawError = errJson?.error || `HTTP ${res.status}`;
                    const userError = formatUserFriendlySaveError(rawError);
                    toast.error(userError);
                    set({
                        isSaving: false,
                        saveError: userError,
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
