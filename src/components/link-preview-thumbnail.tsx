"use client";

import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { Globe } from "reicon-react";
import * as React from "react";

export type LinkPreviewThumbnailProps = {
  link: Link;
  thumbnailSrc: string | null;
  /** Eager-load preview thumbnail (first above-the-fold row) for LCP. */
  eagerThumbnail?: boolean;
  /** Overrides the box (e.g. another aspect ratio or radius). */
  className?: string;
};

export function LinkPreviewThumbnail({
  link,
  thumbnailSrc,
  eagerThumbnail = false,
  className,
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

  return (
    <div
      className={cn(
        "relative w-full aspect-video overflow-hidden rounded-t-lg bg-muted/30 flex items-center justify-center",
        className,
      )}
    >
      {showThumb && thumbnailSrc ? (
        <FadeInImg
          key={thumbnailSrc}
          src={thumbnailSrc}
          alt=""
          width={200}
          height={200}
          sizes="256px"
          loading={eagerThumbnail ? "eager" : "lazy"}
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setThumbFailed(true)}
          className="absolute inset-0 h-full w-full object-cover outline outline-black/10 -outline-offset-1 dark:outline-white/10"
        />
      ) : showFavicon && faviconSrc ? (
        <FadeInImg
          key={faviconSrc}
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

/**
 * A remote image that fades in (150ms, opacity only) once it has loaded,
 * over the tinted box behind it, instead of popping into an empty gap.
 */
function FadeInImg({
  className,
  onError,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [loaded, setLoaded] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);
  // An image that finished before hydration never fires onLoad for React.
  React.useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- user-controlled OG URLs; avoid next/image optimizer SSRF
    <img
      ref={imgRef}
      alt=""
      {...props}
      onLoad={() => setLoaded(true)}
      onError={onError}
      className={cn(
        "transition-opacity duration-150 ease-out",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
