import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * cn()
 * Standard shadcn helper: merges conditional classnames + tailwind conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Date helpers
 */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateLong(d: Date, locale: string = "en-PH"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(d);
}

export function formatDateTime(
  val?: Date | string | null
): string {
  if (!val) return "-";
  if (typeof val === "string") {
    const trimmed = val.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (match) {
      return `${match[1]} ${match[2]}`;
    }
  }
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime24h(val?: Date | string | null): string {
  return formatDateTime(val);
}

export function isValidDate(val: unknown): val is Date {
  return val instanceof Date && !Number.isNaN(val.getTime());
}

/**
 * Formatting helpers
 */
export function formatCurrency(
    amount: number | string | null | undefined,
    currency: string = "PHP",
    locale: string = "en-PH"
): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : (amount as number);
  const safeValue = (value === null || value === undefined || isNaN(value) || !Number.isFinite(value)) ? 0 : value;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(safeValue);
}

export function formatNumber(
    value: number,
    locale: string = "en-PH",
    maximumFractionDigits: number = 2
): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(safe);
}

export function titleCase(input: string): string {
  return input
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
}
