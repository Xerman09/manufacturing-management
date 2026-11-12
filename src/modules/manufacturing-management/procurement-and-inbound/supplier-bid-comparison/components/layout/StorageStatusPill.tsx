"use client";

import React from "react";
import { Loader2, Check, Cloud, AlertCircle } from "lucide-react";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { cn } from "@/lib/utils";

interface StorageStatusPillProps {
    className?: string;
}

export const StorageStatusPill: React.FC<StorageStatusPillProps> = ({ className }) => {
    const { storageStatus, isDirty, isSaving, saveError, saveProjectNow } = useBidComparisonStore();

    if (isSaving) {
        return (
            <div
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300",
                    className
                )}
                title="Synchronizing changes with database..."
            >
                <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                <span>Saving to database...</span>
            </div>
        );
    }

    if (isDirty) {
        return (
            <button
                type="button"
                onClick={() => saveProjectNow()}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 transition-colors cursor-pointer",
                    className
                )}
                title="Unsaved changes pending auto-save (Click or press Ctrl+S to save immediately)"
            >
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Unsaved changes · Save now</span>
            </button>
        );
    }

    if (storageStatus === "OFFLINE_ERROR" || saveError) {
        return (
            <button
                type="button"
                onClick={() => saveProjectNow()}
                className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-rose-50 hover:bg-rose-100/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 transition-colors cursor-pointer",
                    className
                )}
                title={saveError || "Database unreachable - saved locally in browser"}
            >
                <AlertCircle className="h-3 w-3 text-rose-600" />
                <span>Saved locally (Click to retry DB)</span>
            </button>
        );
    }

    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400",
                className
            )}
            title="All changes are synchronized with database"
        >
            <Check className="h-3 w-3 text-emerald-600" />
            <span>Saved &amp; synced</span>
        </div>
    );
};
