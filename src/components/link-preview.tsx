import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import type { Link } from "@/utils/links";
import { PdfThumbnail } from "./pdf-thumbnail";

type LinkPreviewProps = {
  children: React.ReactNode;
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
  const imageThumbnailClass = () => {
    switch (link.contentType) {
      case "YOUTUBE":
        return "object-cover";
      default:
        return "object-fit";
    }
  };

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
        ) : thumbnailSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-controlled OG URLs; avoid next/image optimizer SSRF
          <img
            src={thumbnailSrc}
            alt={link.title}
            width={200}
            height={200}
            sizes="256px"
            loading={eagerThumbnail ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
            className={`w-full h-full aspect-video rounded-t-md ${imageThumbnailClass()}`}
          />
        ) : null}
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
