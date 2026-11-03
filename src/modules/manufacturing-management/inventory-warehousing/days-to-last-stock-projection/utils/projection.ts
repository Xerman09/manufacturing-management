export function calculateProjection(consumed: number, months: number, workingDays: number, available: number) {
    if (![consumed, months, workingDays, available].every(Number.isFinite) || consumed < 0 || months <= 0 || workingDays <= 0) throw new Error("Invalid projection inputs.");
    const mAvg = consumed / months;
    const dAvg = mAvg / workingDays;
    const days = dAvg > 0 ? available / dAvg : null;
    if (![mAvg, dAvg].every(Number.isFinite) || consumed > 0 && dAvg === 0 || days !== null && !Number.isFinite(days)) throw new Error("Projection cannot be calculated at this numeric precision.");
    return { mAvg, dAvg, daysToLast: days };
}

export function formatProjectionQuantity(value: number) {
    if (!Number.isFinite(value)) return "Unavailable";
    if (value !== 0 && Math.abs(value) < 0.00000001) return value.toExponential(4);
    return value.toLocaleString(undefined, { maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 8 : 2 });
}

export function formatSupplyDays(value: number | null) {
    return value === null || !Number.isFinite(value) ? "Not calculable ? no recorded consumption" : `${Math.round(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} working days`;
}
export const longRangeCaveat = "Long-range estimate; sensitive to low recorded consumption and not a forecast of future demand.";
