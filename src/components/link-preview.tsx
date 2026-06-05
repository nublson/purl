import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { usePlan } from "@/hooks/use-plan";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import type { Link } from "@/utils/links";
import type { ReactNode } from "react";
import { LinkPreviewThumbnail } from "./link-preview-thumbnail";
import { LinkUpgradeItem } from "./link-upgrade-item";
import { PdfThumbnail } from "./pdf-thumbnail";
import { Separator } from "./ui/separator";

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
  const { effectivePlanKey } = usePlan();
  const isFree = effectivePlanKey === "FREE";
  const thumbnailSrc = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;

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
        className="p-0 flex-col hidden md:[@media(hover:hover)]:flex z-40"
        onMouseEnter={onPreviewMouseEnter}
        onMouseLeave={onPreviewMouseLeave}
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
        </div>
        {isFree && (
          <>
            <Separator />
            <LinkUpgradeItem />
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
