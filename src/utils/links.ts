import { getRelativeDateLabel } from "./formatter";

export type Link = {
  favicon: string;
  title: string;
  url: string;
  createdAt: Date;
};

export type LinkGroup = {
  label: string;
  links: Link[];
};

const LABEL_ORDER = [
  "Today",
  "This Week",
  "Last Week",
  "This Month",
  "Last Month",
  "This Year",
  "Last Year",
  "Older",
] as const;

export function groupLinksByDate(links: Link[]): LinkGroup[] {
  const sorted = [...links].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  const byLabel = new Map<string, Link[]>();
  for (const label of LABEL_ORDER) {
    byLabel.set(label, []);
  }
  for (const link of sorted) {
    const label = getRelativeDateLabel(link.createdAt);
    const bucket = byLabel.get(label) ?? [];
    bucket.push(link);
    byLabel.set(label, bucket);
  }
  return LABEL_ORDER.map((label) => ({
    label,
    links: byLabel.get(label) ?? [],
  })).filter((group) => group.links.length > 0);
}
