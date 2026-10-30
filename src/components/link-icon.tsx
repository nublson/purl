"use client";

import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { FileText, Globe, MusicNote, Video } from "reicon-react";
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
    case "VIDEO":
      return <Video className={icon} />;
    case "IMAGE": {
      // The image itself, as a rounded square: an upload's preview (a
      // 1,280px WebP or JPEG) when it has one, else the file (a saved image
      // link, a GIF, an upload stored without a preview), as the grid draws
      // it. Never the favicon: an upload's is Purl's own icon.
      const previewSrc = safeRemoteImgSrc(link.thumbnail ?? link.url);
      if (previewSrc) {
        return (
          <RemoteFavicon
            key={previewSrc}
            src={previewSrc}
            px={px}
            box={box}
            icon={icon}
            eager={eagerFavicon}
            cover
          />
        );
      }
      return <Favicon link={link} px={px} box={box} icon={icon} eager={eagerFavicon} />;
    }
    default:
      return <Favicon link={link} px={px} box={box} icon={icon} eager={eagerFavicon} />;
  }
}

/** The link's favicon, else the globe. */
function Favicon({
  link,
  px,
  box,
  icon,
  eager,
}: {
  link: Pick<Link, "favicon">;
  px: number;
  box: string;
  icon: string;
  eager: boolean;
}) {
  const faviconSrc = safeRemoteImgSrc(link.favicon);
  return faviconSrc ? (
    <RemoteFavicon
      key={faviconSrc}
      src={faviconSrc}
      px={px}
      box={box}
      icon={icon}
      eager={eager}
    />
  ) : (
    <Globe className={cn(icon, "text-muted-foreground")} aria-hidden />
  );
}

/**
 * A favicon (or an image pearl's preview, `cover`) from another site, which
 * can take a moment: a muted square holds its place, then it fades in
 * (150ms, opacity only) instead of popping into an empty gap. One that
 * fails shows the globe.
 */
function RemoteFavicon({
  src,
  px,
  box,
  icon,
  eager,
  cover = false,
}: {
  src: string;
  px: number;
  box: string;
  icon: string;
  eager: boolean;
  /** Fill the square, cropping (an image's preview), not fit a favicon. */
  cover?: boolean;
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
          "aspect-square transition-opacity duration-150 ease-out",
          cover
            ? // An image pearl's preview gets the card strip's 1px edge, so a
              // light photo doesn't dissolve into the row.
              "object-cover outline outline-black/10 -outline-offset-1 dark:outline-white/10"
            : "object-contain",
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
