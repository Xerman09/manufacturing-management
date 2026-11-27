"use client";

import React, { useState } from "react";
import { Check, ChevronsUpDown, Eye, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SnapshotMetaItem {
    id: number;
    report_code: string;
    version: number;
    status: "Draft" | "In Review" | "Published";
    cutoff_date_from: string;
    cutoff_date_to: string;
    prediction_horizon: string;
    reviewer_notes?: string | null;
    created_at?: string;
    published_at?: string | null;
    rejected_at?: string | null;
    created_by?: { user_fname?: string; user_lname?: string } | number | null;
    published_by?: { user_fname?: string; user_lname?: string } | number | null;
    rejected_by?: { user_fname?: string; user_lname?: string } | number | null;
}

interface SnapshotSelectorComboboxProps {
    snapshots: SnapshotMetaItem[];
    selectedId: number | null; // null for live calculation
    onSelectSnapshot: (id: number | null) => void;
    onPreviewSnapshot: (snapshot: SnapshotMetaItem) => void;
    isLoading?: boolean;
}

export function SnapshotSelectorCombobox({
    snapshots,
    selectedId,
    onSelectSnapshot,
    onPreviewSnapshot,
    isLoading
}: SnapshotSelectorComboboxProps) {
    const [open, setOpen] = useState(false);

    const activeSnapshot = snapshots.find((s) => s.id === selectedId);

    const getBadgeStyle = (status: string) => {
        switch (status) {
            case "Published":
                return "bg-emerald-600 text-white";
            case "In Review":
                return "bg-blue-600 text-white";
            default:
                return "bg-slate-500 text-white";
        }
    };

    return (
        <div className="flex items-center gap-1.5">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="h-8 justify-between text-xs font-normal min-w-[210px] sm:min-w-[260px]"
                        disabled={isLoading}
                    >
                        <div className="flex items-center gap-2 truncate">
                            <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {activeSnapshot ? (
                                <span className="truncate font-semibold">
                                    {activeSnapshot.report_code} (v{activeSnapshot.version})
                                </span>
                            ) : (
                                <span className="truncate text-muted-foreground">● Live Calculation Mode</span>
                            )}
                        </div>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Search saved snapshots..." className="h-8 text-xs" />
                        <CommandList>
                            <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                                No saved snapshots found.
                            </CommandEmpty>
                            <CommandGroup heading="Modes & Saved Snapshots">
                                {/* Live Mode Option */}
                                <CommandItem
                                    value="live-calculation-mode"
                                    onSelect={() => {
                                        onSelectSnapshot(null);
                                        setOpen(false);
                                    }}
                                    className="flex items-center justify-between text-xs"
                                >
                                    <div className="flex items-center gap-2">
                                        <Check
                                            className={cn("h-3.5 w-3.5", selectedId === null ? "opacity-100" : "opacity-0")}
                                        />
                                        <span className="font-semibold text-primary">● Live Calculation Mode</span>
                                    </div>
                                    <Badge variant="outline" className="text-[10px]">Real-time</Badge>
                                </CommandItem>

                                {/* Saved Snapshots */}
                                {snapshots.map((s) => (
                                    <CommandItem
                                        key={s.id}
                                        value={`${s.report_code} v${s.version} ${s.status}`}
                                        onSelect={() => {
                                            onSelectSnapshot(s.id);
                                            setOpen(false);
                                        }}
                                        className="flex items-center justify-between text-xs py-2"
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <Check
                                                className={cn("h-3.5 w-3.5", selectedId === s.id ? "opacity-100" : "opacity-0")}
                                            />
                                            <div className="flex flex-col truncate">
                                                <span className="font-medium truncate">
                                                    {s.report_code} <span className="text-muted-foreground">v{s.version}</span>
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {s.cutoff_date_from} → {s.cutoff_date_to}
                                                </span>
                                            </div>
                                        </div>
                                        <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", getBadgeStyle(s.status))}>
                                            {s.status}
                                        </Badge>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {/* Quick Preview Icon Button */}
            {activeSnapshot && (
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title="Preview snapshot metadata"
                    onClick={() => onPreviewSnapshot(activeSnapshot)}
                >
                    <Eye className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}
