"use client";

import { useAudioPlayer } from "@/hooks/use-audio-player";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/format-duration";
import type { Link } from "@/utils/links";
import * as React from "react";
import { PlayMark } from "./play-mark";

/**
 * An audio row's main element, in the place of a row's link: a button over
 * the whole row that plays and pauses the pearl, named "Play <title>" /
 * "Pause <title>" (`data-audio-toggle`; the keyboard delete's
 * `siblingsSelector` finds it). The row decides what a click does while
 * selecting or after a long-press (`onClick` returns true when it took the
 * click).
 */
export const AudioRowToggle = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<"button">, "onClick"> & {
    link: Link;
    /** The row's own handling first (a long-press, selecting): true takes the click. */
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => boolean;
  }
>(function AudioRowToggle({ link, onClick, ...rest }, ref) {
  const { playing, toggle } = useAudioPlayer(link.id, link.duration);
  const src = safeRemoteImgSrc(link.url);
  return (
    <button
      ref={ref}
      type="button"
      data-audio-toggle=""
      aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
      aria-disabled={src ? undefined : true}
      {...rest}
      onClick={(event) => {
        if (onClick?.(event)) return;
        if (src) toggle(src);
      }}
    />
  );
});

/**
 * An audio row's second line: `linkSecondLine` at rest; while the pearl is
 * loaded (playing or paused), the elapsed over the length ("0:22 / 2:36").
 */
export function AudioRowSecondLine({ link }: { link: Link }) {
  const { active, elapsed, length } = useAudioPlayer(link.id, link.duration);
  if (!active) return <>{linkSecondLine(link)}</>;
  const total = length ?? link.duration;
  return (
    <span className="tabular-nums">
      {total != null
        ? `${formatDuration(elapsed)} / ${formatDuration(total)}`
        : formatDuration(elapsed)}
    </span>
  );
}

/**
 * The play/pause mark at an audio row's end, while the pearl is loaded
 * (playing or paused); nothing otherwise. Its row shows it always, not on
 * hover (`data-row-play`); 32px, 44px to the touch.
 */
export function AudioRowPlay({
  link,
  className,
}: {
  link: Link;
  className?: string;
}) {
  const { active, playing, toggle } = useAudioPlayer(link.id, link.duration);
  const reducedMotion = usePrefersReducedMotion();
  const src = safeRemoteImgSrc(link.url);
  if (!active || !src) return null;
  return (
    <button
      type="button"
      data-row-play=""
      aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
      className={cn(
        "relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] motion-reduce:active:scale-100 after:absolute after:-inset-1.5",
        className,
      )}
      onClick={() => toggle(src)}
    >
      <PlayMark playing={playing} size={16} reducedMotion={reducedMotion} />
    </button>
  );
}
