/**
 * Date utility helpers for Predictive Maintenance Report
 */

export function getManilaDateString(date: Date = new Date()): string {
    const manila = new Date(date.getTime() + 8 * 3600 * 1000);
    return manila.toISOString().slice(0, 10);
}

export function getDefaultDateRange(): { start: string; end: string } {
    const now = new Date();
    const manila = new Date(now.getTime() + 8 * 3600 * 1000);
    const y = manila.getUTCFullYear();
    const m = manila.getUTCMonth();
    const d = manila.getUTCDate();

    // Default to last 30 days
    const past = new Date(Date.UTC(y, m, d - 30));
    const today = new Date(Date.UTC(y, m, d));

    return {
        start: past.toISOString().slice(0, 10),
        end: today.toISOString().slice(0, 10)
    };
}

export function formatFriendlyDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "N/A";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    } catch {
        return dateStr;
    }
}

export function formatDateTimeFriendly(dateStr: string | null | undefined): string {
    if (!dateStr) return "N/A";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch {
        return dateStr;
    }
}
