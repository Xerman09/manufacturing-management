import { formatInZone, nowUtcSql } from "@/lib/datetime";

export function formatPhDate(
    value: string | Date | null | undefined,
    timeZone: string | null | undefined
): string {
    return formatInZone(value, timeZone);
}

export function formatPhDateTime(
    value: string | Date | null | undefined,
    _options?: Intl.DateTimeFormatOptions,
    timeZone?: string | null
): string {
    return formatInZone(value, timeZone);
}

export function getPhIsoDate(
    date: Date = new Date(),
    timeZone: string | null | undefined
): string {
    const formatted = formatInZone(date, timeZone);
    if (formatted === "-") return "";
    return formatted.slice(0, 10);
}

export function getPhIsoTimestamp(date: Date = new Date()): string {
    return nowUtcSql(date);
}
