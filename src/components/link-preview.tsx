"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import type { Link } from "@/utils/links";
import { Globe } from "lucide-react";
import * as React from "react";
import { PdfThumbnail } from "./pdf-thumbnail";

type LinkPreviewProps = {
  children: React.ReactNode;
  link: Link;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Eager-load preview thumbnail (first above-the-fold row) for LCP. */
  eagerThumbnail?: boolean;
};

function imageThumbnailClass(contentType: Link["contentType"]) {
  switch (contentType) {
    case "YOUTUBE":
      return "object-cover";
    default:
      return "object-contain";
  }
}

function LinkPreviewThumbnailArea({
  link,
  thumbnailSrc,
  eagerThumbnail,
}: {
  link: Link;
  thumbnailSrc: string | null;
  eagerThumbnail: boolean;
}) {
  const [thumbFailed, setThumbFailed] = React.useState(false);
  const [faviconFailed, setFaviconFailed] = React.useState(false);

  React.useEffect(() => {
    setThumbFailed(false);
    setFaviconFailed(false);
  }, [link.id, thumbnailSrc]);

  const faviconSrc = safeRemoteImgSrc(link.favicon);
  const showThumb = Boolean(thumbnailSrc) && !thumbFailed;
  const showFavicon =
    !showThumb && Boolean(faviconSrc) && !faviconFailed;
  const imgClass = imageThumbnailClass(link.contentType);

  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-t-md bg-muted/30 flex items-center justify-center">
      {showThumb && thumbnailSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-controlled OG URLs; avoid next/image optimizer SSRF
        <img
          src={thumbnailSrc}
          alt={link.title}
          width={200}
          height={200}
          sizes="256px"
          loading={eagerThumbnail ? "eager" : "lazy"}
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setThumbFailed(true)}
          className={`absolute inset-0 h-full w-full ${imgClass}`}
        />
      ) : showFavicon && faviconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faviconSrc}
          alt=""
          width={64}
          height={64}
          sizes="64px"
          loading={eagerThumbnail ? "eager" : "lazy"}
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setFaviconFailed(true)}
          className="size-16 object-contain"
        />
      ) : (
        <Globe
          className="size-14 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  );
}

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
          <LinkPreviewThumbnailArea
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
