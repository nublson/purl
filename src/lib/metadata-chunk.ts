import type { ContentType } from "@/generated/prisma/enums";

export type LinkMetadataForChunk = {
  title: string;
  url: string;
  domain: string;
  contentType: ContentType;
  description: string | null;
};

function normalizeLine(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function contentTypeLabel(type: ContentType): string {
  switch (type) {
    case "WEB":
      return "Web page";
    case "YOUTUBE":
      return "YouTube video";
    case "PDF":
      return "PDF document";
    case "AUDIO":
      return "Audio recording";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Builds a single text chunk embedding link metadata so semantic search can match
 * queries against title, URL, domain, type, and description — not only body content.
 */
export function buildMetadataText(link: LinkMetadataForChunk): string {
  const title =
    normalizeLine(link.title) ??
    normalizeLine(link.domain) ??
    "Saved link";
  const domain = normalizeLine(link.domain);
  const url = normalizeLine(link.url);
  const description = normalizeLine(link.description);

  const lines: string[] = [
    `Title: ${title}`,
    `Type: ${contentTypeLabel(link.contentType)}`,
  ];
  if (domain) lines.push(`Domain: ${domain}`);
  if (url) lines.push(`URL: ${url}`);
  if (description) lines.push(`Description: ${description}`);

  return lines.join("\n");
}
