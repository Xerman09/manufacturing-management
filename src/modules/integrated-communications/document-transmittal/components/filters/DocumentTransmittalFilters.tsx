"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, RotateCcw } from "lucide-react";
import { format, subDays, startOfDay, startOfMonth, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useDocumentTransmittalFilter } from "../../context/DocumentTransmittalFilterContext";
import { Combobox } from "../Combobox";
import { TransmittalStatus } from "../../types/document-transmittal.types";
import { DataTableFacetedFilter } from "./DataTableFacetedFilter";

interface DocumentTransmittalFiltersProps {
    availableSenders: { label: string; value: string }[];
    availableReceivers: { label: string; value: string }[];
    isLoading?: boolean;
}

const DATE_PRESETS = [
    { label: "Today", getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
    { label: "Last 7 days", getValue: () => ({ from: subDays(startOfDay(new Date()), 7), to: endOfDay(new Date()) }) },
    { label: "This month", getValue: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }) },
];

const STATUS_OPTIONS = [
    { label: "Pending", value: "Pending" },
    { label: "Partially Received", value: "Partially Received" },
    { label: "Fully Received", value: "Fully Received" },
];

export function DocumentTransmittalFilters({
    availableSenders,
    availableReceivers,
    isLoading = false,
}: DocumentTransmittalFiltersProps) {
    const {
        stagedSenderId,
        setStagedSenderId,
        stagedReceiverId,
        setStagedReceiverId,
        stagedStatus,
        setStagedStatus,
        stagedDateRange,
        setStagedDateRange,
        senderId,
        receiverId,
        status,
        dateRange,
        applyFilters,
        resetFilters,
        isDirty,
    } = useDocumentTransmittalFilter();

    const hasFilters = !!(
        stagedSenderId ||
        stagedReceiverId ||
        stagedDateRange?.from ||
        (stagedStatus && stagedStatus.length > 0) ||
        senderId ||
        receiverId ||
        dateRange?.from ||
        (status && status.length > 0)
    );

    return (
        <div className="flex items-center gap-2 flex-wrap mb-4">
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-8 gap-1.5 text-xs",
                            !stagedDateRange && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {stagedDateRange?.from
                            ? stagedDateRange.to
                                ? `${format(stagedDateRange.from, "MMM d")} – ${format(stagedDateRange.to, "MMM d")}`
                                : format(stagedDateRange.from, "MMM d")
                            : "Date range"}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={stagedDateRange?.from}
                        selected={stagedDateRange}
                        onSelect={setStagedDateRange}
                        numberOfMonths={2}
                    />
                    <div className="flex items-center gap-1.5 px-3 pb-3 border-t pt-3">
                        {DATE_PRESETS.map((preset) => (
                            <Button
                                key={preset.label}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setStagedDateRange(preset.getValue())}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            <Combobox
                options={[{ value: "", label: "All senders" }, ...availableSenders]}
                value={stagedSenderId || ""}
                onValueChange={(v) => setStagedSenderId(v || null)}
                placeholder="Sender"
                className="h-8 w-[160px] text-xs"
            />

            <Combobox
                options={[{ value: "", label: "All receivers" }, ...availableReceivers]}
                value={stagedReceiverId || ""}
                onValueChange={(v) => setStagedReceiverId(v || null)}
                placeholder="Receiver"
                className="h-8 w-[160px] text-xs"
            />

            <DataTableFacetedFilter
                title="Status"
                multiple
                options={STATUS_OPTIONS}
                value={stagedStatus}
                onValueChange={(values) => setStagedStatus(values as TransmittalStatus[])}
            />

            <Button
                size="sm"
                className="h-8 text-xs"
                onClick={applyFilters}
                disabled={!isDirty || isLoading}
            >
                {isLoading ? "Applying..." : "Apply"}
            </Button>

            {hasFilters && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={resetFilters}
                >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Reset
                </Button>
            )}
        </div>
    );
}
