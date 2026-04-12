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
};

export function LinkPreview({
  children,
  link,
  open,
  onOpenChange,
  eagerThumbnail = false,
}: LinkPreviewProps) {
  const thumbnailSrc = link.thumbnail
    ? safeRemoteImgSrc(link.thumbnail)
    : null;

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
        className="p-0 flex-col hidden md:[@media(hover:hover)]:flex"
      >
        {link.contentType === "PDF" ? (
          <PdfThumbnail url={link.url} />
        ) : (
          <LinkPreviewThumbnail
            link={link}
            thumbnailSrc={thumbnailSrc}
            eagerThumbnail={eagerThumbnail}
          />
        )}
        <div className="p-4 flex flex-col gap-2">
          <p className="text-accent-foreground text-sm font-medium line-clamp-2">
            {link.title}
          </p>
          {link.description && (
            <p className="text-muted-foreground text-xs font-normal line-clamp-3 break-all">
              {link.description}
            </p>
          )}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 text-xs font-normal line-clamp-1 break-all underline"
          >
            {link.url}
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
