import type { ContentType } from "@/lib/prisma";

type LinkLike = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  favicon: string;
  thumbnail: string | null;
  domain: string;
  contentType?: ContentType;
  createdAt: Date;
  folderId?: string | null;
  readAt?: Date | null;
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
    createdAt: link.createdAt.toISOString(),
    folderId: link.folderId ?? null,
    readAt: link.readAt ? link.readAt.toISOString() : null,
  };
}
