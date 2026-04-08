import type { IngestStatus } from "@/utils/links";

type LinkLike = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  favicon: string;
  thumbnail: string | null;
  domain: string;
  contentType?: "WEB" | "YOUTUBE" | "PDF" | "AUDIO";
  createdAt: Date;
  ingestStatus: IngestStatus;
};

export function serializeLink(link: LinkLike) {
  return {
    id: link.id,
    url: link.url,
    title: link.title,
    description: link.description,
    favicon: link.favicon,
    thumbnail: link.thumbnail,
    domain: link.domain,
    contentType: link.contentType ?? "WEB",
    ingestStatus: link.ingestStatus,
    createdAt: link.createdAt.toISOString(),
  };
}
