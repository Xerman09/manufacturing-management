import React from "react";
import { AlertTriangle, ClipboardList, Database, Layers } from "lucide-react";
import { formatPlanningLastUpdated } from "./PlanningDataStatus";

export interface PlanningMetricLoadState {
    loading: boolean;
    error: string | null;
    lastUpdatedAt: string | null;
}

export type PlanningBranchState = "loading" | "error" | "none" | "unselected" | "selected";

export interface PlanningSummaryCardsProps {
    demandLinesCount: number;
    shortfallItemsCount: number | null;
    queueJobOrdersCount: number;
    queueEntriesCount: number;
    branchState: PlanningBranchState;
    demandState: PlanningMetricLoadState;
    requirementsState: PlanningMetricLoadState;
    queueState: PlanningMetricLoadState;
    onSelectTab?: (tab: "demand" | "inventory" | "queue") => void;
}

type SummaryDestination = "demand" | "inventory" | "queue";

function metricDisplay(
    count: number | null,
    state: PlanningMetricLoadState,
    branchState: PlanningBranchState,
    loadingLabel = "Loading results..."
) {
    if (branchState === "loading") return { value: "Loading...", description: "Loading target branches." };
    if (branchState === "error") return { value: "Unavailable", description: "Target branches could not be loaded." };
    if (branchState === "none") return { value: "—", description: "No active target branches are available." };
    if (branchState === "unselected") return { value: "—", description: "Select a target branch to view results." };
    if (state.error && !state.lastUpdatedAt) return { value: "Unavailable", description: "Request failed. Open this section to retry." };
    if (state.loading && !state.lastUpdatedAt) return { value: loadingLabel, description: "Results are being calculated." };
    if (count === null) return { value: "Unavailable", description: "Results are not available." };

    const updatedAt = state.lastUpdatedAt ? formatPlanningLastUpdated(state.lastUpdatedAt) : null;
    const description = state.error && updatedAt
        ? `Refresh failed. Showing data last updated ${updatedAt}.`
        : state.loading && updatedAt
            ? `Refreshing. Last updated ${updatedAt}.`
            : updatedAt
                ? `Last updated ${updatedAt}.`
                : "Results are not available yet.";

    return { value: count.toLocaleString(), description };
}

export function PlanningSummaryCards({
    demandLinesCount,
    shortfallItemsCount,
    queueJobOrdersCount,
    queueEntriesCount,
    branchState,
    demandState,
    requirementsState,
    queueState,
    onSelectTab
}: PlanningSummaryCardsProps) {
    const demand = metricDisplay(demandLinesCount, demandState, branchState, "Loading demand...");
    const shortfalls = metricDisplay(shortfallItemsCount, requirementsState, branchState, "Calculating...");
    const jobOrders = metricDisplay(queueJobOrdersCount, queueState, branchState, "Loading Job Order queue...");
    const queueEntries = metricDisplay(queueEntriesCount, queueState, branchState, "Loading Job Order queue...");
    const hasShortfallCount = shortfallItemsCount !== null && branchState === "selected"
        && (!requirementsState.loading || Boolean(requirementsState.lastUpdatedAt));
    const hasShortfalls = hasShortfallCount && shortfallItemsCount > 0;

    const renderCard = (
        destination: SummaryDestination,
        accessibleName: string,
        hoverClassName: string,
        cardClassName: string,
        content: React.ReactNode
    ) => {
        const className = `bg-card border rounded-xl p-3 sm:p-4 shadow-sm flex items-center justify-between gap-2 transition-all ${cardClassName} ${
            onSelectTab ? `cursor-pointer ${hoverClassName}` : ""
        }`;

        if (!onSelectTab) return <div className={className}>{content}</div>;

        return (
            <button
                type="button"
                onClick={() => onSelectTab(destination)}
                aria-label={accessibleName}
                className={`${className} w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
            >
                {content}
            </button>
        );
    };

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {renderCard(
                "demand",
                `View schedulable Sales Order demand: ${demand.value}. Open the Demand tab.`,
                "hover:border-primary/50 hover:shadow-md",
                "",
                <>
                    <span className="block min-w-0 space-y-1" title="Unfulfilled Sales Order lines for the selected branch.">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">Schedulable SO Demand</span>
                        <span className="block text-xl font-black text-foreground sm:text-2xl">{demand.value}</span>
                        {branchState === "selected" && demandState.lastUpdatedAt && (
                            <span className="block text-[9px] text-muted-foreground sm:text-[10px]">Residual demand ready for JO planning.</span>
                        )}
                        <span className="block text-[9px] text-muted-foreground sm:text-[10px]">
                            {demand.description}
                        </span>
                    </span>
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary sm:h-10 sm:w-10">
                        <ClipboardList className="h-5 w-5" />
                    </span>
                </>
            )}

            {renderCard(
                "inventory",
                `View product and sub-assembly shortfalls: ${shortfalls.value}. Open the Net Requirements tab.`,
                "hover:border-amber-500/50 hover:shadow-md",
                hasShortfalls ? "border-amber-500/30 bg-amber-500/5" : "",
                <>
                    <span className="block min-w-0 space-y-1" title="Schedulable Sales Order products and mapped BOM components with a calculated shortfall. Raw material requirements are not included.">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">Product &amp; Sub-assembly Shortfalls</span>
                        <span className={`block text-xl font-black sm:text-2xl ${hasShortfalls ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                            {hasShortfallCount ? shortfallItemsCount!.toLocaleString() : shortfalls.value}
                        </span>
                        <span className="block text-[9px] text-muted-foreground sm:text-[10px]">
                            {hasShortfallCount && shortfallItemsCount === 0
                                ? `No product or mapped component shortfalls. ${shortfalls.description}`
                                : hasShortfallCount
                                    ? `Affected product/component rows, not units. Raw materials are excluded. ${shortfalls.description}`
                                    : shortfalls.description}
                        </span>
                    </span>
                    <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border sm:h-10 sm:w-10 ${hasShortfalls ? "border-amber-500/20 bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground"}`}>
                        {hasShortfalls ? <AlertTriangle className="h-5 w-5" /> : <Database className="h-5 w-5" />}
                    </span>
                </>
            )}

            {renderCard(
                "queue",
                `View Job Order queue: ${jobOrders.value} individual Job Orders. Open the queue tab.`,
                "hover:border-sky-500/50 hover:shadow-md",
                "",
                <>
                    <span className="block min-w-0 space-y-1" title="All recognized, non-cancelled Job Orders for the selected branch, including Closed Job Orders.">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">Individual Job Orders</span>
                        <span className="block text-xl font-black text-foreground sm:text-2xl">{jobOrders.value}</span>
                        {branchState === "selected" && queueState.lastUpdatedAt && (
                            <span className="block text-[9px] text-muted-foreground sm:text-[10px]">All non-cancelled statuses, including Closed.</span>
                        )}
                        <span className="block text-[9px] text-muted-foreground sm:text-[10px]">{jobOrders.description}</span>
                    </span>
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-500 sm:h-10 sm:w-10">
                        <Layers className="h-5 w-5" />
                    </span>
                </>
            )}

            {renderCard(
                "queue",
                `View Job Order queue: ${queueEntries.value} grouped queue entries. Family entries may include multiple Job Orders.`,
                "hover:border-emerald-500/50 hover:shadow-md",
                "",
                <>
                    <span className="block min-w-0 space-y-1">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">Queue Entries</span>
                        <span className="block text-xl font-black text-foreground sm:text-2xl">{queueEntries.value}</span>
                        {branchState === "selected" && queueState.lastUpdatedAt && (
                            <span className="block text-[9px] text-muted-foreground sm:text-[10px]">A family entry can contain multiple Job Orders.</span>
                        )}
                        <span className="block text-[9px] text-muted-foreground sm:text-[10px]">{queueEntries.description}</span>
                    </span>
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 sm:h-10 sm:w-10">
                        <Layers className="h-5 w-5" />
                    </span>
                </>
            )}
        </div>
    );
}
