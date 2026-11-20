"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    Boxes,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Factory,
    FileText,
    Package,
    Search
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EvidenceRecord } from "../types";

export interface EvidenceModalContext {
    title: string;
    subtitle: string;
    formulaNote?: string;
    evidenceIds: string[];
    totalEvidenceCount?: number;
}

interface EvidenceDrilldownModalProps {
    open: boolean;
    context: EvidenceModalContext | null;
    evidenceRegistry: Record<string, EvidenceRecord>;
    onClose: () => void;
}

interface EvidenceModalBodyProps {
    context: EvidenceModalContext;
    evidenceRegistry: Record<string, EvidenceRecord>;
}

const EvidenceModalBody: React.FC<EvidenceModalBodyProps> = ({
    context,
    evidenceRegistry
}) => {
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);

    const resolvedRecords = useMemo(() => {
        const unique = Array.from(new Set(context.evidenceIds));
        return unique
            .map((id) => evidenceRegistry[id])
            .filter((item): item is EvidenceRecord => {
                if (!item) return false;
                // Strictly do not show batches with quantity equal to 0
                if (item.type === "inventory_lot") {
                    const qLabel = item.quantityLabel?.trim() || "";
                    if (
                        qLabel.startsWith("0 ") ||
                        qLabel.startsWith("0.0 ") ||
                        qLabel === "0" ||
                        !/^[1-9][0-9,]*(?:\.[0-9]+)?\s+/.test(qLabel)
                    ) {
                        return false;
                    }
                }
                return true;
            });
    }, [context.evidenceIds, evidenceRegistry]);

    const filteredRecords = useMemo(() => {
        const q = search.trim().toLowerCase();
        return resolvedRecords.filter((rec) => {
            if (typeFilter !== "all" && rec.type !== typeFilter) return false;
            if (!q) return true;
            return (
                rec.reference.toLowerCase().includes(q) ||
                rec.title.toLowerCase().includes(q) ||
                rec.subtitle.toLowerCase().includes(q) ||
                rec.status.toLowerCase().includes(q)
            );
        });
    }, [resolvedRecords, search, typeFilter]);

    const totalRecords = filteredRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRecords);

    const paginatedRecords = useMemo(() => {
        return filteredRecords.slice(startIndex, endIndex);
    }, [filteredRecords, startIndex, endIndex]);

    const visiblePageNumbers = useMemo(() => {
        if (totalPages <= 5) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        if (safePage <= 3) {
            return [1, 2, 3, 4, "ellipsis-end", totalPages] as const;
        }
        if (safePage >= totalPages - 2) {
            return [
                1,
                "ellipsis-start",
                totalPages - 3,
                totalPages - 2,
                totalPages - 1,
                totalPages
            ] as const;
        }
        return [
            1,
            "ellipsis-start",
            safePage - 1,
            safePage,
            safePage + 1,
            "ellipsis-end",
            totalPages
        ] as const;
    }, [totalPages, safePage]);

    const typeCounts = useMemo(() => {
        const counts: Record<string, number> = { all: resolvedRecords.length };
        resolvedRecords.forEach((r) => {
            counts[r.type] = (counts[r.type] || 0) + 1;
        });
        return counts;
    }, [resolvedRecords]);

    const totalLinked = Math.max(
        resolvedRecords.length,
        context.totalEvidenceCount ?? resolvedRecords.length
    );

    const getTypeMeta = (type: EvidenceRecord["type"]) => {
        switch (type) {
            case "sales_order":
                return { label: "Sales Order", icon: FileText, color: "text-sky-600 dark:text-sky-400" };
            case "job_order":
                return { label: "Job Order", icon: Factory, color: "text-indigo-600 dark:text-indigo-400" };
            case "inventory_lot":
                return { label: "Batch Lot", icon: Boxes, color: "text-amber-600 dark:text-amber-400" };
            case "bom_labor":
                return { label: "BOM & Labor", icon: Package, color: "text-emerald-600 dark:text-emerald-400" };
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="p-4 space-y-3"
        >
            {/* Honest record coverage indicator when evidence is sampled */}
            {totalLinked > resolvedRecords.length && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                    Showing top <span className="font-bold">{resolvedRecords.length}</span> of{" "}
                    <span className="font-bold">{totalLinked.toLocaleString()}</span> linked records for this scope.
                </div>
            )}

            {/* Search & Source Type Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    {(
                        [
                            { key: "all", label: "All" },
                            { key: "sales_order", label: "Sales Orders" },
                            { key: "job_order", label: "Job Orders" },
                            { key: "inventory_lot", label: "Batch Lots" },
                            { key: "bom_labor", label: "BOM Labor" }
                        ] as const
                    )
                        .filter((t) => t.key === "all" || (typeCounts[t.key] || 0) > 0)
                        .map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => {
                                    setTypeFilter(t.key);
                                    setPage(1);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                                    typeFilter === t.key
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {t.label} ({typeCounts[t.key] || 0})
                            </button>
                        ))}
                </div>
                <div className="relative w-[260px]">
                    <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search reference..."
                        className="h-8 pl-8 text-xs"
                    />
                </div>
            </div>

            {/* Evidence List */}
            <ScrollArea className="h-[460px] pr-2">
                {paginatedRecords.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground rounded-xl border border-dashed">
                        No linked records match this search.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {paginatedRecords.map((rec, idx) => {
                            const meta = getTypeMeta(rec.type);
                            const Icon = meta.icon;
                            return (
                                <motion.div
                                    key={rec.id}
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.14, delay: Math.min(idx * 0.015, 0.2) }}
                                    className="rounded-xl border border-border/60 bg-card hover:bg-accent/35 p-3 flex items-center justify-between gap-3 transition-colors"
                                >
                                    <div className="flex items-start gap-2.5 min-w-0">
                                        <div className="mt-0.5 rounded-lg bg-muted p-1.5 shrink-0">
                                            <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-bold text-foreground">
                                                    {rec.reference}
                                                </span>
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                    {meta.label}
                                                </Badge>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {rec.date}
                                                </span>
                                            </div>
                                            <div className="text-xs font-medium text-foreground/90 truncate mt-0.5">
                                                {rec.title}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground truncate">
                                                {rec.subtitle}
                                                {rec.meta ? ` · ${rec.meta}` : ""}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 space-y-1">
                                        <div
                                            className={`text-xs font-bold tabular-nums ${
                                                rec.status === "EXPIRED" || rec.status === "DAMAGED"
                                                    ? "text-rose-600 dark:text-rose-400"
                                                    : rec.status === "EXPIRING SOON" ||
                                                      rec.status === "QUARANTINED" ||
                                                      rec.status === "HOLD"
                                                    ? "text-amber-600 dark:text-amber-400"
                                                    : "text-foreground"
                                            }`}
                                        >
                                            {rec.quantityLabel}
                                        </div>
                                        <Badge
                                            variant="secondary"
                                            className={`text-[10px] px-1.5 py-0 ${
                                                rec.status === "EXPIRED" || rec.status === "DAMAGED"
                                                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                                    : rec.status === "EXPIRING SOON" ||
                                                      rec.status === "QUARANTINED" ||
                                                      rec.status === "HOLD"
                                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                                    : rec.status === "GOOD"
                                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                                    : ""
                                            }`}
                                        >
                                            {rec.status}
                                        </Badge>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>

            {/* Pagination Controls */}
            {totalRecords > 0 && (
                <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground select-none">
                    <div className="flex items-center gap-3">
                        <span>
                            Showing{" "}
                            <span className="font-semibold text-foreground">
                                {startIndex + 1}
                            </span>
                            –
                            <span className="font-semibold text-foreground">
                                {endIndex}
                            </span>{" "}
                            of{" "}
                            <span className="font-semibold text-foreground">
                                {totalRecords}
                            </span>{" "}
                            record{totalRecords === 1 ? "" : "s"}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span>Rows:</span>
                            <select
                                aria-label="Records per page"
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="h-7 rounded-lg border border-border/70 bg-background px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                            >
                                {[10, 20, 50].map((sz) => (
                                    <option key={sz} value={sz}>
                                        {sz}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center gap-1 self-end sm:self-auto">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setPage(1)}
                                disabled={safePage <= 1}
                                aria-label="First page"
                                className="h-7 w-7 rounded-lg"
                            >
                                <ChevronsLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setPage(Math.max(1, safePage - 1))}
                                disabled={safePage <= 1}
                                aria-label="Previous page"
                                className="h-7 w-7 rounded-lg"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>

                            <div className="flex items-center gap-1 px-1">
                                {visiblePageNumbers.map((item) =>
                                    typeof item === "string" ? (
                                        <span
                                            key={item}
                                            className="px-1.5 text-muted-foreground select-none"
                                        >
                                            …
                                        </span>
                                    ) : (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => setPage(item)}
                                            aria-current={safePage === item ? "page" : undefined}
                                            className={`h-7 min-w-7 px-2 rounded-lg text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                                                safePage === item
                                                    ? "bg-primary text-primary-foreground shadow-xs"
                                                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                            }`}
                                        >
                                            {item}
                                        </button>
                                    )
                                )}
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                                disabled={safePage >= totalPages}
                                aria-label="Next page"
                                className="h-7 w-7 rounded-lg"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setPage(totalPages)}
                                disabled={safePage >= totalPages}
                                aria-label="Last page"
                                className="h-7 w-7 rounded-lg"
                            >
                                <ChevronsRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};

export const EvidenceDrilldownModal: React.FC<EvidenceDrilldownModalProps> = ({
    open,
    context,
    evidenceRegistry,
    onClose
}) => {
    const bodyKey = context
        ? `${context.title}|${context.evidenceIds.length}|${context.totalEvidenceCount ?? 0}`
        : "empty";

    const resolvedCount = context
        ? Array.from(new Set(context.evidenceIds)).filter((id) => Boolean(evidenceRegistry[id])).length
        : 0;
    const totalCount = Math.max(resolvedCount, context?.totalEvidenceCount ?? resolvedCount);

    return (
        <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
            <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-6xl xl:max-w-7xl rounded-2xl p-0 overflow-hidden gap-0">
                <DialogHeader className="px-5 pt-5 pb-3.5 border-b border-border/60 bg-muted/25">
                    <div className="flex items-start justify-between gap-3 pr-6">
                        <div>
                            <DialogTitle className="text-base font-bold text-foreground">
                                {context?.title || "Supporting Records"}
                            </DialogTitle>
                            <DialogDescription className="text-xs mt-0.5">
                                {context?.subtitle || "Inspect underlying orders, production jobs, and batch records."}
                            </DialogDescription>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                            {totalCount > resolvedCount
                                ? `Showing ${resolvedCount} of ${totalCount.toLocaleString()}`
                                : `${resolvedCount} record${resolvedCount === 1 ? "" : "s"}`}
                        </Badge>
                    </div>
                    {context?.formulaNote && (
                        <div className="mt-2.5 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-[11px] font-mono text-muted-foreground">
                            {context.formulaNote}
                        </div>
                    )}
                </DialogHeader>

                {context && (
                    <EvidenceModalBody
                        key={bodyKey}
                        context={context}
                        evidenceRegistry={evidenceRegistry}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};
