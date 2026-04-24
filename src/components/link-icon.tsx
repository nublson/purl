import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { FileMusic, FileText, Globe } from "lucide-react";

interface LinkIconProps {
  link: Link;
  size?: "mini" | "small" | "default";
  eagerFavicon?: boolean;
}

export function LinkIcon({
  link,
  size = "mini",
  eagerFavicon = false,
}: LinkIconProps) {
  const sizeMap = {
    mini: {
      iconSize: 3,
      imgSize: 12,
    },
    small: {
      iconSize: 4,
      imgSize: 16,
    },
    default: {
      iconSize: 5,
      imgSize: 20,
    },
  };
  const { iconSize, imgSize } = sizeMap[size];

  const media = (() => {
    switch (link.contentType) {
      case "PDF":
        return <FileText className={cn(`size-${iconSize}`)} />;
      case "AUDIO":
        return <FileMusic className={cn(`size-${iconSize}`)} />;
      default: {
        const faviconSrc = safeRemoteImgSrc(link.favicon);
        return faviconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-controlled favicon URLs; avoid next/image optimizer SSRF
          <img
            src={faviconSrc}
            alt={link.title}
            width={imgSize}
            height={imgSize}
            sizes={`${imgSize}px`}
            referrerPolicy="no-referrer"
            className={cn(`aspect-square object-contain size-${imgSize}`)}
            loading={eagerFavicon ? "eager" : undefined}
          />
        ) : (
          <Globe
            className={cn(`size-${iconSize} text-muted-foreground`)}
            aria-hidden
          />
        );
      }
    }
  })();

  return media;
}
