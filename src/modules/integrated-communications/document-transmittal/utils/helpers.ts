import { formatInZone, nowUtcSql } from "@/lib/datetime";

/**
 * Formats a persisted timestamp in the configured timezone (`general_setting.time_zone`).
 * Strictly returns "-" when missing or invalid (no silent fallback).
 */
export function formatDateTime(
    dateInput: Date | string | null | undefined,
    timeZone: string | null | undefined
): string {
    return formatInZone(dateInput, timeZone);
}

/**
 * Formats a date-only string/value in the configured timezone, returning the YYYY-MM-DD portion.
 * Strictly returns "-" when missing or invalid (no silent fallback).
 */
export function formatDateOnly(
    dateInput: Date | string | null | undefined,
    timeZone: string | null | undefined
): string {
    const formatted = formatInZone(dateInput, timeZone);
    if (formatted === "-") return "-";
    return formatted.slice(0, 10);
}

/**
 * Returns a UTC `YYYY-MM-DD HH:mm:ss` timestamp for database writes.
 */
export function toUtcTimestamp(date: Date = new Date()): string {
    return nowUtcSql(date);
}
