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
 * A click inside the bar's controls neither opens the pearl nor reaches the
 * card (the shared card's button lies under them; a hover preview sits in
 * its row). Only clicks on the controls themselves: React bubbles a
 * portal's events through here too.
 */
function keepClick(event: MouseEvent<HTMLElement>) {
  if (!event.currentTarget.contains(event.target as Node)) return;
  event.preventDefault();
  event.stopPropagation();
}

/**
 * The sleeve gives way to the owner's checkbox while selecting, and on a
 * wide bar on hover with a pointer or the checkbox's keyboard focus: it
 * shrinks as it fades while the checkbox settles from larger, the row's
 * favicon swap. A narrow bar's sleeve is its play control, so on hover it
 * stays, with the checkbox in its corner. Never at rest on touch. Reduced
 * motion keeps the fade only.
 */
function sleeveSwapOut(selecting: boolean) {
  return selecting
    ? "opacity-0 motion-safe:scale-80"
    : "[@media(hover:hover)]:@min-[240px]:group-hover/card:opacity-0 motion-safe:[@media(hover:hover)]:@min-[240px]:group-hover/card:scale-80 group-has-[[data-slot=checkbox]:focus-visible]/sleeve:opacity-0 motion-safe:group-has-[[data-slot=checkbox]:focus-visible]/sleeve:scale-80";
}

/**
 * An audio pearl's card: a now-playing bar. The sleeve (its page's image,
 * else the music icon), the title over its second line, play at the end
 * and a thin track along the foot, which is the seek control. Narrow (under
 * 240px of the bar's own width, `@max-[240px]:`, a container query, so the
 * server's HTML is right: every grid card; the hover preview is wide), the
 * sleeve itself is the play button, the second line is just the length
 * and the gaps are 8px. It's a view of the page's one player (`useAudioPlayer`),
 * like the hover preview's bar and the viewer's player, so they all show
 * one playback.
 *
 * The controls take pointer events inside the owner's card (whose content
 * doesn't), except while selecting, when they step aside (`inert`) and a
 * click anywhere selects the card. With `anchored`, the bar is the box the
 * media viewer morphs out of and back into.
 *
 * The root is a size container, so it's a stacking context: its layers
 * (track 1, menu 2, play 3, checkbox 10) stack among themselves, and
 * whoever hosts it lays its own button under it (clicks reach the button
 * where the bar takes no pointer events).
 */
export function AudioBar({
  link,
  anchored = false,
  owner,
  badge,
  describedBy,
}: {
  link: Link;
  /** The bar is the viewer's `MediaAnchor` (the owner's card, the shared card). */
  anchored?: boolean;
  /** The owner's card only: the checkbox in the sleeve slot, the menu after play. */
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
  const label = `${playing ? "Pause" : "Play"} ${link.title}`;
  const image = Boolean(link.thumbnail && safeRemoteImgSrc(link.thumbnail));

  const secondLine = linkSecondLine(link);
  const length = link.duration != null ? formatDuration(link.duration) : null;

  return (
    <AnchorIf link={link} anchored={anchored} corners="all">
      <div data-face="audio" className="@container relative h-[78px] bg-card">
        <div
          // pb: the track's lane under the sleeve (15px, the 3px rail, the
          // margin), so the sleeve sits at the margin like the player's.
          className="flex h-full items-center gap-2.5 p-[10px] pb-7 @max-[240px]:gap-2"
        >
          <AudioSleeve
            link={link}
            size={AUDIO_BAR.sleeve}
            radius={AUDIO_BAR.sleeveRadius}
            contentClassName={cn(swapOut, "@max-[240px]:[&>svg]:hidden")}
          >
            {/* Narrow: the sleeve is the play button, the mark drawn on its
                tint (or on a scrim over its image), 44px to the touch. A
                long-press here still selects the card. */}
            <button
              type="button"
              data-play=""
              disabled={!src}
              inert={selecting}
              aria-pressed={playing}
              aria-label={label}
              aria-describedby={describedBy}
              className={cn(
                "absolute inset-0 z-[3] hidden cursor-pointer items-center justify-center text-foreground outline-none transition-[opacity,scale] duration-150 ease-out-strong focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100 @max-[240px]:flex [-webkit-touch-callout:none] pointer-coarse:after:absolute pointer-coarse:after:-inset-[2px]",
                image && "bg-background/60",
                selecting ? "pointer-events-none" : "pointer-events-auto",
                swapOut,
              )}
              style={{ borderRadius: AUDIO_BAR.sleeveRadius }}
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
                    "absolute top-3 left-3 z-10 cursor-pointer bg-background after:-inset-3 transition-[opacity,scale,box-shadow] duration-150 ease-out-strong",
                    selecting
                      ? "pointer-events-auto opacity-100"
                      : // At rest it takes no taps (on touch the sleeve plays
                        // or opens); a pointer's hover shows it: in the
                        // sleeve's place on a wide bar, in the sleeve's
                        // corner on a narrow one (the sleeve is play), like
                        // an image card's.
                        "pointer-events-none opacity-0 motion-safe:scale-125 focus-visible:opacity-100 motion-safe:focus-visible:scale-100 [@media(hover:hover)]:group-hover/card:pointer-events-auto [@media(hover:hover)]:group-hover/card:opacity-100 motion-safe:[@media(hover:hover)]:group-hover/card:scale-100 @max-[240px]:-top-0.5 @max-[240px]:-left-0.5 @max-[240px]:shadow-sm @max-[240px]:after:-inset-1",
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
          <div data-words className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] leading-4 font-medium text-foreground">
              {link.title}
            </span>
            {/* `text-foreground/70`, like Kbd: `text-muted-foreground` on the
                card's tint is under 4.5:1 for small text in light mode.
                Narrow: just the length, when there's one. */}
            <span className="truncate text-[11px] leading-[14px] text-foreground/70">
              {length && length !== secondLine ? (
                <>
                  <span className="@max-[240px]:hidden">{secondLine}</span>
                  <span className="hidden @max-[240px]:inline">{length}</span>
                </>
              ) : (
                secondLine
              )}
            </span>
          </div>
          {/* `data-card-menu`: a press here isn't the card's long-press.
              Above the menu and the track: play wins where their touch
              areas meet. Narrow: gone (the sleeve plays). */}
          <div
            data-card-menu=""
            inert={selecting}
            className={cn(
              "relative z-[3] flex shrink-0 @max-[240px]:hidden",
              selecting ? "pointer-events-none" : "pointer-events-auto",
            )}
            onClick={keepClick}
          >
            <button
              type="button"
              data-play=""
              disabled={!src}
              aria-pressed={playing}
              aria-label={label}
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
                "relative z-[2] flex size-8 shrink-0",
                selecting ? "pointer-events-none" : "pointer-events-auto",
              )}
            >
              {owner.menu}
            </div>
          ) : null}
        </div>
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
    </AnchorIf>
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
