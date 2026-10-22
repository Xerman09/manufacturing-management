export function formatDateTime(
  date: string | Date | null | undefined
): string {
  if (!date) return "";

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) return "";

  return d.toISOString().slice(0, 19).replace("T", " ");
}