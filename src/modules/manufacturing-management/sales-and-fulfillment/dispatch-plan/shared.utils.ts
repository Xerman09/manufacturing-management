import type { DispatchPlanStatus, SalesOrderStatus } from "./shared.types";
import { formatDateTime, formatDateTime24h } from "@/lib/utils";

export { formatDateTime, formatDateTime24h };

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `₱${Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTimeDisplay(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const normalized = value.replace(" ", "T");
    return normalized.slice(0, 16);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function formatUserFriendlyError(
  error: unknown,
  fallback = "An unexpected error occurred."
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : (error as { message?: string; error?: string })?.message ||
        (error as { message?: string; error?: string })?.error ||
        fallback;

  const lower = raw.toLowerCase();
  if (
    lower.includes("under pressure") ||
    lower.includes("service_unavailable") ||
    lower.includes("unavailable") ||
    lower.includes("503")
  ) {
    return "System / API Under Pressure. Please retry in a few moments.";
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("session expired") ||
    lower.includes("401") ||
    lower.includes("403")
  ) {
    return "Session expired or unauthorized. Please re-authenticate.";
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return "Requested record or resource was not found.";
  }
  if (raw.startsWith("Directus GET") || raw.includes("failed (HTTP")) {
    return "System / API Under Pressure. Please retry in a few moments.";
  }
  return raw;
}

export function getDispatchStatusBadgeStyle(status: DispatchPlanStatus | string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "Pending":
    case "For Approval":
      return {
        label: "For Approval",
        className:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      };
    case "Approved":
      return {
        label: "Approved",
        className:
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      };
    case "Rejected":
    case "Returned for Correction":
      return {
        label: "Returned for Correction",
        className:
          "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      };
    case "Dispatched":
      return {
        label: "Dispatched",
        className:
          "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      };
    default:
      return {
        label: status || "-",
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}

/**
 * Maps every `sales_order.order_status` enum value to a distinct, accessible badge style.
 */
export function getOrderStatusBadgeStyle(status: SalesOrderStatus | string | null | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case "Draft":
      return {
        label: "Draft",
        className:
          "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700",
      };
    case "Pending":
    case "For Approval":
      return {
        label: status,
        className:
          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      };
    case "For Consolidation":
    case "For Production":
      return {
        label: status,
        className:
          "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
      };
    case "In Production":
      return {
        label: "In Production",
        className:
          "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-800",
      };
    case "For Picking":
      return {
        label: "For Picking",
        className:
          "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
      };
    case "For Invoicing":
      return {
        label: "For Invoicing",
        className:
          "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
      };
    case "For Loading":
      return {
        label: "For Loading",
        className:
          "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
      };
    case "For Shipping":
      return {
        label: "For Shipping",
        className:
          "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700",
      };
    case "En Route":
      return {
        label: "En Route",
        className:
          "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800",
      };
    case "Dispatched":
      return {
        label: "Dispatched",
        className:
          "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      };
    case "Partially Delivered":
      return {
        label: "Partially Delivered",
        className:
          "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
      };
    case "Delivered":
      return {
        label: "Delivered",
        className:
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      };
    case "On Hold":
    case "For Revision":
      return {
        label: status,
        className:
          "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
      };
    case "For Cancellation":
    case "Cancelled":
    case "Not Fulfilled":
      return {
        label: status,
        className:
          "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      };
    default:
      return {
        label: status || "-",
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}
