"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import {
    Search,
    Plus,
    Upload,
    ChevronRight,
    ChevronLeft,
    ChevronsLeft,
    ChevronsRight,
    FolderKanban,
    X,
    LayoutGrid,
    List as ListIcon,
    ArrowUpRight,
    Inbox,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectStatus } from "../../types";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";

interface ProjectItem {
    id: string;
    rfqTitle: string;
    rfqReference: string;
    status: ProjectStatus;
    roundNo: number;
    updatedAt?: string;
}

interface ExecutiveRfqDirectoryProps {
    projects: ProjectItem[];
    onSelectProject: (projectId: string) => void;
    onOpenNewProjectDialog: () => void;
    onOpenImportModal?: () => void;
}

/* -------------------------------------------------------------------------- */
/* Stage config                                                               */
/* -------------------------------------------------------------------------- */

interface StageConfig {
    label: string;
    hint: string;
    dot: string; // solid fill
    ring: string; // pipeline node border when it has items
    soft: string; // soft tinted background
    text: string;
    filled: number; // lit segments in the 3-step track
}

const STAGES: ProjectStatus[] = ["Draft", "Submitted", "Approved", "Rejected"];
const PIPELINE: ProjectStatus[] = ["Draft", "Submitted", "Approved"];

const STAGE_CONFIG: Record<string, StageConfig> = {
    Draft: {
        label: "Draft",
        hint: "Being prepared",
        dot: "bg-slate-400",
        ring: "border-slate-400",
        soft: "bg-slate-500/10",
        text: "text-slate-600 dark:text-slate-300",
        filled: 1,
    },
    Submitted: {
        label: "Pending review",
        hint: "Awaiting approval",
        dot: "bg-amber-500",
        ring: "border-amber-500",
        soft: "bg-amber-500/10",
        text: "text-amber-700 dark:text-amber-300",
        filled: 2,
    },
    Approved: {
        label: "Approved & awarded",
        hint: "Closed out",
        dot: "bg-emerald-500",
        ring: "border-emerald-500",
        soft: "bg-emerald-500/10",
        text: "text-emerald-700 dark:text-emerald-300",
        filled: 3,
    },
    Rejected: {
        label: "Rejected",
        hint: "Sent back",
        dot: "bg-rose-500",
        ring: "border-rose-500",
        soft: "bg-rose-500/10",
        text: "text-rose-700 dark:text-rose-300",
        filled: 2,
    },
};

const getStage = (status: ProjectStatus): StageConfig => STAGE_CONFIG[status] || STAGE_CONFIG.Draft;
const normalizeStatus = (status: ProjectStatus): ProjectStatus => (STAGE_CONFIG[status] ? status : "Draft");

const VIEW_KEY = "mm_rfq_directory_view";

const viewListeners = new Set<() => void>();
function notifyViewChange() {
    viewListeners.forEach((listener) => listener());
}

function subscribeView(callback: () => void) {
    viewListeners.add(callback);
    if (typeof window !== "undefined") {
        window.addEventListener("storage", callback);
    }
    return () => {
        viewListeners.delete(callback);
        if (typeof window !== "undefined") {
            window.removeEventListener("storage", callback);
        }
    };
}

function getViewSnapshot(): "board" | "list" {
    if (typeof window === "undefined") return "board";
    try {
        const saved = localStorage.getItem(VIEW_KEY);
        if (saved === "board" || saved === "list") return saved;
    } catch {
        // ignore
    }
    return "board";
}

function getViewServerSnapshot(): "board" | "list" {
    return "board";
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatUpdated(iso?: string): { short: string; full: string } {
    if (!iso) return { short: "—", full: "" };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { short: "—", full: "" };

    const full = d.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfThat = new Date(d);
    startOfThat.setHours(0, 0, 0, 0);
    const days = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86_400_000);

    if (days <= 0) return { short: "Today", full };
    if (days === 1) return { short: "Yesterday", full };
    if (days < 7) return { short: `${days} days ago`, full };
    return {
        short: d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
        full,
    };
}

const StageTrack: React.FC<{ status: ProjectStatus }> = ({ status }) => {
    const cfg = getStage(status);
    return (
        <div className="flex items-center gap-1" title={`${cfg.label}`} aria-hidden="true">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className={cn("h-1.5 w-5 rounded-full", i < cfg.filled ? cfg.dot : "bg-muted-foreground/15")}
                />
            ))}
        </div>
    );
};

/* -------------------------------------------------------------------------- */
/* Pipeline (hero visual)                                                     */
/* -------------------------------------------------------------------------- */

interface PipelineNodeProps {
    status: ProjectStatus;
    count: number;
    active: boolean;
    dimmed: boolean;
    onClick: () => void;
}

const PipelineNode: React.FC<PipelineNodeProps> = ({ status, count, active, dimmed, onClick }) => {
    const cfg = getStage(status);
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "group flex w-24 sm:w-28 shrink-0 flex-col items-center gap-2 rounded-xl py-1 outline-none transition-opacity",
                "focus-visible:ring-2 focus-visible:ring-ring",
                dimmed && "opacity-40 hover:opacity-100"
            )}
        >
            <span
                className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full border-2 text-xl font-semibold tabular-nums transition-all",
                    "group-hover:scale-105",
                    count > 0
                        ? cn(cfg.ring, cfg.soft, "text-foreground")
                        : "border-dashed border-muted-foreground/30 text-muted-foreground/50",
                    active && "ring-4 ring-primary/20 scale-105"
                )}
            >
                {count}
            </span>
            <span className="text-center">
                <span className="block text-[11px] font-semibold leading-tight text-foreground">{cfg.label}</span>
                <span className="block text-[10px] text-muted-foreground">{cfg.hint}</span>
            </span>
        </button>
    );
};

const Connector: React.FC<{ active: boolean }> = ({ active }) => (
    <div
        aria-hidden="true"
        className={cn(
            "mt-[27px] h-0 min-w-4 flex-1 border-t-2 transition-colors",
            active ? "border-solid border-foreground/25" : "border-dashed border-muted-foreground/25"
        )}
    />
);

/* -------------------------------------------------------------------------- */
/* Board tile                                                                 */
/* -------------------------------------------------------------------------- */

const RfqTile: React.FC<{
    project: ProjectItem;
    index: number;
    onOpen: (id: string) => void;
    isOpening?: boolean;
    disabled?: boolean;
}> = ({
    project: p,
    index,
    onOpen,
    isOpening = false,
    disabled = false,
}) => {
        const updated = formatUpdated(p.updatedAt);
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(index * 0.03, 0.18) }}
            >
                <button
                    type="button"
                    disabled={disabled || isOpening}
                    onClick={() => onOpen(p.id)}
                    className={cn(
                        "group w-full rounded-xl border bg-card p-4 text-left shadow-xs outline-none transition-all",
                        isOpening
                            ? "border-primary ring-2 ring-primary/20 bg-primary/5 cursor-wait"
                            : "hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md cursor-pointer",
                        disabled && !isOpening && "opacity-60 pointer-events-none",
                        "focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[11px] font-semibold text-primary">{p.rfqReference}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                            R{p.roundNo || 1}
                        </span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                        {p.rfqTitle}
                    </p>

                    <div className="mt-4 flex items-center justify-between gap-2">
                        <StageTrack status={p.status} />
                        <span className="text-[11px] text-muted-foreground" title={updated.full}>
                            {updated.short}
                        </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t pt-3 text-[11px] font-medium transition-colors">
                        {isOpening ? (
                            <span className="flex items-center gap-1.5 text-primary font-semibold">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Opening RFQ...
                            </span>
                        ) : (
                            <>
                                <span className="text-muted-foreground group-hover:text-primary">Open review</span>
                                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </>
                        )}
                    </div>
                </button>
            </motion.div>
        );
    };

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

const LIST_GRID =
    "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[9.5rem_minmax(0,1fr)_5.5rem_11rem_7.5rem_1rem] items-center gap-x-5 gap-y-1 px-5";

export const ExecutiveRfqDirectory: React.FC<ExecutiveRfqDirectoryProps> = ({
    projects,
    onSelectProject,
    onOpenNewProjectDialog,
    onOpenImportModal,
}) => {
    const switchingToProjectId = useBidComparisonStore((s) => s.switchingToProjectId);
    const isLoadingProject = useBidComparisonStore((s) => s.isLoadingProject);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"ALL" | ProjectStatus>("ALL");
    const [listPage, setListPage] = useState(1);
    const [listPageSize, setListPageSize] = useState(10);
    const view = useSyncExternalStore(subscribeView, getViewSnapshot, getViewServerSnapshot);

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        setListPage(1);
    };

    const handleStatusFilter = (val: "ALL" | ProjectStatus) => {
        setStatusFilter(val);
        setListPage(1);
    };

    const changeView = (v: "board" | "list") => {
        try {
            localStorage.setItem(VIEW_KEY, v);
        } catch {
            // ignore
        }
        notifyViewChange();
    };

    const counts = useMemo(() => {
        const c: Record<string, number> = { Draft: 0, Submitted: 0, Approved: 0, Rejected: 0 };
        projects.forEach((p) => {
            c[normalizeStatus(p.status)] += 1;
        });
        return c;
    }, [projects]);

    const total = projects.length;

    const filteredProjects = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return projects.filter((p) => {
            const matchesStatus = statusFilter === "ALL" || normalizeStatus(p.status) === statusFilter;
            const matchesSearch =
                !query ||
                p.rfqTitle.toLowerCase().includes(query) ||
                p.rfqReference.toLowerCase().includes(query) ||
                p.id.toLowerCase().includes(query);
            return matchesStatus && matchesSearch;
        });
    }, [projects, statusFilter, searchQuery]);

    const totalListPages = Math.max(1, Math.ceil(filteredProjects.length / listPageSize));
    const safeListPage = Math.min(listPage, totalListPages);

    const paginatedProjects = useMemo(() => {
        const start = (safeListPage - 1) * listPageSize;
        return filteredProjects.slice(start, start + listPageSize);
    }, [filteredProjects, safeListPage, listPageSize]);

    const startItem = filteredProjects.length === 0 ? 0 : (safeListPage - 1) * listPageSize + 1;
    const endItem = Math.min(safeListPage * listPageSize, filteredProjects.length);

    const byStage = useMemo(() => {
        const g: Record<string, ProjectItem[]> = { Draft: [], Submitted: [], Approved: [], Rejected: [] };
        filteredProjects.forEach((p) => g[normalizeStatus(p.status)].push(p));
        return g;
    }, [filteredProjects]);

    const toggleStage = (s: ProjectStatus) => handleStatusFilter(statusFilter === s ? "ALL" : s);
    const columnsToShow = statusFilter === "ALL" ? STAGES : [statusFilter];
    const singleColumn = columnsToShow.length === 1;

    return (
        <div className="w-full space-y-6">
            {/* ------------------------------ Hero ------------------------------ */}
            <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.09] via-card to-card text-foreground"
            >
                {/* decoration */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
                    style={{
                        backgroundImage: "radial-gradient(color-mix(in srgb, currentColor 22%, transparent) 1px, transparent 1px)",
                        backgroundSize: "18px 18px",
                    }}
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
                />

                <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    {/* left: title + actions */}
                    <div className="min-w-0 space-y-5">
                        <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                            <FolderKanban className="h-3.5 w-3.5 text-primary" />
                            Procurement &middot; Supplier Comparison
                        </span>

                        <div className="space-y-2">
                            <h1 className="bg-gradient-to-b from-foreground to-foreground/65 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
                                RFQ Canvasses
                            </h1>
                            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                                Compare supplier quotations, landed cost and award decisions in one place.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <Button onClick={onOpenNewProjectDialog} className="h-10 gap-2 px-4 text-xs font-semibold shadow-sm">
                                <Plus className="h-4 w-4" />
                                Create New RFQ
                            </Button>

                            {onOpenImportModal && (
                                <Button
                                    variant="outline"
                                    onClick={onOpenImportModal}
                                    className="h-10 gap-2 px-4 text-xs font-semibold shadow-sm"
                                >
                                    <Upload className="h-4 w-4" />
                                    Import Project
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* right: pipeline route */}
                    <div className="rounded-xl border bg-background/60 p-4 backdrop-blur sm:p-5">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            Pipeline
                        </p>
                        <div className="flex items-start">
                            {PIPELINE.map((s, i) => (
                                <React.Fragment key={s}>
                                    <PipelineNode
                                        status={s}
                                        count={counts[s]}
                                        active={statusFilter === s}
                                        dimmed={statusFilter !== "ALL" && statusFilter !== s}
                                        onClick={() => toggleStage(s)}
                                    />
                                    {i < PIPELINE.length - 1 && <Connector active={counts[s] > 0} />}
                                </React.Fragment>
                            ))}
                            <div aria-hidden="true" className="mx-2 mt-1 h-14 w-px self-start bg-border" />
                            <PipelineNode
                                status="Rejected"
                                count={counts.Rejected}
                                active={statusFilter === "Rejected"}
                                dimmed={statusFilter !== "ALL" && statusFilter !== "Rejected"}
                                onClick={() => toggleStage("Rejected")}
                            />
                        </div>
                    </div>
                </div>
            </motion.section>

            {/* ----------------------------- Toolbar ---------------------------- */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-lg border bg-muted/60 p-0.5" role="group" aria-label="View">
                        {(
                            [
                                { key: "board", label: "Board", Icon: LayoutGrid },
                                { key: "list", label: "List", Icon: ListIcon },
                            ] as const
                        ).map(({ key, label, Icon }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => changeView(key)}
                                aria-pressed={view === key}
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                                    view === key
                                        ? "bg-background text-foreground shadow-xs"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>

                    <span className="text-xs text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">{filteredProjects.length}</span>{" "}
                        {filteredProjects.length === 1 ? "RFQ" : "RFQs"}
                    </span>

                    {statusFilter !== "ALL" && (
                        <button
                            type="button"
                            onClick={() => handleStatusFilter("ALL")}
                            className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pl-2 pr-1.5 text-[11px] font-medium transition-colors hover:bg-muted"
                        >
                            <span className={cn("h-1.5 w-1.5 rounded-full", getStage(statusFilter).dot)} />
                            {getStage(statusFilter).label}
                            <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                    )}
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search title or reference"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="h-9 bg-card pl-9 text-xs"
                    />
                </div>
            </div>

            {/* ------------------------------ Content --------------------------- */}
            {total > 0 && filteredProjects.length === 0 && searchQuery ? (
                <EmptyState
                    title="No RFQs found"
                    body={`Nothing matches "${searchQuery}". Try a different keyword.`}
                    onClear={() => {
                        handleSearchChange("");
                        handleStatusFilter("ALL");
                    }}
                />
            ) : total === 0 ? (
                <EmptyState
                    title="No RFQs yet"
                    body="Create your first RFQ to start comparing supplier bids."
                    action={
                        <Button onClick={onOpenNewProjectDialog} size="sm" className="mt-4 h-8 gap-1.5 text-xs">
                            <Plus className="h-3.5 w-3.5" />
                            Create New RFQ
                        </Button>
                    }
                />
            ) : view === "board" ? (
                /* ------------------------------ Board ------------------------------ */
                <div className={cn("grid items-start gap-4", !singleColumn && "md:grid-cols-2 xl:grid-cols-4")}>
                    {columnsToShow.map((s) => {
                        const cfg = getStage(s);
                        const items = byStage[s];
                        return (
                            <section key={s} className="rounded-2xl border bg-muted/30 p-2.5 flex flex-col">
                                <header className="flex items-center justify-between px-2 pb-2 pt-1.5 shrink-0">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                        <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                                        {cfg.label}
                                    </div>
                                    <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground shadow-xs">
                                        {items.length}
                                    </span>
                                </header>
                                <div className={cn("mx-2 mb-2.5 h-0.5 rounded-full shrink-0", cfg.dot, "opacity-70")} />

                                {items.length === 0 ? (
                                    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed py-8 text-center text-muted-foreground/70">
                                        <Inbox className="h-5 w-5" />
                                        <span className="text-[11px]">Nothing here</span>
                                    </div>
                                ) : (
                                    <div className={cn(
                                        "max-h-[580px] overflow-y-auto pr-1 overscroll-contain",
                                        singleColumn ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4 max-h-[640px]" : "space-y-2.5"
                                    )}>
                                        {items.map((p, i) => (
                                            <RfqTile
                                                key={p.id}
                                                project={p}
                                                index={i}
                                                onOpen={onSelectProject}
                                                isOpening={switchingToProjectId === p.id}
                                                disabled={isLoadingProject}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            ) : (
                /* ------------------------------- List ------------------------------ */
                <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                    <div
                        className={cn(
                            LIST_GRID,
                            "hidden border-b bg-muted/30 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:grid"
                        )}
                    >
                        <span>Reference</span>
                        <span>Project</span>
                        <span>Progress</span>
                        <span>Status</span>
                        <span>Updated</span>
                        <span />
                    </div>

                    {filteredProjects.length === 0 ? (
                        <div className="px-6 py-14 text-center text-xs text-muted-foreground">No RFQs in this stage yet.</div>
                    ) : (
                        <>
                            <ul className="divide-y">
                                {paginatedProjects.map((p) => {
                                    const cfg = getStage(p.status);
                                    const updated = formatUpdated(p.updatedAt);
                                    const isOpening = switchingToProjectId === p.id;
                                    return (
                                        <li key={p.id}>
                                            <div
                                                role="button"
                                                tabIndex={isLoadingProject ? -1 : 0}
                                                onClick={() => {
                                                    if (!isLoadingProject) onSelectProject(p.id);
                                                }}
                                                onKeyDown={(e) => {
                                                    if ((e.key === "Enter" || e.key === " ") && !isLoadingProject) {
                                                        e.preventDefault();
                                                        onSelectProject(p.id);
                                                    }
                                                }}
                                                className={cn(
                                                    LIST_GRID,
                                                    "group relative py-4 outline-none transition-colors",
                                                    isOpening
                                                        ? "bg-primary/5 ring-1 ring-primary/20 cursor-wait"
                                                        : "hover:bg-muted/40 focus-visible:bg-muted/50 cursor-pointer",
                                                    isLoadingProject && !isOpening && "opacity-50 pointer-events-none"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "absolute inset-y-0 left-0 w-[3px] opacity-0 transition-opacity group-hover:opacity-100",
                                                        cfg.dot
                                                    )}
                                                />
                                                <span className="order-3 col-span-2 truncate font-mono text-xs font-semibold text-primary md:order-none md:col-span-1">
                                                    {p.rfqReference}
                                                </span>
                                                <span className="order-1 flex min-w-0 items-center gap-2 md:order-none">
                                                    <span className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                                                        {p.rfqTitle}
                                                    </span>
                                                    <span className="shrink-0 rounded bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                                                        R{p.roundNo || 1}
                                                    </span>
                                                </span>
                                                <span className="hidden md:block">
                                                    <StageTrack status={p.status} />
                                                </span>
                                                <span className="order-2 flex items-center gap-2 whitespace-nowrap text-xs font-medium md:order-none">
                                                    <span className={cn("h-2 w-2 shrink-0 rounded-full", cfg.dot)} />
                                                    <span className={cfg.text}>{cfg.label}</span>
                                                </span>
                                                <span className="hidden truncate text-xs text-muted-foreground md:block" title={updated.full}>
                                                    {updated.short}
                                                </span>
                                                {isOpening ? (
                                                    <span className="flex items-center gap-1.5 text-xs text-primary font-semibold shrink-0">
                                                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                                        <span className="hidden sm:inline">Opening...</span>
                                                    </span>
                                                ) : (
                                                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary md:block" />
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>

                            {/* Pagination Controls */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-xs select-none">
                                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                                    <span>
                                        Showing <span className="font-semibold text-foreground">{startItem}</span>&ndash;<span className="font-semibold text-foreground">{endItem}</span> of{" "}
                                        <span className="font-semibold text-foreground">{filteredProjects.length}</span> {filteredProjects.length === 1 ? "RFQ" : "RFQs"}
                                    </span>
                                    <div className="flex items-center gap-1.5 pl-2 border-l border-border">
                                        <span className="text-[11px]">Rows per page:</span>
                                        <select
                                            value={listPageSize}
                                            onChange={(e) => {
                                                setListPageSize(Number(e.target.value));
                                                setListPage(1);
                                            }}
                                            className="h-7 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={safeListPage <= 1}
                                        onClick={() => setListPage(1)}
                                        title="First page"
                                    >
                                        <ChevronsLeft className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={safeListPage <= 1}
                                        onClick={() => setListPage((prev) => Math.max(1, prev - 1))}
                                        title="Previous page"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                    </Button>

                                    <span className="px-2 text-xs font-medium text-muted-foreground">
                                        Page <span className="font-semibold text-foreground">{safeListPage}</span> of{" "}
                                        <span className="font-semibold text-foreground">{totalListPages}</span>
                                    </span>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={safeListPage >= totalListPages}
                                        onClick={() => setListPage((prev) => Math.min(totalListPages, prev + 1))}
                                        title="Next page"
                                    >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={safeListPage >= totalListPages}
                                        onClick={() => setListPage(totalListPages)}
                                        title="Last page"
                                    >
                                        <ChevronsRight className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

/* -------------------------------------------------------------------------- */

const EmptyState: React.FC<{
    title: string;
    body: string;
    onClear?: () => void;
    action?: React.ReactNode;
}> = ({ title, body, onClear, action }) => (
    <div className="rounded-2xl border border-dashed px-6 py-16 text-center">
        <FolderKanban className="mx-auto h-9 w-9 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{body}</p>
        {onClear && (
            <Button variant="outline" size="sm" className="mt-4 h-8 gap-1.5 text-xs" onClick={onClear}>
                <X className="h-3.5 w-3.5" />
                Clear filters
            </Button>
        )}
        {action}
    </div>
);