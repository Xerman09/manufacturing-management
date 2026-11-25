/**
 * Returns date boundary strings (YYYY-MM-DD) for the current month in Asia/Manila (+08:00) timezone.
 */
export function getThisMonthDates() {
    const now = new Date();
    // Offset by +8 hours for Manila timezone
    const manilaTime = new Date(now.getTime() + 8 * 3600 * 1000);
    const y = manilaTime.getUTCFullYear();
    const m = manilaTime.getUTCMonth();

    const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

    return { start, end };
}

export function formatDisplayDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

export function formatDisplayDateTime(dateStr: string | null | undefined): string {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}
