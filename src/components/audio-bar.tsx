"use client";

/* Adapted from Bencho's "Now playing" (bencho.dev), MIT licence: the bar's
   arrangement (a sleeve, the words beside it, a thin track along the foot)
   and its one margin all round. Here the sleeve is the play control; the
   separate play button is the opened player's. */

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
import { PlayMark } from "./play-mark";
import { Checkbox } from "./ui/checkbox";

/**
 * The bar's measures, in px. One margin (`pad`) all round, so nothing
 * slides inward when the bar opens into the player.
 */
export const AUDIO_BAR = {
  pad: 10,
  height: 78,
  sleeve: 40,
  sleeveRadius: 6,
  rail: 3,
} as const;

/** The owner's card: its checkbox on the sleeve, its menu after the words. */
export type AudioBarOwner = {
  selected: boolean;
  /** The checkbox's click (mouse, keyboard): toggles, no haptic. */
  onToggleSelect: (opts: { shiftKey: boolean }) => void;
  /** A touch tap on the checkbox while selecting (`HapticTarget`): with a haptic. */
  onTapSelect: (opts: { shiftKey: boolean }) => void;
  /** True once when this click ends a long-press (which already selected). */
  consumeLongPress: () => boolean;
  /** The card's `<LinkMenu …>`, wrapped as the card does (`data-card-menu`). */
  menu: ReactNode;
};

/**
 * A click inside the bar's controls never reaches the card (a click on the
 * owner's card selects it while selecting; a hover preview sits in its
 * row). Only clicks on the controls themselves: React bubbles a portal's
 * events through here too.
 */
function keepClick(event: MouseEvent<HTMLElement>) {
  if (!event.currentTarget.contains(event.target as Node)) return;
  event.preventDefault();
  event.stopPropagation();
}

/**
 * While selecting, the sleeve gives way to the owner's checkbox: it shrinks
 * as it fades while the checkbox settles from larger, the row's favicon
 * swap. Reduced motion keeps the fade only.
 */
function sleeveSwapOut(selecting: boolean) {
  return selecting ? "opacity-0 motion-safe:scale-80" : undefined;
}

/**
 * An audio pearl's card: a now-playing bar. The sleeve (its page's image,
 * else the tint) is the play control, with the drawn play/pause mark on
 * it; beside it the title over its second line; the owner's menu after
 * them; and a thin track along the foot, which is the seek control. Under
 * 200px of the bar's own width (`@max-[200px]:`, a container query, so the
 * server's HTML is right) an upload's second line is just its length. It's
 * a view of the page's one player (`useAudioPlayer`), like the hover
 * preview's bar and the list's row, so they all show one playback. An
 * audio pearl never opens the media viewer.
 *
 * The controls take pointer events inside the owner's card (whose content
 * doesn't), except while selecting, when they step aside (`inert`) and a
 * click anywhere selects the card.
 *
 * The root is a size container, so it's a stacking context: its layers
 * (track 1, menu 2, play 3, badge 4, checkbox 10) stack among themselves,
 * and whoever hosts it lays its own button under it (clicks reach the
 * button where the bar takes no pointer events).
 */
export function AudioBar({
  link,
  owner,
  badge,
  describedBy,
}: {
  link: Link;
  /** The owner's card only: the checkbox in the sleeve's corner, the menu slot. */
  owner?: AudioBarOwner;
  /** The folder badge, on the sleeve's bottom-end corner. */
  badge?: ReactNode;
  describedBy?: string;
}) {
  const { playing, toggle } = useAudioPlayer(link.id, link.duration);
  const reducedMotion = usePrefersReducedMotion();
  const selecting = useIsSelectionActive();
  const src = safeRemoteImgSrc(link.url);
  const swapOut = owner ? sleeveSwapOut(selecting) : undefined;
  const image = Boolean(link.thumbnail && safeRemoteImgSrc(link.thumbnail));

  const secondLine = linkSecondLine(link);
  // An upload's facts shrink to the length; a link's domain just truncates.
  const length =
    link.upload && link.duration != null ? formatDuration(link.duration) : null;

  return (
    <div data-face="audio" className="@container relative h-[78px] bg-card">
      <div
        // pb: the track's lane under the sleeve (15px, the 3px rail, the
        // margin), so the sleeve sits at the margin like the player's.
        className="flex h-full items-center gap-2.5 p-[10px] pb-7"
      >
        <AudioSleeve
          link={link}
          size={AUDIO_BAR.sleeve}
          radius={AUDIO_BAR.sleeveRadius}
          // The mark takes the music note's place on the tint.
          contentClassName={cn(swapOut, "[&>svg]:hidden")}
        >
          {/* The sleeve is the play button: the mark on its tint, or on a
              scrim over its image; 44px to the touch. Above the menu and
              the track, so it wins where their touch areas meet. A
              long-press here still selects the card. */}
          <button
            type="button"
            data-play=""
            disabled={!src}
            inert={selecting}
            aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
            aria-describedby={describedBy}
            className={cn(
              "absolute inset-0 z-[3] flex cursor-pointer items-center justify-center rounded-[inherit] text-foreground outline-none transition-[opacity,scale] duration-150 ease-out-strong focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100 [-webkit-touch-callout:none] pointer-coarse:after:absolute pointer-coarse:after:-inset-[2px]",
              image && "bg-background/60",
              selecting ? "pointer-events-none" : "pointer-events-auto",
              swapOut,
            )}
            onClick={(event) => {
              keepClick(event);
              if (owner?.consumeLongPress()) return;
              if (src) toggle(src);
            }}
          >
            <PlayMark playing={playing} size={16} reducedMotion={reducedMotion} />
          </button>
          {badge ? (
            // The badge's box is the sleeve's, so it rides its corner; it
            // fades with the sleeve when the checkbox takes its place.
            <span
              className={cn(
                "pointer-events-none absolute inset-0 z-[4] transition-[opacity,scale] duration-150 ease-out-strong",
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
                  "absolute z-10 cursor-pointer bg-background transition-[opacity,scale,box-shadow] duration-150 ease-out-strong",
                  selecting
                    ? // In the sleeve's place, its 40px box the hit area.
                      "pointer-events-auto top-3 left-3 opacity-100 after:-inset-3"
                    : // In the sleeve's corner, like an image card's: shown
                      // on hover with a pointer (the sleeve stays play) or
                      // keyboard focus; at rest it takes no taps.
                      "pointer-events-none -top-0.5 -left-0.5 opacity-0 shadow-sm after:-inset-1 motion-safe:scale-125 focus-visible:opacity-100 motion-safe:focus-visible:scale-100 [@media(hover:hover)]:group-hover/card:pointer-events-auto [@media(hover:hover)]:group-hover/card:opacity-100 motion-safe:[@media(hover:hover)]:group-hover/card:scale-100",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  owner.onToggleSelect({ shiftKey: event.shiftKey });
                }}
              />
              {/* Touch, while selecting: the checkbox's tap, with a tick,
                  over the sleeve. */}
              {selecting ? (
                <HapticTarget
                  className="pointer-events-auto z-[11]"
                  onTap={owner.onTapSelect}
                />
              ) : null}
            </>
          ) : null}
        </AudioSleeve>
        <div data-words="" className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] leading-4 font-medium text-foreground">
            {link.title}
          </span>
          {/* `text-foreground/70`, like Kbd: `text-muted-foreground` on the
              card's tint is under 4.5:1 for small text in light mode. */}
          <span className="truncate text-[11px] leading-[14px] text-foreground/70">
            {length && length !== secondLine ? (
              <>
                <span className="@max-[200px]:hidden">{secondLine}</span>
                <span className="hidden @max-[200px]:inline">{length}</span>
              </>
            ) : (
              secondLine
            )}
          </span>
        </div>
        {owner ? (
          // Its own 32px slot, always there, so nothing reflows when the
          // menu shows (the card reveals it: on hover, always on touch).
          <div
            className={cn(
              "relative z-[2] flex size-8 shrink-0",
              selecting ? "pointer-events-none" : "pointer-events-auto",
            )}
          >
            {owner.menu}
          </div>
        ) : null}
      </div>
      {/* `data-card-menu`: a press on the track isn't the card's long-press. */}
      <div
        data-card-menu=""
        inert={selecting}
        className={cn(
          "absolute inset-x-[10px] bottom-[10px] z-[1]",
          selecting ? "pointer-events-none" : "pointer-events-auto",
        )}
        onClick={keepClick}
      >
        {/* To the touch, the range runs from the bar's bottom edge 40px
            up (under play's and the menu's areas, which lie above it). */}
        <AudioTrack
          link={link}
          rangeClassName="pointer-coarse:top-auto pointer-coarse:-bottom-[10px] pointer-coarse:h-10 pointer-coarse:translate-y-0"
        />
      </div>
    </div>
  );
}

/**
 * The track: a 3px rail with the played run, and a transparent range over
 * it (16px tall; the bar gives it 40px to the touch) that seeks,
 * keyboard-operable; its focus rings the rail. Used at the bar's foot and
 * under the player's words.
 */
export function AudioTrack({
  link,
  className,
  rangeClassName,
}: {
  link: Link;
  className?: string;
  /** The range's own box (the bar anchors its touch area to its foot). */
  rangeClassName?: string;
}) {
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
        className={cn(
          "absolute inset-x-0 top-1/2 m-0 h-4 w-full -translate-y-1/2 cursor-pointer appearance-none opacity-0 disabled:cursor-default",
          rangeClassName,
        )}
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
 * lie over it (the owner's checkbox, the folder badge, the play mark); the
 * content swaps out under `contentClassName`. Its corners are the root's
 * (inline), which the content and the play button inherit.
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
      className="relative shrink-0"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <div
        data-sleeve-content=""
        className={cn(
          "absolute inset-0 flex items-center justify-center overflow-hidden rounded-[inherit] bg-muted text-muted-foreground transition-[opacity,scale] duration-150 ease-out-strong",
          contentClassName,
        )}
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
