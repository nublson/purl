import type { ContentType } from "@/lib/prisma";
import type { ReaderViewState } from "@/utils/links";

type LinkLike = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  notes?: string | null;
  favicon: string;
  thumbnail: string | null;
  domain: string;
  contentType?: ContentType;
  createdAt: Date;
  folderId?: string | null;
  /** A raw row: `upload` is derived from it, and it is never emitted. */
  fileKey?: string | null;
  /** An already-mapped `Link` (`readLink`) carries `upload` itself. */
  upload?: boolean;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  frameable?: boolean | null;
  embed?: boolean;
  readerView?:
    | ReaderViewState
    | {
        status: ReaderViewState["status"];
        reason: string | null;
        fetchedAt: Date | null;
      }
    | null;
};

export function serializeLink(link: LinkLike) {
  return {
    id: link.id,
    url: link.url,
    title: link.title,
    description: link.description,
    notes: link.notes ?? null,
    favicon: link.favicon,
    thumbnail: link.thumbnail,
    domain: link.domain,
    contentType: link.contentType ?? "WEB",
    createdAt: link.createdAt.toISOString(),
    folderId: link.folderId ?? null,
    mimeType: link.mimeType ?? null,
    width: link.width ?? null,
    height: link.height ?? null,
    duration: link.duration ?? null,
    frameable: link.frameable ?? null,
    embed: link.embed ?? false,
    readerView: link.readerView
      ? {
          status: link.readerView.status,
          reason: link.readerView.reason,
          fetchedAt:
            link.readerView.fetchedAt instanceof Date
              ? link.readerView.fetchedAt.toISOString()
              : (link.readerView.fetchedAt ?? null),
        }
      : null,
    upload: link.upload ?? link.fileKey != null,
  };
}
