import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlanningDataStatusProps {
    label: string;
    loading: boolean;
    error: string | null;
    lastUpdatedAt: string | null;
    onRetry?: () => void;
}

export function formatPlanningLastUpdated(value: string): string {
    return new Date(value).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila"
    });
}

export function PlanningDataStatus({ label, loading, error, lastUpdatedAt, onRetry }: PlanningDataStatusProps) {
    const lastUpdated = lastUpdatedAt ? formatPlanningLastUpdated(lastUpdatedAt) : null;
    if (!loading && !error && !lastUpdated) return null;

    const isStaleFailure = Boolean(error && lastUpdated);

    return (
        <div
            role={error && !lastUpdated ? "alert" : "status"}
            aria-live={error && !lastUpdated ? "assertive" : "polite"}
            aria-busy={loading || undefined}
            className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs ${
                error
                    ? isStaleFailure
                        ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                        : "bg-destructive/5 text-destructive"
                    : "text-muted-foreground"
            }`}
        >
            <span>
                {error
                    ? `${error}${isStaleFailure ? ` Showing the last successful ${label.toLowerCase()} from ${lastUpdated}.` : ""}`
                    : loading
                        ? lastUpdated
                            ? `Refreshing ${label.toLowerCase()}. Last updated ${lastUpdated}.`
                            : `Loading ${label.toLowerCase()}...`
                        : `Last updated ${lastUpdated}.`}
            </span>
            {error && onRetry && (
                <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRetry} className="h-7 gap-1.5 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                </Button>
            )}
        </div>
    );
}
