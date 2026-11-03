const quantityFormatter = new Intl.NumberFormat("en-US", {
    useGrouping: true,
    maximumFractionDigits: 6,
});

export function formatQty(val: number | string | null | undefined): string {
    const num = Number(val || 0);
    if (!Number.isFinite(num)) return "0";
    return quantityFormatter.format(num);
}
