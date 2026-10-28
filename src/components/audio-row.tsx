"use client";

import { useAudioPlayer } from "@/hooks/use-audio-player";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
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
 * An audio row's icon slot: the icon (`children`) at rest; while the pearl
 * is loaded (playing or paused), the drawn play/pause mark in its place, at
 * the slot's size (20px, 24px on phones) in the icon's color (playing: the
 * pause shape). Decorative (`data-row-mark`): the row's button says it.
 */
export function AudioRowIcon({
  link,
  children,
}: {
  link: Link;
  children: React.ReactNode;
}) {
  const { active, playing } = useAudioPlayer(link.id, link.duration);
  const reducedMotion = usePrefersReducedMotion();
  if (!active) return <>{children}</>;
  return (
    <span
      data-row-mark={playing ? "pause" : "play"}
      aria-hidden
      className="flex size-5 shrink-0 items-center justify-center max-md:size-6 [&>svg]:size-full"
    >
      <PlayMark playing={playing} size={24} reducedMotion={reducedMotion} />
    </span>
  );
}
