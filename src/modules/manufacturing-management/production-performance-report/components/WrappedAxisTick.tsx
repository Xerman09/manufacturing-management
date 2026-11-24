"use client";

import React from "react";

const TICK_WRAP_CHARS = 18;
const TICK_MAX_LINES = 3;

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

export function WrappedAxisTick({ x = 0, y = 0, payload }: any) {
    const full = String(payload?.value ?? "");
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

export const WrappedTick = WrappedAxisTick;
export default WrappedAxisTick;

