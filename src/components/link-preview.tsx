import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { FolderSummary } from "@/lib/folders";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import type { Link } from "@/utils/links";
import type { ReactNode } from "react";
import { linkKind } from "@/lib/link-kind";
import { FolderEmoji } from "./folder-emoji";
import { LinkPreviewThumbnail } from "./link-preview-thumbnail";
import { AudioPreview } from "./audio-preview";
import { ImageFace, VideoFace } from "./media-card-face";
import { PdfThumbnail } from "./pdf-thumbnail";

type LinkPreviewProps = {
  children: ReactNode;
  link: Link;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Eager-load preview thumbnail (first above-the-fold row) for LCP. */
  eagerThumbnail?: boolean;
  onPreviewMouseEnter?: () => void;
  onPreviewMouseLeave?: () => void;
  /**
   * Where the card opens. Beside the row by default; the landing demo's rows
   * span the whole panel, leaving no room beside them, so it opens below.
   */
  placement?: "beside" | "below";
  /** Render PDFs through the signed-in PDF proxy (off in the demo). */
  pdfThumbnail?: boolean;
  /** The row's folder badge, named in full (the badge is only its emoji). */
  folder?: FolderSummary | null;
};

export function LinkPreview({
  children,
  link,
  open,
  onOpenChange,
  eagerThumbnail = false,
  onPreviewMouseEnter,
  onPreviewMouseLeave,
  placement = "beside",
  pdfThumbnail = true,
  folder = null,
}: LinkPreviewProps) {
  return (
    <HoverCard
      open={open}
      onOpenChange={onOpenChange}
      openDelay={10}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={placement === "below" ? "bottom" : "right"}
        align={placement === "below" ? "end" : "start"}
        // Seen on every row hover: appear and disappear instantly. Important so
        // it beats the primitive's animate-in/animate-out rules.
        className="p-0 flex-col hidden md:[@media(hover:hover)]:flex z-40 data-open:animate-none! data-closed:animate-none!"
        onMouseEnter={onPreviewMouseEnter}
        onMouseLeave={onPreviewMouseLeave}
      >
        <LinkPreviewBody
          link={link}
          eagerThumbnail={eagerThumbnail}
          pdfThumbnail={pdfThumbnail}
          folder={folder}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

/** The preview's media: its top corners, at most 320px tall (cropped). */
const MEDIA_FACE = "max-h-80 rounded-t-lg";

/**
 * What a preview card shows: the thumbnail (or favicon), or for an image
 * or video pearl the media itself, then the title and description (an
 * audio pearl: its player card, which holds the title, then the description),
 * then the folder when given. `pdfThumbnail: false` skips the PDF render (it needs the
 * signed-in PDF proxy) for the regular thumbnail.
 */
export function LinkPreviewBody({
  link,
  eagerThumbnail = false,
  pdfThumbnail = true,
  folder = null,
}: {
  link: Link;
  eagerThumbnail?: boolean;
  pdfThumbnail?: boolean;
  folder?: FolderSummary | null;
}) {
  const thumbnailSrc = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;
  const kind = linkKind(link);
  if (kind === "audio") {
    // The player card holds the title: then the description and the
    // folder, if any, under its transport.
    const more = Boolean(link.description) || folder !== null;
    return (
      <>
        <AudioPreview link={link} />
        {more ? (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {link.description ? <PreviewDescription text={link.description} /> : null}
            {folder ? <PreviewFolder folder={folder} /> : null}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <>
      {kind === "image" ? (
        <ImageFace link={link} eager={eagerThumbnail} className={MEDIA_FACE} />
      ) : kind === "video" ? (
        <VideoFace link={link} className={MEDIA_FACE} />
      ) : link.contentType === "PDF" && pdfThumbnail ? (
        <PdfThumbnail url={link.url} />
      ) : (
        <LinkPreviewThumbnail
          link={link}
          thumbnailSrc={thumbnailSrc}
          eagerThumbnail={eagerThumbnail}
        />
      )}
      <div className="p-4 flex flex-col gap-2">
        <p className="text-accent-foreground text-sm font-medium line-clamp-2 wrap-anywhere">
          {link.title}
        </p>
        {link.description && <PreviewDescription text={link.description} />}
        {folder ? <PreviewFolder folder={folder} /> : null}
      </div>
    </>
  );
}

function PreviewDescription({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground text-xs font-normal line-clamp-3 wrap-anywhere">
      {text}
    </p>
  );
}

function PreviewFolder({ folder }: { folder: FolderSummary }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs font-normal">
      <FolderEmoji emoji={folder.emoji} className="size-auto text-xs" />
      <span className="truncate">{folder.name}</span>
    </p>
  );
}
