"use client";

import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { FileText, Globe, MusicNote } from "reicon-react";
import * as React from "react";

interface LinkIconProps {
  link: Link;
  size?: "mini" | "small" | "default" | "row";
  eagerFavicon?: boolean;
}

/**
 * Box classes per size: the icon's and the favicon's (12 / 16 / 20px;
 * `row` is a list row's: 20px, 24px on phones beside the larger title).
 */
const SIZES = {
  mini: { icon: "size-3", box: "size-3", px: 12 },
  small: { icon: "size-4", box: "size-4", px: 16 },
  default: { icon: "size-5", box: "size-5", px: 20 },
  row: { icon: "size-5 max-md:size-6", box: "size-5 max-md:size-6", px: 24 },
} as const;

export function LinkIcon({
  link,
  size = "mini",
  eagerFavicon = false,
}: LinkIconProps) {
  const { icon, box, px } = SIZES[size];

  switch (link.contentType) {
    case "PDF":
      return <FileText className={icon} />;
    case "AUDIO":
      return <MusicNote className={icon} />;
    default: {
      const faviconSrc = safeRemoteImgSrc(link.favicon);
      return faviconSrc ? (
        <RemoteFavicon
          key={faviconSrc}
          src={faviconSrc}
          px={px}
          box={box}
          icon={icon}
          eager={eagerFavicon}
        />
      ) : (
        <Globe className={cn(icon, "text-muted-foreground")} aria-hidden />
      );
    }
  }
}

/**
 * A favicon from another site, which can take a moment: a muted square
 * holds its place, then it fades in (150ms, opacity only) instead of
 * popping into an empty gap. A favicon that fails shows the globe.
 */
function RemoteFavicon({
  src,
  px,
  box,
  icon,
  eager,
}: {
  src: string;
  px: number;
  box: string;
  icon: string;
  eager: boolean;
}) {
  const [state, setState] = React.useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  const imgRef = React.useRef<HTMLImageElement>(null);

  // Server-rendered images can finish (or fail) before React hydrates and
  // attaches onLoad / onError: read where they ended up.
  React.useEffect(() => {
    const img = imgRef.current;
    if (!img?.complete) return;
    setState(img.naturalWidth > 0 ? "loaded" : "failed");
  }, []);

  if (state === "failed") {
    return <Globe className={cn(icon, "text-muted-foreground")} aria-hidden />;
  }

  return (
    <span
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-[3px]",
        box,
        state === "loading" && "bg-muted",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- user-controlled favicon URLs; avoid next/image optimizer SSRF */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        width={px}
        height={px}
        referrerPolicy="no-referrer"
        className={cn(
          "aspect-square object-contain transition-opacity duration-150 ease-out",
          box,
          state === "loaded" ? "opacity-100" : "opacity-0",
        )}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
    </span>
  );
}
