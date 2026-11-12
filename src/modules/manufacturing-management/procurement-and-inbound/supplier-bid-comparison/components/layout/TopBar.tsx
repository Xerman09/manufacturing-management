"use client";

import React, { useState } from "react";
import {
    Plus,
    Copy,
    Trash2,
    FileSpreadsheet,
    FileText,
    Download,
    Upload,
    ChevronDown,
    FolderKanban,
    Printer,
    Save,
    Loader2,
    Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { exportRfqToExcel, exportRfqBidsToCsv, exportRfqComparisonToCsv } from "../../engine/excel-export";
import { StorageStatusPill } from "./StorageStatusPill";
import { toast } from "sonner";
import { getPhilippineTimestamp } from "../../utils/timestamp";
interface TopBarProps {
    onOpenImportModal: () => void;
    onTriggerPrint: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    onOpenImportModal,
    onTriggerPrint,
}) => {
    const {
        currentProject,
        projectsList,
        selectProject,
        createNewProject,
        duplicateProject,
        deleteProject,
        storageStatus,
        lastSavedTimestamp,
        isDirty,
        isSaving,
        saveProjectNow,
    } = useBidComparisonStore();

    // Dialog states
    const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
    const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const [newTitle, setNewTitle] = useState("");
    const [newRef, setNewRef] = useState("");
    const [dupTitle, setDupTitle] = useState("");

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) {
            toast.error("Project title is required");
            return;
        }
        createNewProject(newTitle.trim(), newRef.trim());
        setIsNewDialogOpen(false);
        setNewTitle("");
        setNewRef("");
    };

    const handleDuplicateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        duplicateProject(dupTitle.trim() || undefined);
        setIsDuplicateDialogOpen(false);
        setDupTitle("");
    };

    const handleDeleteConfirm = async () => {
        await deleteProject();
        setIsDeleteDialogOpen(false);
    };

    const statusBadge = () => {
        const status = currentProject?.status || "Draft";
        const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string; class: string }> = {
            Draft: { variant: "secondary", label: "Draft", class: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300" },
            Submitted: { variant: "default", label: "Submitted", class: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300" },
            Approved: { variant: "default", label: "Approved", class: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300" },
            Rejected: { variant: "destructive", label: "Rejected", class: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300" },
        };
        const s = variants[status] || variants.Draft;
        return (
            <Badge variant={s.variant} className={`text-xs px-2.5 py-0.5 border ${s.class}`}>
                {s.label}
            </Badge>
        );
    };

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 bg-card border-b rounded-t-xl shadow-xs print:hidden">
            {/* Left: Project Selector & Status */}
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-2 max-w-[280px] sm:max-w-[340px] justify-between">
                            <FolderKanban className="h-4 w-4 text-primary shrink-0" />
                            <span className="truncate font-semibold text-xs">
                                {currentProject?.rfqTitle || "Select Project..."}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[320px] max-h-72 overflow-y-auto">
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            RFQ Projects ({projectsList.length})
                        </div>
                        <DropdownMenuSeparator />
                        {projectsList.map((p) => (
                            <DropdownMenuItem
                                key={p.id}
                                onClick={() => selectProject(p.id)}
                                className="flex items-center justify-between py-2 cursor-pointer text-xs"
                            >
                                <div className="flex flex-col min-w-0 pr-2">
                                    <span className="font-medium truncate">{p.rfqTitle}</span>
                                    <span className="text-[10px] text-muted-foreground truncate">
                                        {p.rfqReference} {p.roundNo > 1 ? `· Round ${p.roundNo}` : ""}
                                    </span>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono shrink-0">
                                    {p.status}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {statusBadge()}

                <StorageStatusPill />

                {lastSavedTimestamp && (
                    <span className="text-[11px] text-muted-foreground hidden lg:inline-block">
                        Edited {lastSavedTimestamp}
                    </span>
                )}
            </div>

            {/* Right: Actions */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => {
                        setNewTitle("");
                        setNewRef("");
                        setIsNewDialogOpen(true);
                    }}
                >
                    <Plus className="h-3.5 w-3.5" />
                    New
                </Button>

                {currentProject && (
                    <>
                        <Button
                            variant={isDirty ? "default" : "outline"}
                            size="sm"
                            className={`h-8 text-xs gap-1.5 font-semibold transition-all ${
                                isDirty ? "bg-amber-600 hover:bg-amber-700 text-white shadow-xs" : ""
                            }`}
                            disabled={isSaving}
                            onClick={() => saveProjectNow()}
                            title="Save changes to database (Ctrl+S)"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                    <span>Saving...</span>
                                </>
                            ) : isDirty ? (
                                <>
                                    <Save className="h-3.5 w-3.5" />
                                    <span>Save (Ctrl+S)</span>
                                </>
                            ) : (
                                <>
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>Saved</span>
                                </>
                            )}
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => {
                                setDupTitle(`${currentProject.rfqTitle} - Round ${(currentProject.roundNo || 1) + 1}`);
                                setIsDuplicateDialogOpen(true);
                            }}
                        >
                            <Copy className="h-3.5 w-3.5" />
                            Duplicate
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={onOpenImportModal}
                        >
                            <Upload className="h-3.5 w-3.5" />
                            Import CSV/Excel
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                                    <Download className="h-3.5 w-3.5" />
                                    Export
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem
                                    onClick={() => exportRfqToExcel(currentProject)}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                                    Excel Workbook (.xlsx)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => exportRfqBidsToCsv(currentProject)}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <FileText className="h-4 w-4 text-blue-600" />
                                    Bids &amp; Quotations (.csv)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => exportRfqComparisonToCsv(currentProject)}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <FileText className="h-4 w-4 text-slate-500" />
                                    Comparison Summary (.csv)
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={onTriggerPrint}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <Printer className="h-4 w-4 text-slate-600" />
                                    Printable Abstract (A4)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => setIsDeleteDialogOpen(true)}
                            title="Delete project"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </>
                )}
            </div>

            {/* Create Project Dialog */}
            <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <form onSubmit={handleCreateSubmit}>
                        <DialogHeader>
                            <DialogTitle>Create New RFQ Project</DialogTitle>
                            <DialogDescription>
                                Set up a new supplier bid comparison round.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-3 py-4 text-xs">
                            <div className="space-y-1">
                                <Label htmlFor="new-title">Project / RFQ Title</Label>
                                <Input
                                    id="new-title"
                                    placeholder="e.g. Warehouse LED Retrofit"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="h-8 text-xs"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="new-ref">Reference Number</Label>
                                <Input
                                    id="new-ref"
                                    placeholder="e.g. RFQ-2026-118"
                                    value={newRef}
                                    onChange={(e) => setNewRef(e.target.value)}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" size="sm" onClick={() => setIsNewDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" size="sm">
                                Create Project
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Duplicate Dialog */}
            <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <form onSubmit={handleDuplicateSubmit}>
                        <DialogHeader>
                            <DialogTitle>Duplicate Project for Re-bid</DialogTitle>
                            <DialogDescription>
                                Copies items, suppliers, prices, and settings into a new round. Awards and approvals are reset.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Label htmlFor="dup-title">New Round Title</Label>
                            <Input
                                id="dup-title"
                                value={dupTitle}
                                onChange={(e) => setDupTitle(e.target.value)}
                                className="h-8 text-xs mt-1"
                                autoFocus
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" size="sm" onClick={() => setIsDuplicateDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" size="sm">
                                Duplicate Round
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2">
                            <Trash2 className="h-4 w-4" />
                            Delete Project?
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete &ldquo;{currentProject?.rfqTitle}&rdquo;?
                            This action will soft-delete the project.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setIsDeleteDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
