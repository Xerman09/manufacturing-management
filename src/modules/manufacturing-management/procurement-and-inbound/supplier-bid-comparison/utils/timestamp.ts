
const PH_TIMEZONE = "Asia/Manila";

/**
 * Returns the current timestamp in Philippine time (UTC+8).
 * ISO 8601 format with explicit timezone offset.
 */

export function getPhilippineTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}


/**
 * Formats a timestamp into a readable Philippine date and time.
 */
export function formatPhilippineTimestamp(
  timestamp: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options,
  }).format(new Date(timestamp));
}
