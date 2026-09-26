import type { ContentType } from "@/generated/prisma/enums";
import { getDateGroupLabel } from "./formatter";

export type Link = {
  id: string;
  favicon: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  url: string;
  domain: string;
  contentType: ContentType;
  createdAt: Date;
};

export type LinkGroup = {
  label: string;
  links: Link[];
};

export function groupLinksByDate(
  links: Link[],
  options: { now?: Date; timeZone: string },
): LinkGroup[] {
  const now = options.now ?? new Date();
  const sorted = [...links].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const byLabel = new Map<string, Link[]>();
  for (const link of sorted) {
    const label = getDateGroupLabel(link.createdAt, now, options.timeZone);
    const bucket = byLabel.get(label) ?? [];
    bucket.push(link);
    byLabel.set(label, bucket);
  }
  return [...byLabel.entries()].map(([label, links]) => ({ label, links }));
}

/**
 * Appends `next` groups (an older page) to `current`, merging same-label
 * groups and dropping links already present. Keeps first-seen label order.
 */
export function mergeLinkGroups(
  current: LinkGroup[],
  next: LinkGroup[],
): LinkGroup[] {
  const seen = new Set<string>();
  const byLabel = new Map<string, Link[]>();
  for (const group of [...current, ...next]) {
    const bucket = byLabel.get(group.label) ?? [];
    for (const link of group.links) {
      if (seen.has(link.id)) continue;
      seen.add(link.id);
      bucket.push(link);
    }
    byLabel.set(group.label, bucket);
  }
  return [...byLabel.entries()]
    .map(([label, links]) => ({ label, links }))
    .filter((group) => group.links.length > 0);
}

/** Total number of links across groups. */
export function countGroupedLinks(groups: LinkGroup[]): number {
  return groups.reduce((sum, group) => sum + group.links.length, 0);
}

type JsonLink = Omit<Link, "createdAt"> & { createdAt: string | Date };

/** Restores `createdAt` Dates on links parsed from a JSON API response. */
export function parseJsonLinks(links: JsonLink[]): Link[] {
  return links.map((link) => ({ ...link, createdAt: new Date(link.createdAt) }));
}

/** Restores `createdAt` Dates on groups parsed from a JSON API response. */
export function parseJsonLinkGroups(
  groups: { label: string; links: JsonLink[] }[],
): LinkGroup[] {
  return groups.map((group) => ({
    label: group.label,
    links: parseJsonLinks(group.links),
  }));
}
