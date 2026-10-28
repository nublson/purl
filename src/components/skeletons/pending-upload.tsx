"use client";

import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { AUDIO_BAR, AudioSleeve } from "@/components/audio-bar";
import { cardAspectRatio } from "@/lib/link-kind";
import { titleFromFileName } from "@/utils/media-title";
import type { PendingUpload } from "@/lib/pending-upload";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Image as ImageIcon, MusicNote, Refresh, Video, X } from "reicon-react";

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
        className="stroke-foreground transition-[stroke-dashoffset] duration-150 ease-out motion-reduce:transition-none"
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
 * progress ring in the top-right corner (an audio file: the bar's shape,
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
      className="relative flex flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 animate-in fade-in-0 duration-300"
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
          <p aria-hidden className="text-sm text-foreground">
            {message}
          </p>
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
 * An audio file uploading, in the grid: the shape of the bar it becomes
 * (`AudioBar`): the icon sleeve, its title over "Uploading…", the
 * progress ring where play sits on a wide bar, and the empty rail. Failed: a scrim with the reason,
 * Retry and Dismiss.
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
      className="relative overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 animate-in fade-in-0 duration-300"
    >
      <div aria-hidden className="flex h-[78px] items-center gap-2.5 p-[10px] pb-7">
        <AudioSleeve
          link={{ thumbnail: null }}
          size={AUDIO_BAR.sleeve}
          radius={AUDIO_BAR.sleeveRadius}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            title={item.name}
            className="truncate text-[13px] leading-4 font-medium text-foreground"
          >
            {title}
          </span>
          <span className="truncate text-[11px] leading-[14px] text-foreground/70">
            Uploading…
          </span>
        </div>
        <span className="grid size-[30px] shrink-0 place-items-center">
          <ProgressRing progress={item.progress} />
        </span>
      </div>
      {/* The bar's empty rail along the foot. */}
      <span
        aria-hidden
        className="absolute inset-x-[10px] bottom-[10px] h-[3px] rounded-full bg-foreground/12"
      />
      <span className="sr-only">{failed ? `${title}, ${message}` : title}</span>
      {failed ? (
        // The bar is short: the reason on one line, the compact actions.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/90 p-2 text-center backdrop-blur-sm">
          <p aria-hidden title={message} className="max-w-full truncate text-xs text-foreground">
            {message}
          </p>
          <div className="flex items-center justify-center gap-1 pointer-coarse:gap-3">
            <FailedActions item={item} onRetry={onRetry} onDismiss={onDismiss} compact />
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
      className="relative grid h-12 grid-cols-[20px_1fr_auto] gap-4 border-0 p-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 max-md:h-14 max-md:grid-cols-[24px_1fr_auto]"
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
          <p
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
          </p>
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
