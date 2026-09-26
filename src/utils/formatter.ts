/** Common ccTLD second-level suffixes where registrable domain is three labels. */
const MULTI_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "net.uk",
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "co.jp",
  "ne.jp",
  "or.jp",
  "co.nz",
  "co.kr",
  "com.br",
  "com.mx",
  "co.in",
  "com.sg",
  "com.hk",
]);

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

/** Returns the registrable domain (eTLD+1), e.g. cdn.prod.website-files.com → website-files.com */
export function formatDomain(hostname: string): string {
  const trimmed = hostname.trim();
  const host = stripWww(trimmed.toLowerCase());
  if (!host.includes(".")) return trimmed;

  const parts = host.split(".");
  if (parts.length <= 2) return host;

  const lastTwo = `${parts.at(-2)}.${parts.at(-1)}`;
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

export function getUrlDomain(url: string): string {
  try {
    return formatDomain(new URL(url).hostname);
  } catch {
    return url;
  }
}

const MS_PER_DAY = 86_400_000;

/** Returns the integer day index (UTC-based) of a date's calendar day in a given IANA time zone. */
function toCalendarDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/**
 * Returns a time-zone-aware heading label for grouping links by date:
 * "Today", "Yesterday", "This week", "Last week", "<Month>" (current year),
 * or "<Month> <Year>" (earlier years). Weeks start Monday.
 */
export function getDateGroupLabel(
  date: Date,
  now: Date,
  timeZone: string,
): string {
  const today = toCalendarDay(now, timeZone);
  const day = toCalendarDay(date, timeZone);

  if (day >= today) return "Today";
  if (day === today - 1) return "Yesterday";

  const todayDow = new Date(today * MS_PER_DAY).getUTCDay();
  const mondayThisWeek = today - ((todayDow + 6) % 7);
  if (day >= mondayThisWeek) return "This week";
  if (day >= mondayThisWeek - 7) return "Last week";

  const dayDate = new Date(day * MS_PER_DAY);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(dayDate);
  const year = dayDate.getUTCFullYear();
  const todayYear = new Date(today * MS_PER_DAY).getUTCFullYear();

  return year === todayYear ? month : `${month} ${year}`;
}
