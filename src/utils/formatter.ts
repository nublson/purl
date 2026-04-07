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

/** Chat list row: time for today, short date otherwise. */
export function formatChatHistoryTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export interface ChatHistoryDateGroup<T extends { updatedAt: string }> {
  label: string;
  chats: T[];
}

/** Buckets chats by Today / Yesterday / Earlier using `updatedAt`. */
export function groupChatsByChatHistoryDate<
  T extends { updatedAt: string },
>(chats: T[]): ChatHistoryDateGroup<T>[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, T[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };

  for (const chat of chats) {
    const date = new Date(chat.updatedAt);
    const chatDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    if (chatDay.getTime() === today.getTime()) {
      groups.Today.push(chat);
    } else if (chatDay.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(chat);
    } else {
      groups.Earlier.push(chat);
    }
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, chats: list }));
}
