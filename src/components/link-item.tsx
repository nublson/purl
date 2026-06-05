"use client";

import { useChatContextSafe } from "@/hooks/use-chat-context";
import { usePreferences } from "@/hooks/use-preferences";
import { cn } from "@/lib/utils";
import { Link as LinkType } from "@/utils/links";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { X } from "./animate-ui/icons/x";
import { LinkIcon } from "./link-icon";
import { LinkMenu } from "./link-menu";
import { LinkPreview } from "./link-preview";
import { LinkItemSkeleton } from "./skeletons";
import { TooltipWrapper } from "./tooltip-wrapper";
import { Button } from "./ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "./ui/item";
import { Spinner } from "./ui/spinner";

interface LinkItemProps {
  link: LinkType;
  eagerFavicon?: boolean;
  mode?: "default" | "preview" | "search";
}

export const LinkItem = React.forwardRef<
  HTMLDivElement,
  LinkItemProps & React.ComponentPropsWithoutRef<typeof Item>
>(function LinkItem(
  {
    link,
    className,
    onMouseEnter,
    onMouseLeave,
    mode = "default",
    eagerFavicon,
    ...rest
  },
  ref,
) {
  const chatCtx = useChatContextSafe();
  const router = useRouter();
  const { preferences } = usePreferences();

  const lastLinkIdRef = React.useRef(link.id);
  const [displayIngestStatus, setDisplayIngestStatus] = React.useState<
    LinkType["ingestStatus"]
  >(() => link.ingestStatus);

  React.useEffect(() => {
    if (lastLinkIdRef.current !== link.id) {
      lastLinkIdRef.current = link.id;
      setDisplayIngestStatus(link.ingestStatus);
      return;
    }
    setDisplayIngestStatus((prev) => {
      const incoming = link.ingestStatus;
      if (
        (prev === "FAILED" || prev === "SKIPPED") &&
        (incoming === "PENDING" || incoming === "PROCESSING")
      ) {
        return prev;
      }
      return incoming;
    });
  }, [link.id, link.ingestStatus]);

  const linkForUi = React.useMemo(
    () => ({ ...link, ingestStatus: displayIngestStatus }),
    [link, displayIngestStatus],
  );

  const [deletePhase, setDeletePhase] = React.useState<
    "idle" | "animating" | "loading" | "exiting"
  >("idle");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const hoveringActionsRef = React.useRef(false);
  const hoveringPreviewRef = React.useRef(false);
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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
      if (!hoveringPreviewRef.current) setPreviewOpen(false);
    }, 100);
  }, [clearCloseTimer, clearOpenTimer]);

  React.useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearCloseTimer, clearOpenTimer]);

  const showIngestPulse =
    displayIngestStatus === "PENDING" || displayIngestStatus === "PROCESSING";

  function renderLoadingOrChatAction(): React.ReactNode {
    if (
      displayIngestStatus === "PENDING" ||
      displayIngestStatus === "PROCESSING"
    ) {
      return <Spinner className="size-4" />;
    }

    if (!chatCtx) return null;
    return (
      <TooltipWrapper content="Add to chat">
        <Button
          aria-label="Add to chat"
          type="button"
          variant="ghost"
          size="icon-sm"
          data-add-to-chat=""
          className="cursor-pointer text-muted-foreground"
          onClick={() => {
            chatCtx.addMention(linkForUi);
            if (preferences.showChatWidget === false) {
              router.push("/ai");
              return;
            }
            chatCtx.setIsWidgetOpen(true);
          }}
        >
          <MessageCircle />
        </Button>
      </TooltipWrapper>
    );
  }

  if (deletePhase === "loading" || deletePhase === "exiting") {
    return (
      <LinkItemSkeleton
        icon={<X className="size-5" animate={true} loop={true} />}
        url={link.url}
        animateIn={deletePhase === "loading"}
        animateOut={deletePhase === "exiting"}
        onAnimationEnd={() => {
          if (deletePhase !== "exiting") return;
          router.refresh();
        }}
      />
    );
  }

  const content = (
    <Item
      ref={ref}
      data-cy="link-item"
      role="listitem"
      aria-busy={showIngestPulse}
      className={cn(
        "w-full p-2 gap-4 grid relative hover:bg-accent/40 data-[state=open]:bg-accent/40 has-data-[state=open]:bg-accent/40",
        showIngestPulse && "animate-pulse",
        mode === "preview"
          ? "grid-cols-[20px_1fr]"
          : "grid-cols-[20px_1fr_auto]",
        deletePhase === "animating" &&
          "pointer-events-none animate-out fade-out-0 slide-out-to-left-2 duration-200",
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
      onAnimationEnd={() => {
        if (deletePhase !== "animating") return;
        setDeletePhase("loading");
      }}
      {...rest}
    >
      <a
        href={link.url}
        aria-label={link.title}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-0 w-full"
      />
      <ItemMedia variant="image" className={cn("relative size-5 rounded")}>
        <LinkIcon link={link} size="default" eagerFavicon={eagerFavicon} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <p
            data-cy="link-title"
            className="text-accent-foreground text-sm font-medium line-clamp-1 break-all"
          >
            {link.title}
          </p>
          <p
            data-cy="link-domain"
            className="text-muted-foreground text-sm font-normal hidden md:block"
          >
            {link.domain}
          </p>
        </ItemTitle>
      </ItemContent>
      {mode !== "preview" && (
        <ItemActions
          className="z-10 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100 group-data-[state=open]/item:opacity-100 has-data-[state=open]:opacity-100 transition-opacity duration-200"
          onMouseEnter={() => {
            hoveringActionsRef.current = true;
            clearOpenTimer();
            clearCloseTimer();
          }}
          onMouseLeave={() => {
            hoveringActionsRef.current = false;
            scheduleOpen();
          }}
        >
          {renderLoadingOrChatAction()}
          <LinkMenu
            link={linkForUi}
            onDeleteStart={() => {
              setDeletePhase("animating");
            }}
            onDeleteSuccess={() => {
              setDeletePhase("exiting");
            }}
            onDeleteError={() => {
              setDeletePhase("idle");
            }}
          />
        </ItemActions>
      )}
    </Item>
  );

  return (
    <LinkPreview
      link={linkForUi}
      eagerThumbnail={Boolean(eagerFavicon)}
      open={mode === "default" && previewOpen}
      onOpenChange={() => {
        // HoverCardTrigger is still present, but we fully control `open` from LinkItem mouse events.
      }}
      onPreviewMouseEnter={() => {
        hoveringPreviewRef.current = true;
        clearCloseTimer();
      }}
      onPreviewMouseLeave={() => {
        hoveringPreviewRef.current = false;
        scheduleClose();
      }}
    >
      {content}
    </LinkPreview>
  );
});
