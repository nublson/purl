import { formatDuration } from "@/utils/format-duration";
import { formatDomain } from "@/utils/formatter";
import type { Link } from "@/utils/links";

type MetaFields = Pick<Link, "upload" | "contentType" | "duration" | "domain">;

const KIND_LABEL: Partial<Record<Link["contentType"], string>> = {
  IMAGE: "Image",
  VIDEO: "Video",
  AUDIO: "Audio",
};

/**
 * What an upload shows where a link shows its domain: its kind, and its
 * length when it has one ("Video · 0:14", "Image"). An upload's `domain` is
 * Purl's own host, which says nothing about the file; null for a link.
 */
export function uploadMeta(link: MetaFields): string | null {
  if (!link.upload) return null;
  const kind = KIND_LABEL[link.contentType] ?? "File";
  return link.duration != null
    ? `${kind} · ${formatDuration(link.duration)}`
    : kind;
}

/** A row's or card's second line: the upload's facts, else the link's domain. */
export function linkSecondLine(link: MetaFields): string {
  return uploadMeta(link) ?? formatDomain(link.domain);
}
