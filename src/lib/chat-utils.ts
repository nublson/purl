import type { UIMessage } from "ai";

import type { Link } from "@/utils/links";

/** Links whose title/domain/url/description match the mention query after `@`. */
export function filterLinksForMentionQuery(
  links: Link[],
  query: string,
): Link[] {
  const q = query.toLowerCase().trim();
  if (!q) return links;
  return links.filter((link) => {
    const hay = [link.title, link.domain, link.url, link.description ?? ""]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Matches `@[Title](linkId)` mention tokens in chat text. */
export const MENTION_TOKEN_REGEX = /@\[([^\]]*)\]\(([^)]+)\)/g;

/** Stable mention token for a link (title is sanitized for the bracket syntax). */
export function formatMentionToken(link: { id: string; title: string }): string {
  const safe = link.title
    .replace(/\]/g, "")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, 240);
  return `@[${safe || "Link"}](${link.id})`;
}

export function extractMentionLinkIds(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(
    new RegExp(MENTION_TOKEN_REGEX.source, "g"),
  )) {
    const id = match[2]?.trim();
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

export function getTextFromUIMessage(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}
