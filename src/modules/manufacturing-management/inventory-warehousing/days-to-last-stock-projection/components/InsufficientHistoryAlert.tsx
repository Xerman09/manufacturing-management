import React from "react";
import { HelpCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InsufficientHistoryAlertProps {
    count: number;
    onViewGaps: () => void;
}

export default function InsufficientHistoryAlert({
    count,
    onViewGaps,
}: InsufficientHistoryAlertProps) {
    if (count === 0) return null;

    return (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 mt-0.5">
                    <HelpCircle className="h-4 w-4" />
                </div>
                <div>
                    <h5 className="text-xs font-semibold text-purple-800 dark:text-purple-300">
                        Historical Consumption Readiness Alert ({count} Material{count > 1 ? "s" : ""})
                    </h5>
                    <p className="text-[11px] text-purple-700/80 dark:text-purple-400/90 mt-0.5">
                        Stock longevity projections for newly integrated items are held until a minimum verified history period is reached.
                    </p>
                </div>
            </div>

            <Button
                variant="outline"
                size="sm"
                onClick={onViewGaps}
                className="h-8 text-xs border-purple-500/40 text-purple-700 dark:text-purple-300 hover:bg-purple-500/15"
            >
                View History Gaps
                <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
        </div>
    );
}
