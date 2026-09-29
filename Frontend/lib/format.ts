import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";

export function formatDate(value: string | Date | null | undefined, pattern = "MMMM d, yyyy"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, pattern);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, "MMM d, yyyy · HH:mm");
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "Never";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  if (Date.now() - d.getTime() < 45_000) return "Just now";
  if (isToday(d)) return `Today, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "HH:mm")}`;
  return `${formatDistanceToNowStrict(d)} ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function toDateInput(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
