"use client";

import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import {
  AudioHeroIcon,
  TRANSPORT_GAP,
  TRANSPORT_SIDE_NARROW,
} from "@/components/audio-player";
import { cardAspectRatio } from "@/lib/link-kind";
import { ARRIVE } from "@/lib/motion";
import { titleFromFileName } from "@/utils/media-title";
import type { PendingUpload } from "@/lib/pending-upload";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Image as ImageIcon, MusicNote, Refresh, Video, X } from "reicon-react";
import { Typography } from "@/components/typography";

/** What a failed item's buttons do (Retry keeps its slot; Dismiss drops it). */
export type PendingUploadActions = {
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
};

type Props = { item: PendingUpload } & PendingUploadActions;

const KIND_ICON = { image: ImageIcon, video: Video, audio: MusicNote } as const;

function KindIcon({
  kind,
  className,
}: {
  kind: PendingUpload["kind"];
  className?: string;
}) {
  const Icon = KIND_ICON[kind];
  return <Icon aria-hidden className={className} />;
}

/**
 * The local preview: an image as itself; a video's file as a paused first
 * frame until its poster (an image) arrives; else the kind's icon.
 */
function LocalPreview({
  src,
  kind,
  className,
  iconClassName,
}: {
  src: string;
  kind: PendingUpload["kind"];
  className?: string;
  iconClassName?: string;
}) {
  const [as, setAs] = useState<"img" | "video" | "icon">("img");
  if (as === "icon") return <KindIcon kind={kind} className={iconClassName} />;
  if (as === "video") {
    return (
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        aria-hidden
        className={className}
        onError={() => setAs("icon")}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a local object URL
    <img
      src={src}
      alt=""
      decoding="async"
      className={className}
      // A video's own file isn't an image: show it as a video instead.
      onError={() => setAs(kind === "video" ? "video" : "icon")}
    />
  );
}

/** The upload's progress as a ring; steady and quiet (HomeShell announces). */
function ProgressRing({ progress }: { progress: number }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, progress)) / 100);
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6 -rotate-90"
    >
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        className="stroke-foreground/15"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="stroke-foreground transition-[stroke-dashoffset] duration-150 ease-linear motion-reduce:transition-none"
      />
    </svg>
  );
}

function FailedActions({
  item,
  onRetry,
  onDismiss,
  compact = false,
}: Props & { compact?: boolean }) {
  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "secondary"}
        size="sm"
        // Compact (a row): a 44px target to the touch, like the row's ⋯.
        className={
          compact
            ? "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5"
            : undefined
        }
        aria-label={`Retry uploading ${item.name}`}
        onClick={() => onRetry(item.id)}
      >
        <Refresh aria-hidden />
        Retry
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon-sm" : "sm"}
        // Compact (a row): a 44px target to the touch, like the row's ⋯.
        className={
          compact
            ? "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5"
            : undefined
        }
        aria-label={`Dismiss ${item.name}`}
        onClick={() => onDismiss(item.id)}
      >
        <X aria-hidden />
        {compact ? null : "Dismiss"}
      </Button>
    </>
  );
}

/**
 * A file uploading, in the grid: its local preview at the pearl's ratio, a
 * progress ring in the top-right corner (an audio file: the player's shape,
 * `PendingAudioCard`). Failed: a scrim with Retry and Dismiss.
 */
const FAILED_MESSAGE = "Couldn\u2019t upload";

export function PendingUploadCard({ item, onRetry, onDismiss }: Props) {
  if (item.kind === "audio") {
    return <PendingAudioCard item={item} onRetry={onRetry} onDismiss={onDismiss} />;
  }
  const failed = item.status === "failed";
  const title = titleFromFileName(item.name);
  const message = item.message ?? FAILED_MESSAGE;
  return (
    <div
      aria-busy={failed ? undefined : true}
      data-cy="pending-upload"
      data-status={item.status}
      className={cn("relative flex flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10", ARRIVE)}
    >
      <div
        className="relative grid w-full place-items-center overflow-hidden bg-muted text-muted-foreground"
        style={{ aspectRatio: cardAspectRatio(item) }}
      >
        {item.previewUrl ? (
          <LocalPreview
            key={item.previewUrl}
            src={item.previewUrl}
            kind={item.kind}
            className="absolute inset-0 size-full object-cover"
            iconClassName="size-6"
          />
        ) : (
          <KindIcon kind={item.kind} className="size-6" />
        )}
      </div>
      <span className="sr-only">{failed ? `${title}, ${message}` : title}</span>
      {failed ? (
        // A 90% scrim over the user's own image: `text-foreground` on it stays
        // over 15:1 above a black photo; muted text on 80% fell to 3:1.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 p-3 text-center backdrop-blur-sm">
          <Typography component="p" aria-hidden className="text-sm text-foreground">
            {message}
          </Typography>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <FailedActions item={item} onRetry={onRetry} onDismiss={onDismiss} />
          </div>
        </div>
      ) : (
        <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background/80 backdrop-blur-sm">
          <ProgressRing progress={item.progress} />
        </span>
      )}
    </div>
  );
}

/**
 * An audio file uploading, in the grid: the shape of the player it becomes
 * (`AudioPlayer`): the hero's tint with the progress ring where the music
 * icon will be, its title over "Uploading…", the empty rail and the
 * transport's shape, so the pearl takes its slot without a jump. Failed: a
 * scrim with the reason, Retry and Dismiss.
 */
function PendingAudioCard({ item, onRetry, onDismiss }: Props) {
  const failed = item.status === "failed";
  const title = titleFromFileName(item.name);
  const message = item.message ?? FAILED_MESSAGE;
  return (
    <div
      aria-busy={failed ? undefined : true}
      data-cy="pending-upload"
      data-status={item.status}
      className={cn("@container/player relative flex flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10", ARRIVE)}
    >
      <div
        aria-hidden
        className="relative h-[180px] w-full shrink-0 @max-[199px]/player:aspect-square @max-[199px]/player:h-auto"
      >
        <AudioHeroIcon>
          <ProgressRing progress={item.progress} />
        </AudioHeroIcon>
        <div className="absolute inset-x-0 bottom-0 h-[120px] bg-linear-to-b from-transparent via-card/90 via-35% to-card" />
        <div className="absolute inset-x-0 bottom-0 flex min-w-0 flex-col p-4">
          <span
            title={item.name}
            className="line-clamp-2 text-base leading-[1.375] font-medium wrap-anywhere text-foreground @max-[199px]/player:text-sm"
          >
            {title}
          </span>
          <span className="truncate text-[13px] leading-[1.385] text-foreground/70">
            Uploading…
          </span>
        </div>
      </div>
      {/* The player's empty rail, times band and transport. */}
      {/* The player's controls; on the cover tile (under 200px) its empty
          progress line along the foot instead. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 hidden h-[3px] bg-foreground/45 @max-[199px]/player:block"
      />
      <div aria-hidden className="@container flex flex-col p-4 @max-[199px]/player:hidden">
        <span className="h-[3px] rounded-full bg-foreground/45" />
        <span className="mt-2 h-3" />
        <span className={cn("mt-4 flex h-[46px] items-center justify-center", TRANSPORT_GAP)}>
          <span
            className={cn("size-[34px] rounded-full border border-border", TRANSPORT_SIDE_NARROW)}
          />
          <span className="size-[46px] rounded-full bg-foreground/12" />
          <span className="size-[34px] rounded-full border border-border" />
        </span>
      </div>
      <span className="sr-only">{failed ? `${title}, ${message}` : title}</span>
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 p-3 text-center backdrop-blur-sm">
          <Typography component="p" aria-hidden className="text-sm text-foreground">
            {message}
          </Typography>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <FailedActions item={item} onRetry={onRetry} onDismiss={onDismiss} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A file uploading, in the list: its preview in the favicon's slot, its name,
 * "42%" on the right where a row's ⋯ sits. Failed: Retry and Dismiss there.
 */
export function PendingUploadRow({ item, onRetry, onDismiss }: Props) {
  const failed = item.status === "failed";
  const title = titleFromFileName(item.name);
  const message = item.message ?? FAILED_MESSAGE;
  return (
    <Item
      aria-busy={failed ? undefined : true}
      data-cy="pending-upload"
      data-status={item.status}
      className={cn(
        "relative grid h-12 grid-cols-[20px_1fr_auto] gap-4 border-0 p-2 max-md:h-14 max-md:grid-cols-[24px_1fr_auto]",
        ARRIVE,
      )}
    >
      <ItemMedia
        variant="image"
        // Where LinkItem's favicon sits, so the pearl's row doesn't jump.
        className="size-5 translate-y-0.5 overflow-hidden rounded text-muted-foreground max-md:size-6"
      >
        {item.previewUrl ? (
          <LocalPreview
            key={item.previewUrl}
            src={item.previewUrl}
            kind={item.kind}
            className="size-full object-cover"
            iconClassName="size-4"
          />
        ) : (
          <KindIcon kind={item.kind} className="size-4" />
        )}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="block w-full">
          <Typography component="p"
            // The pearl's title (no extension), as the row will read once it
            // lands; the full file name (and a failure's reason, which a narrow
            // row truncates) in the tooltip.
            title={failed ? `${item.name}: ${message}` : item.name}
            className={cn(
              "truncate text-sm font-normal text-muted-foreground max-md:text-base",
              !failed && "animate-pulse",
            )}
          >
            {title}
            {failed ? (
              <>
                <span aria-hidden> · </span>
                <span>{message}</span>
              </>
            ) : null}
          </Typography>
        </ItemTitle>
      </ItemContent>
      {failed ? (
        // Room on touch for Dismiss's 6px hit extension beside Retry.
        <div className="flex items-center gap-1 pointer-coarse:gap-3">
          <FailedActions
            item={item}
            onRetry={onRetry}
            onDismiss={onDismiss}
            compact
          />
        </div>
      ) : (
        // Steady, tabular figures, so the number never jitters.
        <span
          aria-hidden
          className="flex min-w-8 items-center justify-end text-sm text-muted-foreground tabular-nums max-md:text-base"
        >
          {item.progress}%
        </span>
      )}
    </Item>
  );
}
