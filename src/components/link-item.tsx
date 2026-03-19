 "use client";

import { cn } from "@/lib/utils";
import { Link as LinkType } from "@/utils/links";
import { MessageCircle } from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { LinkMenu } from "./link-menu";
import { LinkPreview } from "./link-preview";
import { Button } from "./ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

export const LinkItem = React.forwardRef<
  HTMLDivElement,
  { link: LinkType } & React.ComponentPropsWithoutRef<typeof Item>
>(function LinkItem(
  { link, className, onMouseEnter, onMouseLeave, ...rest },
  ref,
) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const hoveringActionsRef = React.useRef(false);
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpenTimer = React.useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const scheduleOpen = React.useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();

    openTimerRef.current = setTimeout(() => {
      if (!hoveringActionsRef.current) setPreviewOpen(true);
    }, 10);
  }, [clearCloseTimer, clearOpenTimer]);

  const scheduleClose = React.useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();

    closeTimerRef.current = setTimeout(() => {
      setPreviewOpen(false);
    }, 100);
  }, [clearCloseTimer, clearOpenTimer]);

  React.useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearCloseTimer, clearOpenTimer]);

  return (
    <LinkPreview
      link={link}
      open={previewOpen}
      onOpenChange={() => {
        // HoverCardTrigger is still present, but we fully control `open` from LinkItem mouse events.
      }}
    >
      <Item
        ref={ref}
        role="listitem"
        className={cn(
          "p-2 gap-4 grid grid-cols-[20px_1fr_auto] relative hover:bg-accent/40 data-[state=open]:bg-accent/40 has-data-[state=open]:bg-accent/40",
          className,
        )}
        onMouseEnter={(event) => {
          onMouseEnter?.(event);
          hoveringActionsRef.current = false;
          scheduleOpen();
        }}
        onMouseLeave={(event) => {
          onMouseLeave?.(event);
          hoveringActionsRef.current = false;
          scheduleClose();
        }}
        {...rest}
      >
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-0"
        />
        <ItemMedia variant="image" className="size-5 rounded">
          <Image
            src={link.favicon}
            alt={link.title}
            width={20}
            height={20}
            className="aspect-square object-contain"
          />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            <p className="text-accent-foreground text-sm font-medium line-clamp-1 break-all">
              {link.title}
            </p>
            <p className="text-muted-foreground text-sm font-normal hidden md:block">
              {link.domain}
            </p>
          </ItemTitle>
        </ItemContent>
        <ItemActions
          className="z-10 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100 group-data-[state=open]/item:opacity-100 has-data-[state=open]:opacity-100 transition-opacity duration-200"
          onMouseEnter={(event) => {
            hoveringActionsRef.current = true;
            clearOpenTimer();
            clearCloseTimer();
            setPreviewOpen(false);
          }}
          onMouseLeave={(event) => {
            hoveringActionsRef.current = false;
            scheduleOpen();
          }}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer text-muted-foreground [@media(hover:none)]:hidden"
          >
            <MessageCircle />
          </Button>
          <LinkMenu link={link} />
        </ItemActions>
      </Item>
    </LinkPreview>
  );
});
