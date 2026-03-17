export function getUrlDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return url;
  }
}

/** Returns a relative date label for grouping (Today, This Week, Last Week, etc.). */
export function getRelativeDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const then = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - then.getTime();
  const daysAgo = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (daysAgo === 0) return "Today";
  if (daysAgo >= 1 && daysAgo <= 7) return "This Week";
  if (daysAgo >= 8 && daysAgo <= 14) return "Last Week";
  if (daysAgo >= 15 && daysAgo <= 31) return "This Month";

  const sameYear = then.getFullYear() === now.getFullYear();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  if (then >= lastMonthStart && then <= lastMonthEnd) return "Last Month";
  if (sameYear) return "This Year";
  if (then.getFullYear() === now.getFullYear() - 1) return "Last Year";
  return "Older";
}
