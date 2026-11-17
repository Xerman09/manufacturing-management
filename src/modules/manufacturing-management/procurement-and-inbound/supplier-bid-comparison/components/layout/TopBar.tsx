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
 
    Printer,
    Save,
    Loader2,
    Check,
    ArrowLeft,
    AlertCircle,
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
import {
    exportRfqToExcel,
    exportRfqBidsToCsv,
    exportRfqComparisonToCsv,
    exportRfqQualityToCsv,
    exportFullProjectTemplate,
} from "../../engine/excel-export";
import { StorageStatusPill } from "./StorageStatusPill";
import { ProjectSelectCombobox } from "../shared/ProjectSelectCombobox";
import { toast } from "sonner";
 
interface TopBarProps {
    onOpenImportModal: () => void;
    onOpenExportModal?: () => void;
    onTriggerPrint: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    onOpenImportModal,
    onOpenExportModal,
    onTriggerPrint,
}) => {
    const {
        currentProject,
        projectsList,
        selectProject,
        clearCurrentProject,
        createNewProject,
        duplicateProject,
        deleteProject,
 
        lastSavedTimestamp,
        isDirty,
        isSaving,
        saveProjectNow,
        isLoadingProject,
    } = useBidComparisonStore();

    // Dialog states
    const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
    const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [newTitle, setNewTitle] = useState("");
    const [newRef, setNewRef] = useState("");
    const [dupTitle, setDupTitle] = useState("");

    const isNewRefDuplicate = React.useMemo(() => {
        if (!newRef.trim()) return false;
        const ref = newRef.trim().toLowerCase();
        return projectsList.some(
            (p) => p.rfqReference?.trim().toLowerCase() === ref && (p.roundNo || 1) === 1
        );
    }, [newRef, projectsList]);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) {
            toast.error("Project title is required");
            return;
        }
        if (isNewRefDuplicate) {
            toast.error(`Reference number "${newRef.trim()}" is already in use. Please enter a unique reference.`);
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
        setIsDeleting(true);
        try {
            const success = await deleteProject();
            if (success) {
                setIsDeleteDialogOpen(false);
            }
        } finally {
            setIsDeleting(false);
        }
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
            <div className="flex flex-wrap items-center gap-2 min-w-0">
                {currentProject && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearCurrentProject();
                        }}
                        className="h-8 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground font-medium"
                        title="Return to RFQ Directory"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">All RFQs</span>
                    </Button>
                )}

                <ProjectSelectCombobox
                    projects={projectsList}
                    currentProjectId={currentProject?.id}
                    isLoading={isLoadingProject}
                    onSelectProject={(id) => selectProject(id)}
                    onOpenNewProjectDialog={() => {
                        setNewTitle("");
                        setNewRef("");
                        setIsNewDialogOpen(true);
                    }}
                />

                {currentProject && (
                    <>
                        {statusBadge()}
                        <StorageStatusPill />
                        {lastSavedTimestamp && (
                            <span className="text-[11px] text-muted-foreground hidden lg:inline-block">
                                Edited {lastSavedTimestamp}
                            </span>
                        )}
                    </>
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

                {!currentProject && onOpenImportModal && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={onOpenImportModal}
                        title="Import RFQ Project from Excel or JSON Backup"
                    >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Import</span>
                    </Button>
                )}

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
                            <DropdownMenuContent align="end" className="w-64">
                                {onOpenExportModal && (
                                    <>
                                        <DropdownMenuItem
                                            onClick={onOpenExportModal}
                                            className="cursor-pointer text-xs gap-2 font-semibold text-primary focus:text-primary py-2"
                                        >
                                            <Download className="h-4 w-4 text-primary" />
                                            <div className="flex flex-col">
                                                <span>Dynamic Export Modal...</span>
                                                <span className="text-[10px] text-muted-foreground font-normal">Choose format, suppliers, items &amp; sections</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                    </>
                                )}
                                <DropdownMenuItem
                                    onClick={() => exportRfqToExcel(currentProject)}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                                    Full Project Excel (.xlsx)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => exportFullProjectTemplate(currentProject || undefined)}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <FileSpreadsheet className="h-4 w-4 text-teal-600" />
                                    Full Project Template (.xlsx)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => exportRfqBidsToCsv(currentProject)}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <FileText className="h-4 w-4 text-blue-600" />
                                    Quick Bids Dataset (.csv)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => exportRfqComparisonToCsv(currentProject)}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <FileText className="h-4 w-4 text-slate-500" />
                                    Quick Comparison Matrix (.csv)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => exportRfqQualityToCsv(currentProject)}
                                    className="cursor-pointer text-xs gap-2"
                                >
                                    <FileSpreadsheet className="h-4 w-4 text-amber-600" />
                                    Quick Quality Matrix (.csv)
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
                                Set up a new supplier comparison round.
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
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="new-ref" className={isNewRefDuplicate ? "text-destructive" : ""}>
                                        Reference Number
                                    </Label>
                                    {isNewRefDuplicate && (
                                        <span className="text-[10px] text-destructive font-semibold">Already taken</span>
                                    )}
                                </div>
                                <Input
                                    id="new-ref"
                                    placeholder="e.g. RFQ-2026-118"
                                    value={newRef}
                                    onChange={(e) => setNewRef(e.target.value)}
                                    className={`h-8 text-xs font-mono transition-colors ${
                                        isNewRefDuplicate
                                            ? "border-destructive text-destructive focus-visible:ring-destructive bg-destructive/5"
                                            : ""
                                    }`}
                                />
                                {isNewRefDuplicate && (
                                    <p className="text-[11px] text-destructive font-medium flex items-center gap-1.5 pt-0.5 animate-in fade-in duration-150">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                        <span>Reference is already used by another project. Please enter a unique reference.</span>
                                    </p>
                                )}
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
            <Dialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    if (!isDeleting) setIsDeleteDialogOpen(open);
                }}
            >
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2 text-base">
                            <Trash2 className="h-5 w-5" />
                            Delete Project Confirmation
                        </DialogTitle>
                        <DialogDescription className="text-xs pt-1.5 leading-relaxed">
                            Are you sure you want to soft-delete <strong className="text-foreground font-semibold">&ldquo;{currentProject?.rfqTitle || "this project"}&rdquo;</strong>?
                            <br />
                            <span className="text-muted-foreground block mt-1">
                                This will archive the RFQ and its associated bids. Active records will be marked as deleted and can be restored if necessary.
                            </span>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2 mt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isDeleting}
                            onClick={() => setIsDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={isDeleting}
                            onClick={handleDeleteConfirm}
                            className="gap-1.5"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete Project
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
