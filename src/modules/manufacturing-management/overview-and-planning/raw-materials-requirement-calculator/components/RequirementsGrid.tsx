"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
    Search,
    Download,
    Copy,
    Check,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Box,
    Layers,
} from "lucide-react";
import { ComponentRequirementRow } from "../types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RequirementsGridProps {
    components: ComponentRequirementRow[];
    finishedGoodName: string;
    targetQuantity: number;
    targetUom: string;
    branchName: string;
}

export const RequirementsGrid: React.FC<RequirementsGridProps> = ({
    components,
    finishedGoodName,
    targetQuantity,
    targetUom,
    branchName,
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [materialFilter, setMaterialFilter] = useState<"ALL" | "RAW_MATERIALS" | "PACKAGING">("ALL");
    const [statusFilter, setStatusFilter] = useState<"ALL" | "SHORTAGE_ONLY" | "SUFFICIENT_ONLY">("ALL");
    const [isCopied, setIsCopied] = useState(false);

    const [isCopying, setIsCopying] = useState(false);
    const [copyStatus, setCopyStatus] = useState("");
    const [manualSummary, setManualSummary] = useState<string | null>(null);
    const copyButton = useRef<HTMLButtonElement>(null);
    const copyText = useRef<HTMLTextAreaElement>(null);
    const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const copying = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; if (copyTimer.current) clearTimeout(copyTimer.current); };
    }, []);

    // Filter components
    const filteredComponents = useMemo(() => {
        return components.filter((item) => {
            const matchesSearch =
                item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.operationName.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesMaterial =
                materialFilter === "ALL" || item.materialType === materialFilter;

            const matchesStatus =
                statusFilter === "ALL" ||
                (statusFilter === "SHORTAGE_ONLY" && item.shortageQuantity > 0) ||
                (statusFilter === "SUFFICIENT_ONLY" && item.shortageQuantity === 0);

            return matchesSearch && matchesMaterial && matchesStatus;
        });
    }, [components, searchQuery, materialFilter, statusFilter]);

    // Copy Shortage Summary to Clipboard
    const handleCopySummary = async () => {
        if (copying.current) return;
        const shortages = components.filter((c) => c.shortageQuantity > 0);
        if (shortages.length === 0) {
            setCopyStatus("No shortages found to copy.");
            toast.info("No shortages found to copy!");
            return;
        }

        let text = `RAW MATERIAL REQUIREMENT ESTIMATE - SHORTAGE SUMMARY\n`;
        text += `Finished Good: ${finishedGoodName}\n`;
        text += `Target Quantity: ${targetQuantity} ${targetUom}\n`;
        text += `Facility / Branch: ${branchName}\n`;
        text += `Timestamp: ${new Date().toLocaleString()}\n\n`;
        text += `Shortage Items:\n`;

        shortages.forEach((s, idx) => {
            text += `${idx + 1}. [${s.productCode}] ${s.productName}\n`;
            text += `   - Type: ${s.materialType === "RAW_MATERIALS" ? "Raw Material" : "Packaging"}\n`;
            text += `   - Required: ${s.requiredQuantity.toLocaleString()} ${s.unitShortcut}\n`;
            text += `   - Available: ${s.availableQuantity.toLocaleString()} ${s.unitShortcut}\n`;
            text += `   - Shortage: ${s.shortageQuantity.toLocaleString()} ${s.unitShortcut}\n\n`;
        });

        copying.current = true;
        setIsCopying(true);
        setIsCopied(false);
        setCopyStatus("Copying shortage summary...");
        if (copyTimer.current) clearTimeout(copyTimer.current);
        try {
            if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
            await navigator.clipboard.writeText(text);
            if (!mounted.current) return;
            setIsCopied(true);
            setCopyStatus("Shortage summary copied to clipboard.");
            toast.success("Shortage summary copied to clipboard!");
            copyTimer.current = setTimeout(() => setIsCopied(false), 2500);
        } catch {
            if (!mounted.current) return;
            setCopyStatus("Automatic copying failed. Copy the selected summary manually.");
            toast.error("Unable to copy automatically. Use the selected summary to copy manually.");
            setManualSummary(text);
        } finally {
            copying.current = false;
            if (mounted.current) setIsCopying(false);
        }
    };

    // Export CSV
    const handleExportCSV = () => {
        if (components.length === 0) return;

        const headers = [
            "Step Order",
            "Operation",
            "Material Type",
            "Product Code",
            "Material Name",
            "Batch Qty",
            "Wastage %",
            "Required Qty",
            "Available Stock",
            "Shortage Qty",
            "UOM",
            "Status",
        ];

        const rows = components.map((c) => [
            c.routeSequence,
            `"${c.operationName.replace(/"/g, '""')}"`,
            c.materialType,
            `"${c.productCode.replace(/"/g, '""')}"`,
            `"${c.productName.replace(/"/g, '""')}"`,
            c.quantityPerBatch,
            c.wastagePercentage,
            c.requiredQuantity,
            c.availableQuantity,
            c.shortageQuantity,
            c.unitShortcut,
            c.status,
        ]);

        const csvContent =
            "data:text/csv;charset=utf-8," +
            [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute(
            "download",
            `Material_Requirement_${finishedGoodName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Requirements export downloaded.");
    };

    return (
        <div className="bg-card border border-border/80 rounded-xl overflow-hidden shadow-xs transition-all">
            {/* Header Toolbar */}
            <div className="p-4 border-b border-border/70 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-muted/20">
                <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                        Component Breakdown & Stock Comparison
                    </h3>
                    <span className="text-xs text-muted-foreground ml-1">
                        ({filteredComponents.length} of {components.length} rows)
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search Input */}
                    <div className="relative min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter components..."
                            className="w-full h-8 pl-8 pr-3 rounded-lg border border-input bg-background text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>

                    {/* Material Type Filter */}
                    <select
                        value={materialFilter}
                        onChange={(e) => setMaterialFilter(e.target.value as "ALL" | "RAW_MATERIALS" | "PACKAGING")}
                        className="h-8 px-2.5 rounded-lg border border-input bg-background text-xs text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                    >
                        <option value="ALL">All Materials</option>
                        <option value="RAW_MATERIALS">Raw Materials Only</option>
                        <option value="PACKAGING">Packaging Only</option>
                    </select>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as "ALL" | "SHORTAGE_ONLY" | "SUFFICIENT_ONLY")}
                        className="h-8 px-2.5 rounded-lg border border-input bg-background text-xs text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="SHORTAGE_ONLY">Shortages Only</option>
                        <option value="SUFFICIENT_ONLY">Sufficient Only</option>
                    </select>

                    <div className="h-5 w-[1px] bg-border mx-1 hidden sm:block" />

                    {/* Copy Summary Button */}
                    <button
                        type="button"
                        ref={copyButton}
                        onClick={handleCopySummary}
                        disabled={isCopying}
                        aria-describedby="shortage-copy-scope"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground shadow-2xs transition-all cursor-pointer"
                        title="Copy shortage breakdown for Purchasing / Job Order Planning"
                    >
                        {isCopying ? <span>Copying...</span> : isCopied ? (
                            <>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                <span className="text-emerald-600 font-semibold">Copied</span>
                            </>
                        ) : (
                            <>
                                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Copy Shortages</span>
                            </>
                        )}
                    </button>

                    {/* Export CSV Button */}
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground shadow-2xs transition-all cursor-pointer"
                    >
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Export CSV</span>
                    </button>
                </div>
            </div>

            <p id="shortage-copy-scope" className="px-4 py-2 text-xs text-muted-foreground">Copies all shortages in this calculation; table filters do not narrow the summary.</p>
            <p role="status" aria-live="polite" className="sr-only">{copyStatus}</p>
            <Dialog open={manualSummary !== null} onOpenChange={open => { if (!open) setManualSummary(null); }}>
                <DialogContent onOpenAutoFocus={event => { event.preventDefault(); copyText.current?.focus(); copyText.current?.select(); }} onCloseAutoFocus={event => { event.preventDefault(); copyButton.current?.focus(); }}>
                    <DialogHeader>
                        <DialogTitle>Copy shortage summary</DialogTitle>
                        <DialogDescription id="manual-copy-hint">Automatic clipboard access failed or is unavailable. Copy the selected text using Ctrl+C (Windows) or Command+C (Mac), or your device Copy command.</DialogDescription>
                    </DialogHeader>
                    <label htmlFor="manual-shortage-summary" className="text-sm font-medium">Shortage summary</label>
                    <textarea id="manual-shortage-summary" ref={copyText} readOnly value={manualSummary ?? ""} aria-describedby="manual-copy-hint" className="h-72 w-full rounded-md border p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
                    <DialogFooter><Button variant="outline" onClick={() => setManualSummary(null)}>Close</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Table Container */}
            <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border/80 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="py-2.5 px-3 w-16">Step</th>
                            <th className="py-2.5 px-3">Operation</th>
                            <th className="py-2.5 px-3">Type</th>
                            <th className="py-2.5 px-3">Component / Item</th>
                            <th className="py-2.5 px-3 text-right">Recipe Qty</th>
                            <th className="py-2.5 px-3 text-right">Required Qty</th>
                            <th className="py-2.5 px-3 text-right">Available Stock</th>
                            <th className="py-2.5 px-3 text-right">Shortage</th>
                            <th className="py-2.5 px-3 w-20">UOM</th>
                            <th className="py-2.5 px-3 text-center w-28">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs">
                        {filteredComponents.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="py-12 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Box className="h-8 w-8 text-muted-foreground/40" />
                                        <p className="text-sm font-medium">No component materials match criteria.</p>
                                        <p className="text-xs text-muted-foreground">
                                            Try adjusting the search query or filter options.
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredComponents.map((item) => {
                                const isShort = item.shortageQuantity > 0;
                                return (
                                    <tr
                                        key={item.bomItemId}
                                        className={`transition-colors hover:bg-muted/30 ${
                                            isShort ? "bg-rose-500/[0.04] dark:bg-rose-950/[0.12]" : ""
                                        }`}
                                    >
                                        {/* Step Sequence */}
                                        <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                                            #{item.routeSequence}
                                        </td>

                                        {/* Operation */}
                                        <td className="py-2.5 px-3 font-medium text-foreground">
                                            {item.operationName}
                                        </td>

                                        {/* Material Type Badge */}
                                        <td className="py-2.5 px-3">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide ${
                                                    item.materialType === "RAW_MATERIALS"
                                                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                                                        : "bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20"
                                                }`}
                                            >
                                                {item.materialType === "RAW_MATERIALS" ? "Raw Material" : "Packaging"}
                                            </span>
                                        </td>

                                        {/* Component Code & Name */}
                                        <td className="py-2.5 px-3">
                                            <div className="font-semibold text-foreground">
                                                {item.productName}
                                            </div>
                                            <div className="font-mono text-[10px] text-muted-foreground">
                                                {item.productCode}
                                            </div>
                                        </td>

                                        {/* Recipe Quantity per batch */}
                                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                                            {item.quantityPerBatch.toLocaleString()}
                                            {item.wastagePercentage > 0 && (
                                                <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1">
                                                    (+{item.wastagePercentage}%)
                                                </span>
                                            )}
                                        </td>

                                        {/* Gross Required Quantity */}
                                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-foreground">
                                            {item.requiredQuantity.toLocaleString()}
                                        </td>

                                        {/* Available Inventory */}
                                        <td className="py-2.5 px-3 text-right font-mono text-foreground">
                                            {item.availableQuantity.toLocaleString()}
                                        </td>

                                        {/* Shortage Quantity */}
                                        <td
                                            className={`py-2.5 px-3 text-right font-mono font-bold ${
                                                isShort
                                                    ? "text-rose-600 dark:text-rose-400"
                                                    : "text-muted-foreground"
                                            }`}
                                        >
                                            {isShort ? item.shortageQuantity.toLocaleString() : "0"}
                                        </td>

                                        {/* Unit of Measurement */}
                                        <td className="py-2.5 px-3 font-medium text-muted-foreground">
                                            {item.unitShortcut}
                                        </td>

                                        {/* Status Badge */}
                                        <td className="py-2.5 px-3 text-center">
                                            {item.status === "Sufficient" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                                    <CheckCircle2 className="h-3 w-3" /> Sufficient
                                                </span>
                                            ) : item.status === "No Stock" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30">
                                                    <XCircle className="h-3 w-3" /> Zero Stock
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                                                    <AlertCircle className="h-3 w-3" /> Shortage
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
