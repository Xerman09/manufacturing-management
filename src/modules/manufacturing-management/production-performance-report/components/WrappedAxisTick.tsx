"use client";

/**
 * Shared x-axis tick for report charts.
 *
 * Two modes, chosen automatically from how many ticks the axis is drawing:
 * - Sparse (<= DENSE_TICK_COUNT ticks): long labels wrap onto up to 3 short lines.
 * - Dense  (>  DENSE_TICK_COUNT ticks): labels are STAGGERED. Neighbouring ticks alternate between
 *   a top row and one or two lower rows, so a 60-day trend no longer prints "Aug Aug Aug" on top of
 *   itself. Rows needed = label width / room per tick, clamped to 1..MAX_STAGGER_ROWS.
 *
 * WHY: the daily trend charts can carry 60+ points with interval={0}. Wrapping cannot help there
 * because every label is short but the slots are narrower than the label. Staggering gives each
 * label (rows x slot) of horizontal room instead of one slot.
 *
 * IMPORTANT: the XAxis must reserve vertical room for the lower rows. Pass
 * `height={getAxisHeight(data.length)}` to the XAxis (and keep the chart's bottom margin small).
 */

import React from "react";

const TICK_WRAP_CHARS = 18; // sparse mode: max characters per line before wrapping
const TICK_MAX_LINES = 3; // sparse mode: lines before the last one is ellipsised

const DENSE_TICK_COUNT = 12; // above this many ticks, switch from wrapping to staggering
const CHAR_PX = 5.5; // approx glyph width at fontSize 10, used to estimate label width
const LABEL_GAP_PX = 6; // breathing room required between two labels on the same row
const MAX_STAGGER_ROWS = 3;
const ROW_HEIGHT = 12; // vertical distance between stagger rows

/** Axis height that fits the chosen mode. Use on the XAxis `height` prop. */
export function getAxisHeight(tickCount: number): number {
    // 10px first-baseline offset + (rows - 1) extra rows + descender padding.
    return tickCount > DENSE_TICK_COUNT ? 10 + MAX_STAGGER_ROWS * ROW_HEIGHT + 4 : 44;
}

function wrapLabel(text: string): string[] {
    const lines: string[] = [];
    let current = "";
    for (const word of text.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= TICK_WRAP_CHARS || !current) {
            current = next;
        } else {
            lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);

    const clamped = lines.slice(0, TICK_MAX_LINES);
    if (lines.length > TICK_MAX_LINES) clamped[TICK_MAX_LINES - 1] += "…";
    return clamped.map((l) =>
        l.length > TICK_WRAP_CHARS + 2 ? `${l.slice(0, TICK_WRAP_CHARS)}…` : l
    );
}

// Recharts passes index, visibleTicksCount and the axis width to custom ticks alongside x/y/payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function WrappedAxisTick({ x = 0, y = 0, payload, index = 0, visibleTicksCount = 0, width = 0 }: any) {
    const full = String(payload?.value ?? "");
    const dense = visibleTicksCount > DENSE_TICK_COUNT;

    if (!dense) {
        return (
            <g transform={`translate(${x},${y})`}>
                <text
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize={10}
                    className="text-muted-foreground fill-muted-foreground"
                >
                    {/* Native hover tooltip so a truncated label can still be read in full. */}
                    <title>{full}</title>
                    {wrapLabel(full).map((line, i) => (
                        <tspan key={i} x={0} dy={i === 0 ? 10 : 12}>
                            {line}
                        </tspan>
                    ))}
                </text>
            </g>
        );
    }

    // Dense mode: work out how many rows are needed so same-row labels do not touch.
    const slotPx = width > 0 ? width / visibleTicksCount : 0;
    const shown = full.length > TICK_WRAP_CHARS ? `${full.slice(0, TICK_WRAP_CHARS)}…` : full;
    const labelPx = shown.length * CHAR_PX + LABEL_GAP_PX;
    // If the axis width is unknown, fall back to a plain 2-row zigzag.
    const rows = slotPx > 0 ? Math.min(MAX_STAGGER_ROWS, Math.max(1, Math.ceil(labelPx / slotPx))) : 2;
    const row = index % rows;

    return (
        <g transform={`translate(${x},${y})`}>
            <text
                x={0}
                y={10 + row * ROW_HEIGHT}
                textAnchor="middle"
                fill="currentColor"
                fontSize={10}
                className="text-muted-foreground fill-muted-foreground"
            >
                <title>{full}</title>
                {shown}
            </text>
        </g>
    );
}

export const WrappedTick = WrappedAxisTick;
export default WrappedAxisTick;