import { getAppBaseUrl } from "@/lib/billing-url";
import type { ContentType, IngestStatus } from "@/lib/prisma";
import { isUploadFilePath } from "@/utils/upload-file-url";

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
  ingestStatus: IngestStatus;
};

export function serializeLink(link: LinkLike) {
  return {
    id: link.id,
    // Uploads store a relative app route; API/MCP clients need an absolute URL.
    url: isUploadFilePath(link.url) ? `${getAppBaseUrl()}${link.url}` : link.url,
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
