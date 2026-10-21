// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/components/TrackingFilterBar.tsx

import React, { useState } from "react";
import {
    Building2,
    Check,
    ChevronDown,
    Search,
    Layers,
    RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { BranchOption } from "../types";

interface TrackingFilterBarProps {
    branches: BranchOption[];
    selectedBranchId: number | string;
    onSelectBranch: (id: number | string) => void;
    search: string;
    onSearchChange: (val: string) => void;
    stage: string;
    onStageChange: (val: string) => void;
}

const STAGE_OPTIONS = [
    { label: "All Stages", value: "All" },
    { label: "Awaiting Allocation", value: "Awaiting Allocation" },
    { label: "Ready for Picking", value: "Ready for Picking" },
    { label: "In Picking", value: "In Picking" },
    { label: "Fully Picked", value: "Fully Picked" },
];

export const TrackingFilterBar: React.FC<TrackingFilterBarProps> = ({
    branches,
    selectedBranchId,
    onSelectBranch,
    search,
    onSearchChange,
    stage,
    onStageChange,
}) => {
    const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
    const [stagePopoverOpen, setStagePopoverOpen] = useState(false);

    const activeBranch = branches.find((b) => b.id === Number(selectedBranchId));
    const activeBranchLabel =
        selectedBranchId === "All" || !selectedBranchId || selectedBranchId === "default"
            ? "All Branches"
            : activeBranch
            ? activeBranch.branch_name
            : "All Branches";

    const activeStageLabel =
        STAGE_OPTIONS.find((o) => o.value === stage)?.label ||
        (stage === "All" ? "All Stages" : stage);

    const hasActiveFilters =
        selectedBranchId !== "All" ||
        Boolean(search) ||
        stage !== "All";

    const handleResetFilters = () => {
        onSelectBranch("All");
        onSearchChange("");
        onStageChange("All");
    };

    return (
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 bg-card border rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                {/* 1. Branch Combobox (Shadcn Popover + Command) */}
                <Popover open={branchPopoverOpen} onOpenChange={setBranchPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={branchPopoverOpen}
                            title={`Filter orders by branch (currently: ${activeBranchLabel})`}
                            className="h-9 px-3 text-xs font-semibold justify-between rounded-xl border bg-background hover:bg-muted w-full sm:w-[220px]"
                        >
                            <span className="flex items-center gap-2 truncate">
                                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="truncate">{activeBranchLabel}</span>
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[230px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search branch..." className="h-9 text-xs" />
                            <CommandList>
                                <CommandEmpty className="text-xs p-2 text-muted-foreground text-center">
                                    No branch found.
                                </CommandEmpty>
                                <CommandGroup>
                                    <CommandItem
                                        value="all branches"
                                        onSelect={() => {
                                            onSelectBranch("All");
                                            setBranchPopoverOpen(false);
                                        }}
                                        className="text-xs font-medium cursor-pointer"
                                    >
                                        <Check
                                            className={`mr-2 h-3.5 w-3.5 ${
                                                selectedBranchId === "All" ? "opacity-100" : "opacity-0"
                                            }`}
                                        />
                                        <span>All Branches</span>
                                    </CommandItem>
                                    {branches.map((b) => (
                                        <CommandItem
                                            key={b.id}
                                            value={b.branch_name}
                                            onSelect={() => {
                                                onSelectBranch(b.id);
                                                setBranchPopoverOpen(false);
                                            }}
                                            className="text-xs font-medium cursor-pointer"
                                        >
                                            <Check
                                                className={`mr-2 h-3.5 w-3.5 ${
                                                    Number(selectedBranchId) === b.id ? "opacity-100" : "opacity-0"
                                                }`}
                                            />
                                            <span className="truncate">{b.branch_name}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>

                {/* 2. Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Search Order #, PO Ref, Customer..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        title="Search by Sales Order number, Customer PO, Customer name, or Customer code"
                        className="h-9 pl-9 pr-3 rounded-xl text-xs bg-background"
                    />
                </div>

                {/* 3. Fulfillment Stage Combobox (Searchable Dropdown) */}
                <Popover open={stagePopoverOpen} onOpenChange={setStagePopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={stagePopoverOpen}
                            title={`Filter orders by fulfillment stage (currently: ${activeStageLabel})`}
                            className={`h-9 px-3 text-xs font-semibold justify-between rounded-xl border bg-background hover:bg-muted w-full sm:w-[220px] ${
                                stage !== "All" ? "border-primary/50 text-primary bg-primary/5" : ""
                            }`}
                        >
                            <span className="flex items-center gap-2 truncate">
                                <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="truncate">Stage: {activeStageLabel.replace("All Stages", "All")}</span>
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[230px] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search stage..." className="h-9 text-xs" />
                            <CommandList>
                                <CommandEmpty className="text-xs p-2 text-muted-foreground text-center">
                                    No stage found.
                                </CommandEmpty>
                                <CommandGroup>
                                    {STAGE_OPTIONS.map((opt) => (
                                        <CommandItem
                                            key={opt.value}
                                            value={opt.label}
                                            onSelect={() => {
                                                onStageChange(opt.value);
                                                setStagePopoverOpen(false);
                                            }}
                                            className="text-xs font-medium cursor-pointer"
                                        >
                                            <Check
                                                className={`mr-2 h-3.5 w-3.5 ${
                                                    stage === opt.value ? "opacity-100" : "opacity-0"
                                                }`}
                                            />
                                            <span>{opt.label}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>

            {/* Reset Filters Button (Active when any filter is set) */}
            {hasActiveFilters && (
                <div className="flex items-center">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetFilters}
                        title="Reset branch, search, and stage filters back to default"
                        className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-xl"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Filters</span>
                    </Button>
                </div>
            )}
        </div>
    );
};
