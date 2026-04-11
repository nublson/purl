"use client";

import { useChatContextSafe } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import { Link as LinkType } from "@/utils/links";
import {
  ArrowDownToLine,
  FileMusic,
  FileText,
  MessageCircle,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { X } from "./animate-ui/icons/x";
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

export const LinkItem = React.forwardRef<
  HTMLDivElement,
  {
    link: LinkType;
    preview?: boolean;
    /** First above-the-fold row: eager-load favicon to satisfy LCP when src is large. */
    eagerFavicon?: boolean;
  } & React.ComponentPropsWithoutRef<typeof Item>
>(function LinkItem(
  {
    link,
    className,
    onMouseEnter,
    onMouseLeave,
    preview,
    eagerFavicon,
    ...rest
  },
  ref,
) {
  const chatCtx = useChatContextSafe();
  const router = useRouter();
  const [deletePhase, setDeletePhase] = React.useState<
    "idle" | "animating" | "loading" | "exiting"
  >("idle");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [optimisticIngesting, setOptimisticIngesting] = React.useState(false);
  const hoveringActionsRef = React.useRef(false);
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
      setPreviewOpen(false);
    }, 100);
  }, [clearCloseTimer, clearOpenTimer]);

  React.useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [clearCloseTimer, clearOpenTimer]);

  React.useEffect(() => {
    if (
      link.ingestStatus === "PENDING" ||
      link.ingestStatus === "PROCESSING" ||
      link.ingestStatus === "COMPLETED"
    ) {
      setOptimisticIngesting(false);
    }
  }, [link.ingestStatus]);

  const showIngestPulse =
    optimisticIngesting ||
    link.ingestStatus === "PENDING" ||
    link.ingestStatus === "PROCESSING";

  const disableAddToChat = link.ingestStatus !== "COMPLETED";

  async function handleReingest() {
    setOptimisticIngesting(true);
    try {
      const res = await fetch(`/api/links/${link.id}/reingest`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Re-ingesting…");
        router.refresh();
      } else {
        setOptimisticIngesting(false);
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(data?.error ?? "Failed to re-ingest");
      }
    } catch {
      setOptimisticIngesting(false);
      toast.error("Failed to re-ingest");
    }
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

  const media = (() => {
    switch (link.contentType) {
      case "PDF":
        return <FileText className="size-5" />;
      case "AUDIO":
        return <FileMusic className="size-5" />;
      default:
        return (
          <Image
            src={link.favicon}
            alt={link.title}
            width={20}
            height={20}
            sizes="20px"
            loading={eagerFavicon ? "eager" : undefined}
            className="aspect-square object-contain"
          />
        );
    }
  })();

  const content = (
    <Item
      ref={ref}
      role="listitem"
      aria-busy={showIngestPulse}
      className={cn(
        "w-full p-2 gap-4 grid relative hover:bg-accent/40 data-[state=open]:bg-accent/40 has-data-[state=open]:bg-accent/40",
        showIngestPulse && "animate-pulse",
        preview ? "grid-cols-[20px_1fr]" : "grid-cols-[20px_1fr_auto]",
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
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-0 w-full"
      />
      <ItemMedia variant="image" className={cn("relative size-5 rounded")}>
        {media}
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
      {!preview && (
        <ItemActions
          className="z-10 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100 group-data-[state=open]/item:opacity-100 has-data-[state=open]:opacity-100 transition-opacity duration-200"
          onMouseEnter={() => {
            hoveringActionsRef.current = true;
            clearOpenTimer();
            clearCloseTimer();
            setPreviewOpen(false);
          }}
          onMouseLeave={() => {
            hoveringActionsRef.current = false;
            scheduleOpen();
          }}
        >
          {link.ingestStatus === "FAILED" ? (
            <TooltipWrapper content="Refetch content">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={optimisticIngesting}
                className="cursor-pointer text-muted-foreground [@media(hover:none)]:hidden"
                onClick={() => {
                  void handleReingest();
                }}
              >
                <ArrowDownToLine />
              </Button>
            </TooltipWrapper>
          ) : (
            chatCtx && (
              <TooltipWrapper content="Add to chat">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disableAddToChat}
                  data-add-to-chat=""
                  className="cursor-pointer text-muted-foreground [@media(hover:none)]:hidden"
                  onClick={() => {
                    chatCtx.addMention(link);
                    chatCtx.setIsWidgetOpen(true);
                  }}
                >
                  <MessageCircle />
                </Button>
              </TooltipWrapper>
            )
          )}
          <LinkMenu
            link={link}
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
      link={link}
      eagerThumbnail={Boolean(eagerFavicon)}
      open={!preview && previewOpen}
      onOpenChange={() => {
        // HoverCardTrigger is still present, but we fully control `open` from LinkItem mouse events.
      }}
    >
      {content}
    </LinkPreview>
  );
});
