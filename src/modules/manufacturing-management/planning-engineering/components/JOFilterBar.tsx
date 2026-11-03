import React from "react";
import { Search, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectLabel,
    SelectSeparator,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { JOB_ORDER_STATUS } from "../../job-order-status";

type SpecificQueueStatus =
    | typeof JOB_ORDER_STATUS.PICKED
    | typeof JOB_ORDER_STATUS.IN_PRODUCTION
    | typeof JOB_ORDER_STATUS.ON_HOLD
    | typeof JOB_ORDER_STATUS.QA_HOLD
    | typeof JOB_ORDER_STATUS.PRODUCTION_COMPLETED
    | typeof JOB_ORDER_STATUS.FOR_QA_RECONCILIATION
    | typeof JOB_ORDER_STATUS.CLOSED;

export type PlanningQueueView =
    | "active"
    | "ready-to-initialize"
    | "awaiting-staging"
    | "all"
    | `status:${SpecificQueueStatus}`;

export interface JOFilterBarProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    queueView: PlanningQueueView;
    setQueueView: (view: PlanningQueueView) => void;
    totalCount: number;
    filteredCount: number;
    lockedStatus?: {
        value: string;
        label: string;
    };
}

export function JOFilterBar({
    searchQuery,
    setSearchQuery,
    queueView,
    setQueueView,
    totalCount,
    filteredCount,
    lockedStatus
}: JOFilterBarProps) {
    const hasActiveFilters = searchQuery.trim() !== "" || (!lockedStatus && queueView !== "active");

    const handleClear = () => {
        setSearchQuery("");
        if (!lockedStatus) setQueueView("active");
    };

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3 rounded-xl border border-border/60">
            <div className="flex flex-1 flex-col sm:flex-row items-center gap-2.5">
                {/* Search input */}
                <div className="relative flex-1 w-full sm:max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search JO #, product, or notes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-xs bg-card border-input"
                    />
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                    {lockedStatus ? (
                        <div
                            role="status"
                            aria-label={`Status filter: ${lockedStatus.label}`}
                            className="flex h-9 w-full items-center rounded-md border border-input bg-card px-3 text-xs font-semibold text-foreground sm:w-[150px]"
                        >
                            <span className="mr-1 text-muted-foreground">Status:</span>
                            {lockedStatus.label}
                        </div>
                    ) : (
                        <Select value={queueView} onValueChange={(value) => setQueueView(value as PlanningQueueView)}>
                            <SelectTrigger className="h-9 font-semibold text-xs bg-card border-input w-full sm:w-[230px]" aria-label="Job Order queue view">
                                <SelectValue placeholder="Queue view" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Queue views</SelectLabel>
                                    <SelectItem value="active">Active orders</SelectItem>
                                    <SelectItem value="ready-to-initialize">Ready to initialize · Draft</SelectItem>
                                    <SelectItem value="awaiting-staging">Awaiting staging · For Picking</SelectItem>
                                    <SelectItem value="all">All orders · includes Closed</SelectItem>
                                </SelectGroup>
                                <SelectSeparator />
                                <SelectGroup>
                                    <SelectLabel>Specific status</SelectLabel>
                                    <SelectItem value={`status:${JOB_ORDER_STATUS.PICKED}`}>Picked</SelectItem>
                                    <SelectItem value={`status:${JOB_ORDER_STATUS.IN_PRODUCTION}`}>In Production</SelectItem>
                                    <SelectItem value={`status:${JOB_ORDER_STATUS.ON_HOLD}`}>On Hold</SelectItem>
                                    <SelectItem value={`status:${JOB_ORDER_STATUS.QA_HOLD}`}>QA Hold</SelectItem>
                                    <SelectItem value={`status:${JOB_ORDER_STATUS.PRODUCTION_COMPLETED}`}>Production Completed</SelectItem>
                                    <SelectItem value={`status:${JOB_ORDER_STATUS.FOR_QA_RECONCILIATION}`}>For QA and Reconciliation</SelectItem>
                                    <SelectItem value={`status:${JOB_ORDER_STATUS.CLOSED}`}>Closed</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={handleClear}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
                    >
                        <X className="h-3.5 w-3.5" /> Clear Filters
                    </Button>
                )}
            </div>

            <div className="text-[11px] text-muted-foreground font-medium text-right shrink-0">
                Showing <strong className="text-foreground">{filteredCount}</strong> of <strong className="text-foreground">{totalCount}</strong> Job Orders in this view
            </div>
        </div>
    );
}
