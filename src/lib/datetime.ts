// Shared UTC storage + configured-timezone display utilities.
// Contract:
// - POST/PATCH system timestamps use `nowUtcSql()` -> `YYYY-MM-DD HH:mm:ss` in UTC.
// - Display uses `formatInZone(value, timeZone)` -> `YYYY-MM-DD HH:mm:ss` in `general_setting.time_zone`.
// - Strictly no timezone fallback: missing/invalid value or timezone returns "-".

const NAIVE_DATETIME_RE =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/;
const NAIVE_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXPLICIT_OFFSET_RE =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})$/i;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat | null {
    const key = timeZone.trim();
    if (!key) return null;
    const existing = formatterCache.get(key);
    if (existing) return existing;
    try {
        const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: key,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
        });
        formatterCache.set(key, fmt);
        return fmt;
    } catch {
        return null;
    }
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
    if (typeof timeZone !== "string") return false;
    return getFormatter(timeZone) !== null;
}

/**
 * Formats a Date as `YYYY-MM-DD HH:mm:ss` in UTC for database persistence.
 * Returns empty string if `date` is invalid so callers can halt posting on falsy value.
 */
export function nowUtcSql(date: Date = new Date()): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }
    const year = String(date.getUTCFullYear()).padStart(4, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Parses a persisted timestamp assuming naive (offset-less) strings are UTC.
 * Offset-bearing ISO strings (`Z` or `±HH:mm`) preserve their exact instant.
 */
export function parseUtc(value: unknown): Date | null {
    if (value == null) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    if (typeof value !== "string") return null;

    const raw = value.trim();
    if (!raw) return null;

    const naiveMatch = NAIVE_DATETIME_RE.exec(raw);
    if (naiveMatch) {
        const year = Number(naiveMatch[1]);
        const month = Number(naiveMatch[2]);
        const day = Number(naiveMatch[3]);
        const hour = Number(naiveMatch[4]);
        const minute = Number(naiveMatch[5]);
        const second = Number(naiveMatch[6] ?? "0");
        const ms = Number((naiveMatch[7] ?? "").slice(0, 3).padEnd(3, "0") || "0");

        if (
            month < 1 || month > 12 ||
            day < 1 || day > 31 ||
            hour < 0 || hour > 23 ||
            minute < 0 || minute > 59 ||
            second < 0 || second > 59
        ) {
            return null;
        }

        const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
        if (
            Number.isNaN(d.getTime()) ||
            d.getUTCFullYear() !== year ||
            d.getUTCMonth() !== month - 1 ||
            d.getUTCDate() !== day
        ) {
            return null;
        }
        return d;
    }

    const offsetMatch = EXPLICIT_OFFSET_RE.exec(raw);
    if (offsetMatch) {
        const rawOffset = offsetMatch[3].toUpperCase();
        const normalizedOffset =
            rawOffset === "Z"
                ? "Z"
                : rawOffset.includes(":")
                  ? rawOffset
                  : `${rawOffset.slice(0, 3)}:${rawOffset.slice(3)}`;
        const iso = `${offsetMatch[1]}T${offsetMatch[2]}${normalizedOffset}`;
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const dateOnlyMatch = NAIVE_DATE_ONLY_RE.exec(raw);
    if (dateOnlyMatch) {
        const year = Number(dateOnlyMatch[1]);
        const month = Number(dateOnlyMatch[2]);
        const day = Number(dateOnlyMatch[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        if (
            Number.isNaN(d.getTime()) ||
            d.getUTCFullYear() !== year ||
            d.getUTCMonth() !== month - 1 ||
            d.getUTCDate() !== day
        ) {
            return null;
        }
        return d;
    }

    if (/(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})/i.test(raw)) {
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
}

/**
 * Formats a UTC timestamp into `YYYY-MM-DD HH:mm:ss` in `timeZone`.
 * Strictly returns `"-"` when `value` or `timeZone` is missing or invalid.
 */
export function formatInZone(value: unknown, timeZone: string | null | undefined): string {
    if (typeof timeZone !== "string") return "-";
    const fmt = getFormatter(timeZone);
    if (!fmt) return "-";

    const parsed = parseUtc(value);
    if (!parsed) return "-";

    const parts = fmt.formatToParts(parsed);
    let year = "";
    let month = "";
    let day = "";
    let hour = "";
    let minute = "";
    let second = "";

    for (const part of parts) {
        switch (part.type) {
            case "year":
                year = part.value;
                break;
            case "month":
                month = part.value;
                break;
            case "day":
                day = part.value;
                break;
            case "hour":
                hour = part.value === "24" ? "00" : part.value;
                break;
            case "minute":
                minute = part.value;
                break;
            case "second":
                second = part.value;
                break;
        }
    }

    if (!year || !month || !day || !hour || !minute || !second) {
        return "-";
    }

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
