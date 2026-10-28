"use client";

/* Adapted from Bencho's "Now playing" (bencho.dev), MIT licence: the bar's
   arrangement (a sleeve, the words beside it, play at the end, a thin track
   along the foot) and its one margin all round. */

import { useAudioPlayer } from "@/hooks/use-audio-player";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useIsSelectionActive } from "@/lib/link-selection";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/format-duration";
import type { Link } from "@/utils/links";
import { useState, type MouseEvent, type ReactNode } from "react";
import { MusicNote } from "reicon-react";
import { HapticTarget } from "./haptic-target";
import { AnchorIf } from "./media-card-face";
import { PlayMark } from "./play-mark";
import { Checkbox } from "./ui/checkbox";

/**
 * The bar's measures, in px. One margin (`pad`) all round, so nothing
 * slides inward when the bar opens into the viewer's player.
 */
export const AUDIO_BAR = {
  pad: 10,
  height: 78,
  sleeve: 40,
  sleeveRadius: 6,
  play: 30,
  rail: 3,
} as const;

/** The owner's card: its checkbox in the sleeve's place, its menu after play. */
export type AudioBarOwner = {
  selected: boolean;
  onToggleSelect: (opts: { shiftKey: boolean }) => void;
  /** The card's `<LinkMenu …>`, wrapped as the card does (`data-card-menu`). */
  menu: ReactNode;
};

/**
 * A click inside the bar's controls neither opens the pearl nor reaches the
 * card (the shared card's button lies beside them; a hover preview sits in
 * its row). Only clicks on the controls themselves: React bubbles a
 * portal's events through here too.
 */
function keepClick(event: MouseEvent<HTMLElement>) {
  if (!event.currentTarget.contains(event.target as Node)) return;
  event.preventDefault();
  event.stopPropagation();
}

/**
 * The sleeve gives way to the owner's checkbox on hover (pointer devices)
 * or keyboard focus, and on every card while selecting: it shrinks as it
 * fades while the checkbox settles from larger, the row's favicon swap.
 * Reduced motion keeps the fade only.
 */
function sleeveSwapOut(selecting: boolean) {
  return selecting
    ? "opacity-0 motion-safe:scale-80"
    : "[@media(hover:hover)]:group-hover/card:opacity-0 motion-safe:[@media(hover:hover)]:group-hover/card:scale-80 group-has-[:focus-visible]/sleeve:opacity-0 motion-safe:group-has-[:focus-visible]/sleeve:scale-80";
}

/**
 * An audio pearl's card: a now-playing bar. The sleeve (its page's image,
 * else the music icon), the title over its second line, play at the end
 * and a thin track along the foot, which is the seek control. It's a view
 * of the page's one player (`useAudioPlayer`), like the hover preview's
 * bar and the viewer's player, so they all show one playback.
 *
 * The controls take pointer events inside the owner's card (whose content
 * doesn't), except while selecting, when they step aside (`inert`) and a
 * click anywhere selects the card. With `anchored`, the bar is the box the
 * media viewer morphs out of and back into.
 */
export function AudioBar({
  link,
  anchored = false,
  owner,
  badge,
  compact = false,
  describedBy,
}: {
  link: Link;
  /** The bar is the viewer's `MediaAnchor` (the owner's card, the shared card). */
  anchored?: boolean;
  /** The owner's card only: the checkbox in the sleeve slot, the menu after play. */
  owner?: AudioBarOwner;
  /** The folder badge, on the sleeve's bottom-end corner. */
  badge?: ReactNode;
  /** In a grid: on the phone's narrow cards the second line is just the length. */
  compact?: boolean;
  describedBy?: string;
}) {
  const { playing, toggle } = useAudioPlayer(link.id, link.duration);
  const reducedMotion = usePrefersReducedMotion();
  const selecting = useIsSelectionActive();
  const src = safeRemoteImgSrc(link.url);
  const swapOut = owner ? sleeveSwapOut(selecting) : undefined;

  const secondLine = linkSecondLine(link);
  const length = link.duration != null ? formatDuration(link.duration) : null;

  return (
    <AnchorIf link={link} anchored={anchored} corners="all">
      <div
        data-face="audio"
        // pb: the track's lane under the sleeve (15px, the 3px rail, the
        // margin), so the sleeve sits at the margin like the player's.
        // Phones: 8px gaps, so the 171px card's words still fit the length.
        className="relative flex h-[78px] items-center gap-2.5 bg-card p-[10px] pb-7 phone:gap-2"
      >
        <AudioSleeve
          link={link}
          size={AUDIO_BAR.sleeve}
          radius={AUDIO_BAR.sleeveRadius}
          contentClassName={swapOut}
        >
          {badge ? (
            // The badge's box is the sleeve's, so it rides its corner; it
            // fades with the sleeve when the checkbox shows.
            <span
              className={cn(
                "pointer-events-none absolute inset-0 transition-[opacity,scale] duration-150 ease-out-strong",
                swapOut,
              )}
            >
              {badge}
            </span>
          ) : null}
          {owner ? (
            <>
              <Checkbox
                checked={owner.selected}
                aria-label={`Select ${link.title}`}
                className={cn(
                  // Centred in the sleeve, whose 40px box is its hit area.
                  "pointer-events-auto absolute top-3 left-3 z-10 cursor-pointer bg-background after:-inset-3 transition-[opacity,scale,box-shadow] duration-150 ease-out-strong",
                  selecting
                    ? "opacity-100"
                    : "opacity-0 motion-safe:scale-125 focus-visible:opacity-100 motion-safe:focus-visible:scale-100 [@media(hover:hover)]:group-hover/card:opacity-100 motion-safe:[@media(hover:hover)]:group-hover/card:scale-100",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  owner.onToggleSelect({ shiftKey: event.shiftKey });
                }}
              />
              {/* Touch: the checkbox's tap, with a tick, over the sleeve. */}
              <HapticTarget
                className="pointer-events-auto z-[11]"
                onTap={owner.onToggleSelect}
              />
            </>
          ) : null}
        </AudioSleeve>
        <div data-words className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] leading-4 font-medium text-foreground">
            {link.title}
          </span>
          {/* `text-foreground/70`, like Kbd: `text-muted-foreground` on the
              card's tint is under 4.5:1 for small text in light mode. */}
          <span className="truncate text-[11px] leading-[14px] text-foreground/70">
            {compact && length && length !== secondLine ? (
              <>
                <span className="phone:hidden">{secondLine}</span>
                <span className="hidden phone:inline">{length}</span>
              </>
            ) : (
              secondLine
            )}
          </span>
        </div>
        {/* `data-card-menu`: a press here isn't the card's long-press. */}
        <div
          data-card-menu=""
          inert={selecting}
          className={cn(
            "relative z-[1] flex shrink-0",
            selecting ? "pointer-events-none" : "pointer-events-auto",
          )}
          onClick={keepClick}
        >
          <button
            type="button"
            data-play=""
            disabled={!src}
            aria-pressed={playing}
            aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
            aria-describedby={describedBy}
            className="relative flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background outline-none transition-[scale] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-[7px]"
            onClick={() => {
              if (src) toggle(src);
            }}
          >
            <PlayMark playing={playing} size={12} reducedMotion={reducedMotion} />
          </button>
        </div>
        {owner ? (
          // Its own 32px slot, always there, so nothing reflows when the
          // menu shows (the card reveals it: on hover, always on touch).
          <div
            className={cn(
              "relative z-[1] flex size-8 shrink-0",
              selecting ? "pointer-events-none" : "pointer-events-auto",
            )}
          >
            {owner.menu}
          </div>
        ) : null}
        <div
          data-card-menu=""
          inert={selecting}
          className={cn(
            "absolute inset-x-[10px] bottom-[10px] z-[1]",
            selecting ? "pointer-events-none" : "pointer-events-auto",
          )}
          onClick={keepClick}
        >
          <AudioTrack link={link} />
        </div>
      </div>
    </AnchorIf>
  );
}

/**
 * The track: a 3px rail with the played run, and a transparent range over
 * it (16px tall, 44px to the touch) that seeks, keyboard-operable; its
 * focus rings the rail. Used at the bar's foot and under the player's
 * words.
 */
export function AudioTrack({ link, className }: { link: Link; className?: string }) {
  const { elapsed, length, failed, seek } = useAudioPlayer(link.id, link.duration);
  const src = safeRemoteImgSrc(link.url);
  const time = length
    ? `${formatDuration(elapsed)} / ${formatDuration(length)}`
    : formatDuration(elapsed);
  const played = length ? Math.min(1, Math.max(0, elapsed / length)) : 0;

  return (
    <div
      className={cn(
        "relative h-[3px] rounded-full bg-foreground/12 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring",
        className,
      )}
    >
      <div
        data-run=""
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-foreground"
        style={{ width: `${played * 100}%` }}
      />
      <input
        type="range"
        min={0}
        max={length ?? 0}
        step="any"
        value={Math.min(elapsed, length ?? 0)}
        // A file that failed stays put until its play is pressed again.
        disabled={!src || !length || failed}
        aria-label={`Seek ${link.title}`}
        aria-valuetext={time}
        className="absolute inset-x-0 top-1/2 m-0 h-4 w-full -translate-y-1/2 cursor-pointer appearance-none opacity-0 disabled:cursor-default pointer-coarse:h-11"
        onChange={(event) => {
          if (src) seek(src, Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}

/**
 * The pearl's sleeve: its page's image (`thumbnail`) when it has one, else
 * the Reicon music icon on `bg-muted` (never generated art). `children`
 * lie over it (the owner's checkbox, the folder badge); the content swaps
 * out under `contentClassName`.
 */
export function AudioSleeve({
  link,
  size,
  radius,
  children,
  contentClassName,
}: {
  link: Pick<Link, "thumbnail">;
  size: 40 | 64;
  radius: 6 | 12;
  children?: ReactNode;
  contentClassName?: string;
}) {
  const src = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = src !== null && failedSrc !== src;

  return (
    <div
      data-sleeve={image ? "image" : "icon"}
      className="group/sleeve relative shrink-0"
      style={{ width: size, height: size }}
    >
      <div
        data-sleeve-content=""
        className={cn(
          "absolute inset-0 flex items-center justify-center overflow-hidden bg-muted text-muted-foreground transition-[opacity,scale] duration-150 ease-out-strong",
          contentClassName,
        )}
        // Inline, so Motion can keep the corners round while it scales.
        style={{ borderRadius: radius }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-controlled media URLs; avoid next/image optimizer SSRF
          <img
            // A server-rendered image can fail before React attaches onError.
            ref={(img) => {
              if (img?.complete && img.naturalWidth === 0) setFailedSrc(src);
            }}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="strict-origin-when-cross-origin"
            className="size-full object-cover"
            onError={() => setFailedSrc(src)}
          />
        ) : (
          <MusicNote aria-hidden className={size === 64 ? "size-7" : "size-5"} />
        )}
      </div>
      {children}
    </div>
  );
}
