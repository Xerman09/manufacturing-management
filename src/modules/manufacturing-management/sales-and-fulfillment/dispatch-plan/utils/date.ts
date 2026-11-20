/**
 * Date formatting utilities for Dispatch Plan module
 * Formats dates to standard 24h format: "YYYY-MM-DD HH:mm" (e.g. 2026-11-19 13:25)
 */

export function formatDateTime24h(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    if (typeof value === "string") {
      const normalized = value.replace("T", " ");
      const parts = normalized.split(":");
      if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
      return normalized;
    }
    return String(value);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  return formatDateTime24h(value);
}
