import React from "react";

/**
 * Wrapped x-axis tick for the route/defect chart.
 * WHY: defect and parameter names can be long. Rotating them
 * needed more vertical space than the chart reserved, so they were clipped at the
 * bottom edge. Wrapping onto a few short lines keeps every label inside the plot area.
 */
const TICK_WRAP_CHARS = 18; // max characters per line before wrapping
const TICK_MAX_LINES = 3;   // beyond this the last line is ellipsised

function wrapLabel(text: string): string[] {
    const lines: string[] = [];
    let current = "";
    for (const word of text.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= TICK_WRAP_CHARS || !current) {
            current = next; // fits, or a single word longer than the limit
        } else {
            lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);

    // Clamp line count and hard-truncate any over-long line with an ellipsis.
    const clamped = lines.slice(0, TICK_MAX_LINES);
    if (lines.length > TICK_MAX_LINES) clamped[TICK_MAX_LINES - 1] += "…";
    return clamped.map((l) => (l.length > TICK_WRAP_CHARS + 2 ? `${l.slice(0, TICK_WRAP_CHARS)}…` : l));
}

export function WrappedAxisTick({ x = 0, y = 0, payload }: any) {
    const full = String(payload?.value ?? "");
    return (
        <g transform={`translate(${x},${y})`}>
            <text textAnchor="middle" fill="currentColor" fontSize={10} className="text-muted-foreground fill-muted-foreground">
                {/* Native hover tooltip so a truncated label can still be read in full. */}
                <title>{full}</title>
                {wrapLabel(full).map((line, i) => (
                    <tspan key={i} x={0} dy={12}>
                        {line}
                    </tspan>
                ))}
            </text>
        </g>
    );
}
