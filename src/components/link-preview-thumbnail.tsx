"use client";

import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import type { Link } from "@/utils/links";
import { Globe } from "lucide-react";
import * as React from "react";

function imageThumbnailClass(contentType: Link["contentType"]) {
  switch (contentType) {
    case "YOUTUBE":
      return "object-cover";
    default:
      return "object-contain";
  }
}

export type LinkPreviewThumbnailProps = {
  link: Link;
  thumbnailSrc: string | null;
  /** Eager-load preview thumbnail (first above-the-fold row) for LCP. */
  eagerThumbnail?: boolean;
};

export function LinkPreviewThumbnail({
  link,
  thumbnailSrc,
  eagerThumbnail = false,
}: LinkPreviewThumbnailProps) {
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
