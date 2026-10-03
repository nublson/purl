import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import type { Link } from "@/utils/links";
import type { ReactNode } from "react";
import { LinkPreviewThumbnail } from "./link-preview-thumbnail";
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
};

export function LinkPreview({
  children,
  link,
  open,
  onOpenChange,
  eagerThumbnail = false,
  onPreviewMouseEnter,
  onPreviewMouseLeave,
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
        side="right"
        align="start"
        // Seen on every row hover: appear and disappear instantly. Important so
        // it beats the primitive's animate-in/animate-out rules.
        className="p-0 flex-col hidden md:[@media(hover:hover)]:flex z-40 data-open:animate-none! data-closed:animate-none!"
        onMouseEnter={onPreviewMouseEnter}
        onMouseLeave={onPreviewMouseLeave}
      >
        <LinkPreviewBody link={link} eagerThumbnail={eagerThumbnail} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** The card's surface: the hover card's box, for cards shown in place. */
export const LINK_PREVIEW_CARD_SURFACE =
  "flex flex-col overflow-hidden rounded-lg bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10";

/**
 * What a preview card shows: the thumbnail (or favicon), title and
 * description. The hover card and the shared folder's grid cards both use
 * it, so they look the same. `pdfThumbnail: false` skips the PDF render
 * (it needs the signed-in PDF proxy) for the regular thumbnail.
 */
export function LinkPreviewBody({
  link,
  eagerThumbnail = false,
  pdfThumbnail = true,
}: {
  link: Link;
  eagerThumbnail?: boolean;
  pdfThumbnail?: boolean;
}) {
  const thumbnailSrc = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;
  return (
    <>
      {link.contentType === "PDF" && pdfThumbnail ? (
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
        {link.description && (
          <p className="text-muted-foreground text-xs font-normal line-clamp-3 wrap-anywhere">
            {link.description}
          </p>
        )}
      </div>
    </>
  );
}
