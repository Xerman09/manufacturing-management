import React from "react";
import { ClipboardList, Database, Layers, AlertTriangle } from "lucide-react";

export interface PlanningSummaryCardsProps {
    demandLinesCount: number;
    shortfallItemsCount: number | null;
    unreleasedJobsCount: number;
    familyGroupsCount: number;
    onSelectTab?: (tab: "demand" | "inventory" | "queue") => void;
}

type SummaryDestination = "demand" | "inventory" | "queue";

export function PlanningSummaryCards({
    demandLinesCount,
    shortfallItemsCount,
    unreleasedJobsCount,
    familyGroupsCount,
    onSelectTab
}: PlanningSummaryCardsProps) {
    const hasShortfallCount = shortfallItemsCount !== null;
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

        if (!onSelectTab) {
            return <div className={className}>{content}</div>;
        }

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

    const shortfallCountLabel = shortfallItemsCount === null
        ? "count unavailable"
        : `${shortfallItemsCount.toLocaleString()} ${shortfallItemsCount === 1 ? "item" : "items"}`;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: Residual planning demand */}
            {renderCard(
                "demand",
                `View Schedulable SO Demand: ${demandLinesCount.toLocaleString()} demand ${demandLinesCount === 1 ? "line" : "lines"}. Open the Demand tab.`,
                "hover:border-primary/50 hover:shadow-md",
                "",
                <>
                    <span className="block min-w-0 space-y-1" title="Unfulfilled Sales Order lines for the selected branch.">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">
                            Schedulable SO Demand
                        </span>
                        <span className="block text-xl font-black text-foreground sm:text-2xl">
                            {demandLinesCount.toLocaleString()}
                        </span>
                        <span className="block text-[9px] text-muted-foreground sm:text-[10px]">
                            Residual demand ready for JO planning
                        </span>
                    </span>
                    <span aria-hidden="true" className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 sm:h-10 sm:w-10">
                        <ClipboardList className="h-5 w-5" />
                    </span>
                </>
            )}

            {/* Card 2: Net Shortfall Items */}
            {renderCard(
                "inventory",
                `View Material Shortfalls: ${shortfallCountLabel}. Open the Net Requirements tab.`,
                "hover:border-amber-500/50 hover:shadow-md",
                hasShortfalls ? "border-amber-500/30 bg-amber-500/5" : "",
                <>
                    <span className="block min-w-0 space-y-1" title="Net requirement items that need purchasing or replenishment.">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">
                            Material Shortfalls
                        </span>
                        <span className={`block text-xl font-black sm:text-2xl ${hasShortfalls ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                            {hasShortfallCount ? shortfallItemsCount.toLocaleString() : "—"}
                        </span>
                        <span className="block text-[9px] text-muted-foreground sm:text-[10px]">
                            {hasShortfallCount ? "Items needing PR or replenishment" : "Requirements calculation unavailable"}
                        </span>
                    </span>
                    <span aria-hidden="true" className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 sm:h-10 sm:w-10 ${hasShortfalls ? "bg-amber-500/10 border border-amber-500/20 text-amber-500" : "bg-muted border text-muted-foreground"}`}>
                        {hasShortfalls ? <AlertTriangle className="h-5 w-5" /> : <Database className="h-5 w-5" />}
                    </span>
                </>
            )}

            {/* Card 3: Unreleased Job Orders */}
            {renderCard(
                "queue",
                `View Job Order Queue: ${unreleasedJobsCount.toLocaleString()} ${unreleasedJobsCount === 1 ? "Job Order" : "Job Orders"}. Open the queue tab.`,
                "hover:border-sky-500/50 hover:shadow-md",
                "",
                <>
                    <span className="block min-w-0 space-y-1" title="Scheduled and released Job Orders for the selected branch, including their staging state.">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">
                            Job Order Queue
                        </span>
                        <span className="block text-xl font-black text-foreground sm:text-2xl">
                            {unreleasedJobsCount.toLocaleString()}
                        </span>
                        <span className="block text-[9px] text-muted-foreground sm:text-[10px]">
                            Scheduled &amp; released Job Orders
                        </span>
                    </span>
                    <span aria-hidden="true" className="h-8 w-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 shrink-0 sm:h-10 sm:w-10">
                        <Layers className="h-5 w-5" />
                    </span>
                </>
            )}

            {/* Card 4: Family Groups */}
            {renderCard(
                "queue",
                `View Active Family Groups: ${familyGroupsCount.toLocaleString()} ${familyGroupsCount === 1 ? "group" : "groups"}. Open the Job Order Queue tab.`,
                "hover:border-emerald-500/50 hover:shadow-md",
                "",
                <>
                    <span className="block min-w-0 space-y-1">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:text-xs">
                            Active Family Groups
                        </span>
                        <span className="block text-xl font-black text-foreground sm:text-2xl">
                            {familyGroupsCount.toLocaleString()}
                        </span>
                        <span className="block text-[9px] text-muted-foreground sm:text-[10px]">
                            Parent &amp; Sub-Assembly Job Bundles
                        </span>
                    </span>
                    <span aria-hidden="true" className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0 sm:h-10 sm:w-10">
                        <Layers className="h-5 w-5 text-emerald-500" />
                    </span>
                </>
            )}
        </div>
    );
}
