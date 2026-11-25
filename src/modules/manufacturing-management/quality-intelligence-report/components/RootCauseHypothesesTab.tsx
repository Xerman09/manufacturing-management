"use client";

/**
 * Root Cause Hypotheses tab — Quality Intelligence Report
 * Always leave behind comments on all changes and development of workflows for efficient long-term coding
 *
 * Revisions:
 * - The work-center and shift lists are now capped in height and scroll internally (ScrollableList)
 *   instead of growing the card without limit. Scroll was chosen over pagination because these are
 *   short, severity-ranked summary rows shown side by side: paging would hide data behind controls and
 *   let the two cards drift out of step. Move to pagination only if a list reaches hundreds of rows.
 * - Rows are sorted by defective units (highest first) so the scroll never hides the worst offenders.
 * - The max height cuts the 5th row off on purpose; the half-visible row is the scroll cue.
 * - A bottom fade shows while more rows remain below the fold; a count badge sits in each header.
 * - The duplicated row markup is now one CorrelationRow component.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Layers, Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { safeFormatNumber } from "../utils/qualityMath";
import type {
    QualityAICommentaryPayload,
    QualityReportPayload,
    QualityRootCauseRow
} from "../types";

interface RootCauseHypothesesTabProps {
    payload: QualityReportPayload;
    aiCommentary: QualityAICommentaryPayload | null;
    onOpenAiDrawer: () => void;
}

/**
 * Max-height scroll container with a "more below" fade.
 * - tabIndex=0 lets keyboard users focus the list and scroll it with the arrow keys.
 * - The fade is driven by real scroll position, so it disappears once the last row is reached
 *   and never shows when everything already fits.
 */
const ScrollableList: React.FC<{
    label: string;
    itemCount: number;
    children: React.ReactNode;
    /** Tailwind max-height class. ~340px shows four rows plus a cut-off fifth. */
    maxHeightClass?: string;
}> = ({ label, itemCount, children, maxHeightClass = "max-h-[340px]" }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [canScrollMore, setCanScrollMore] = useState(false);

    const check = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // 4px tolerance avoids a stuck fade from sub-pixel rounding at the bottom.
        setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    }, []);

    useEffect(() => {
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, [check, itemCount]);

    return (
        <div className="relative">
            <div
                ref={ref}
                onScroll={check}
                tabIndex={0}
                role="region"
                aria-label={label}
                className={`${maxHeightClass} overflow-y-auto pr-1 space-y-2 focus:outline-hidden focus-visible:ring-1 focus-visible:ring-ring rounded-xl`}
            >
                {children}
            </div>
            {canScrollMore && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t from-card to-transparent"
                />
            )}
        </div>
    );
};

/** One ranked row; `accentClass` colours the defective-unit figure per card. */
const CorrelationRow: React.FC<{ row: QualityRootCauseRow; accentClass: string }> = ({ row, accentClass }) => (
    <div className="p-3 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between gap-3 text-xs">
        <div className="min-w-0">
            <div className="font-bold text-foreground truncate" title={row.dimensionLabel}>
                {row.dimensionLabel}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
                Primary symptom: {row.primaryDefectLabel}
            </div>
        </div>
        <div className="text-right shrink-0">
            <div className={`font-extrabold ${accentClass}`}>{safeFormatNumber(row.defectiveQty)} units</div>
            <div className="text-[10px] text-muted-foreground">{row.defectCount} defect instances</div>
        </div>
    </div>
);

/** Highest defective quantity first, without mutating the payload array. */
const byDefectiveQtyDesc = (a: QualityRootCauseRow, b: QualityRootCauseRow) =>
    (Number(b.defectiveQty) || 0) - (Number(a.defectiveQty) || 0);

export const RootCauseHypothesesTab: React.FC<RootCauseHypothesesTabProps> = ({
    payload,
    aiCommentary,
    onOpenAiDrawer
}) => {
    const correlations = payload.rootCauseCorrelations || [];

    const wcCorrelations = correlations
        .filter((c) => c.dimensionType === "work_center")
        .sort(byDefectiveQtyDesc);
    const shiftCorrelations = correlations
        .filter((c) => c.dimensionType === "shift")
        .sort(byDefectiveQtyDesc);

    return (
        <div className="space-y-4">
            {/* AI Commentary Preview if available */}
            {aiCommentary && aiCommentary.hypotheses.length > 0 && (
                <div className="space-y-3">
                    <div className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        AI Identified Hypotheses & Proposed Containment
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {aiCommentary.hypotheses.map((h) => (
                            <Card
                                key={h.id}
                                className="rounded-2xl border-amber-500/30 bg-card shadow-sm hover:shadow transition-shadow flex flex-col justify-between"
                            >
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle className="text-xs font-bold text-foreground">
                                            {h.title}
                                        </CardTitle>
                                        <Badge
                                            variant="outline"
                                            className="text-[9px] uppercase font-bold border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                                        >
                                            {h.confidence} Confidence
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-[11px] text-muted-foreground pt-1">
                                        <strong>Observation: </strong>{h.observation}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 pt-1 space-y-2 text-xs">
                                    <div className="p-2 rounded-lg bg-amber-500/10 text-[11px] text-foreground leading-relaxed">
                                        <strong className="text-amber-700 dark:text-amber-400">Hypothesis: </strong>
                                        {h.hypothesis}
                                    </div>
                                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 pt-1.5 border-t border-border/50">
                                        <strong>Containment: </strong>
                                        {h.proposedAction}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Row 2: Structured Correlation Lists (Station & Shift) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Station Discrepancies */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Cpu className="h-4 w-4 text-indigo-500" />
                                Work Center / Machine Discrepancies
                            </CardTitle>
                            {wcCorrelations.length > 0 && (
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                    {wcCorrelations.length} {wcCorrelations.length === 1 ? "station" : "stations"}
                                </Badge>
                            )}
                        </div>
                        <CardDescription className="text-xs">
                            Defect concentration by production equipment and line, highest first
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                        {wcCorrelations.length === 0 ? (
                            <div className="py-8 text-center text-xs text-muted-foreground">
                                No station-specific defect concentration detected.
                            </div>
                        ) : (
                            <ScrollableList label="Work center defect list" itemCount={wcCorrelations.length}>
                                {wcCorrelations.map((wc, idx) => (
                                    <CorrelationRow
                                        key={`${wc.dimensionLabel}-${idx}`}
                                        row={wc}
                                        accentClass="text-rose-600 dark:text-rose-400"
                                    />
                                ))}
                            </ScrollableList>
                        )}
                    </CardContent>
                </Card>

                {/* Shift Discrepancies */}
                <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Layers className="h-4 w-4 text-amber-500" />
                                Production Shift Discrepancies
                            </CardTitle>
                            {shiftCorrelations.length > 0 && (
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                    {shiftCorrelations.length} {shiftCorrelations.length === 1 ? "shift" : "shifts"}
                                </Badge>
                            )}
                        </div>
                        <CardDescription className="text-xs">
                            Variation in quality conformity across day, swing, and night shifts, highest first
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                        {shiftCorrelations.length === 0 ? (
                            <div className="py-8 text-center text-xs text-muted-foreground">
                                No shift-specific defect variations recorded.
                            </div>
                        ) : (
                            <ScrollableList label="Shift defect list" itemCount={shiftCorrelations.length}>
                                {shiftCorrelations.map((sh, idx) => (
                                    <CorrelationRow
                                        key={`${sh.dimensionLabel}-${idx}`}
                                        row={sh}
                                        accentClass="text-amber-600 dark:text-amber-400"
                                    />
                                ))}
                            </ScrollableList>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};