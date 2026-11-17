"use client";

import React from "react";
import { FolderKanban, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
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

interface SelectProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: ProjectItem[];
    currentProjectId?: string;
    onSelectProject: (projectId: string) => void;
    onOpenNewProjectDialog: () => void;
    allowDismiss?: boolean;
}

export const SelectProjectModal: React.FC<SelectProjectModalProps> = ({
    isOpen,
    onClose,
    projects,
    currentProjectId,
    onSelectProject,
    onOpenNewProjectDialog,
    allowDismiss = true,
}) => {
    const getStatusClass = (status: ProjectStatus) => {
        const variants: Record<string, string> = {
            Draft: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300",
            Submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300",
            Approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300",
            Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300",
        };
        return variants[status] || variants.Draft;
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(openState) => {
                // If dismiss is allowed or user already has an active project, allow closing
                if (allowDismiss || currentProjectId) {
                    if (!openState) onClose();
                }
            }}
        >
            <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-4 pb-2.5 border-b bg-card">
                    <DialogTitle className="text-base font-semibold flex items-center gap-2">
                        <FolderKanban className="h-5 w-5 text-primary shrink-0" />
                        Select RFQ Project
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Select an existing RFQ project to evaluate supplier bids, or create a new one.
                    </DialogDescription>
                </DialogHeader>

                <Command
                    filter={(value, search) => {
                        if (!search) return 1;
                        return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                    }}
                    className="border-0"
                >
                    <CommandInput
                        placeholder="Search by project title or RFQ reference..."
                        className="text-xs h-10"
                        autoFocus
                    />
                    <CommandList className="max-h-80 p-2 overflow-y-auto">
                        <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
                            No RFQ projects found matching your search.
                        </CommandEmpty>
                        <CommandGroup heading={`Available RFQ Projects (${projects.length})`}>
                            {projects.map((p) => {
                                const isSelected = p.id === currentProjectId;
                                const searchable = `${p.rfqTitle} ${p.rfqReference} ${p.status} round ${p.roundNo}`;

                                return (
                                    <CommandItem
                                        key={p.id}
                                        value={searchable}
                                        onSelect={() => {
                                            onSelectProject(p.id);
                                            onClose();
                                        }}
                                        className={cn(
                                            "flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-xs mb-1 transition-colors",
                                            isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                                        )}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                            {isSelected && (
                                                <Check className="h-4 w-4 text-primary shrink-0" />
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <span className={cn("font-medium text-sm truncate", isSelected && "text-primary font-semibold")}>
                                                    {p.rfqTitle}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground truncate">
                                                    {p.rfqReference} {p.roundNo > 1 ? `· Round ${p.roundNo}` : ""}
                                                </span>
                                            </div>
                                        </div>
                                        <span className={cn("text-[10px] px-2 py-0.5 rounded font-mono border font-medium shrink-0", getStatusClass(p.status))}>
                                            {p.status}
                                        </span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>

                    <div className="p-3 border-t bg-muted/40 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                            Can&apos;t find your project?
                        </span>
                        <Button
                            size="sm"
                            className="text-xs h-8 gap-1.5"
                            onClick={() => {
                                onClose();
                                onOpenNewProjectDialog();
                            }}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Create New RFQ
                        </Button>
                    </div>
                </Command>
            </DialogContent>
        </Dialog>
    );
};
