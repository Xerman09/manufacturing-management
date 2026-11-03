export function materialStockShortage(value: unknown, onHand: number) {
    const parsed = typeof value === "number" || typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    const threshold = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    if (threshold === null) return onHand < 0 ? { requiredQty: null, shortageQty: null } : null;
    return onHand < threshold ? { requiredQty: threshold, shortageQty: Math.max(0, threshold - onHand) } : null;
}
