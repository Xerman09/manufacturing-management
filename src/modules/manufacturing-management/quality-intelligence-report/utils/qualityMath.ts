export function safeFormatNumber(
    val: number | null | undefined,
    digits: number = 0,
    suffix: string = ""
): string {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return `${val.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    })}${suffix}`;
}

export function safeFormatPercent(val: number | null | undefined, digits: number = 1): string {
    if (val === null || val === undefined || isNaN(val)) return "-";
    return `${val.toFixed(digits)}%`;
}

export function calculateRate(numerator: number, denominator: number): number | null {
    if (!denominator || denominator <= 0) return null;
    return Number(((numerator / denominator) * 100).toFixed(1));
}
