"use client";

import React, { useState } from "react";
import { Check, ChevronsUpDown, FolderKanban, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
 
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
    CommandSeparator,
} from "@/components/ui/command";
import { ProjectStatus } from "../../types";

interface ProjectItem {
    id: string;
    rfqTitle: string;
    rfqReference: string;
    status: ProjectStatus;
    roundNo: number;
    updatedAt?: string;
}

interface ProjectSelectComboboxProps {
    projects: ProjectItem[];
    currentProjectId?: string;
    onSelectProject: (projectId: string) => void;
    onOpenNewProjectDialog?: () => void;
    placeholder?: string;
    className?: string;
    triggerClassName?: string;
    popoverWidth?: string;
    disabled?: boolean;
    isLoading?: boolean;
}

export const ProjectSelectCombobox: React.FC<ProjectSelectComboboxProps> = ({
    projects,
    currentProjectId,
    onSelectProject,
    onOpenNewProjectDialog,
    placeholder = "Select an RFQ Project...",
    className,
    triggerClassName,
    popoverWidth = "w-[360px] sm:w-[420px]",
    disabled = false,
    isLoading = false,
}) => {
    const [open, setOpen] = useState(false);

    const selectedProject = projects.find((p) => p.id === currentProjectId);

    const getStatusBadge = (status: ProjectStatus) => {
        const variants: Record<string, string> = {
            Draft: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300",
            Awarded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300",
            Approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300",
            Submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300",
            Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300",
        };
        const colorClass = variants[status] || variants.Draft;
        return (
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono border font-medium shrink-0", colorClass)}>
                {status}
            </span>
        );
    };

    return (
        <div className={cn("inline-flex items-center", className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled || isLoading}
                        className={cn(
                            "h-8 gap-2 justify-between text-xs font-semibold max-w-[280px] sm:max-w-[360px]",
                            !selectedProject && "text-muted-foreground",
                            triggerClassName
                        )}
                    >
                        <div className="flex items-center gap-2 truncate">
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                            ) : (
                                <FolderKanban className="h-4 w-4 text-primary shrink-0" />
                            )}
                            <span className="truncate">
                                {isLoading
                                    ? "Loading project..."
                                    : (selectedProject ? selectedProject.rfqTitle : placeholder)}
                            </span>
                        </div>
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className={cn("p-0 shadow-lg", popoverWidth)} align="start">
                    <Command
                        filter={(value, search) => {
                            if (!search) return 1;
                            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                        }}
                    >
                        <CommandInput
                            placeholder="Search by title or reference..."
                            className="h-9 text-xs"
                        />
                        <CommandList className="max-h-72 overflow-y-auto">
                            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                                No matching RFQ projects found.
                            </CommandEmpty>
                            <CommandGroup heading={`RFQ Projects (${projects.length})`}>
                                {projects.map((p) => {
                                    const isSelected = p.id === currentProjectId;
                                    // Search value includes title, reference, and id
                                    const searchableValue = `${p.rfqTitle} ${p.rfqReference} ${p.status} round ${p.roundNo}`;

                                    return (
                                        <CommandItem
                                            key={p.id}
                                            value={searchableValue}
                                            onSelect={() => {
                                                onSelectProject(p.id);
                                                setOpen(false);
                                            }}
                                            className="flex items-center justify-between py-2 px-2.5 cursor-pointer text-xs"
                                        >
                                            <div className="flex items-start gap-2 min-w-0 pr-2">
                                                <Check
                                                    className={cn(
                                                        "h-3.5 w-3.5 mt-0.5 text-primary shrink-0",
                                                        isSelected ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <div className="flex flex-col min-w-0">
                                                    <span className={cn("truncate font-medium", isSelected && "text-primary font-semibold")}>
                                                        {p.rfqTitle}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground truncate">
                                                        {p.rfqReference} {p.roundNo > 1 ? `· Round ${p.roundNo}` : ""}
                                                    </span>
                                                </div>
                                            </div>
                                            {getStatusBadge(p.status)}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                            {onOpenNewProjectDialog && (
                                <>
                                    <CommandSeparator />
                                    <div className="p-1.5">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-start text-xs h-8 gap-2 font-medium text-primary hover:text-primary"
                                            onClick={() => {
                                                setOpen(false);
                                                onOpenNewProjectDialog();
                                            }}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Create New RFQ Project
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
};
