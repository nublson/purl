"use client";

/* Adapted from Bencho's "Now playing" (bencho.dev), MIT licence: the bar's
   arrangement (a sleeve, the words beside it, a thin track along the foot)
   and its one margin all round. Here the sleeve is the play control; the
   separate play button is the opened player's. */

import { useAudioPlayer } from "@/hooks/use-audio-player";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useIsSelectionActive } from "@/lib/link-selection";
import { useIsMediaMovedOff, useIsMediaOpen } from "@/lib/media-viewer";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/format-duration";
import type { Link } from "@/utils/links";
import { m, type Transition } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { MusicNote } from "reicon-react";
import { HapticTarget } from "./haptic-target";
import { AnchorIf } from "./media-card-face";
import { FACE_LAYOUT_DEPENDENCY, pearlPartLayoutId } from "./media-face-anchor";
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
  rail: 3,
} as const;

/** The opened player's sleeve (the media viewer's `ViewerAudio`), in px. */
export const AUDIO_PLAYER = {
  sleeve: 64,
  sleeveRadius: 12,
} as const;

/**
 * The words' heights (the title's line over the second line's), in px: the
 * bar's 16 + 14, the player's 19 + 15. While the words travel between them
 * they're drawn at the size they left (scaled by this ratio) and grow or
 * shrink to the size they land at: Motion moves their box, never stretches it.
 */
export const WORDS_SCALE = (16 + 14) / (19 + 15);

/**
 * How the card's parts travel back from the player: Motion's own default
 * for a layout animation, which is what the card's box (`MediaAnchor`, no
 * `transition` of its own) morphs back with, so they keep its pace.
 */
const CARD_MORPH: Transition = { duration: 0.45, ease: [0.4, 0, 0.1, 1] };

/**
 * A shared part of a pearl's audio face: the sleeve or the words, the same
 * element to Motion in the card's bar and the viewer's player
 * (`pearlPartLayoutId`), so it travels from one place to the other while the
 * box morphs around it. `layoutDependency` follows the box's: a card's
 * never changes (its re-renders never animate); the player's follows the
 * viewer's Popup.
 */
export type AudioPart = {
  layoutId: string;
  layoutDependency: string;
  /** The player's: the Popup's preset. The card's: `CARD_MORPH`. */
  transition: Transition;
};

/**
 * A Motion transition's timing for the Web Animations API (the words' scale
 * keeps the travel's pace without Motion's animation engine, which stays
 * out of the page's first load).
 */
function waapiTiming(transition: Transition): { duration: number; easing: string } {
  const { duration, ease } = transition as { duration?: number; ease?: unknown };
  return {
    duration: (duration ?? 0.3) * 1000,
    easing:
      Array.isArray(ease) && ease.length === 4 ? `cubic-bezier(${ease.join(", ")})` : "ease-out",
  };
}

/** The part's Motion props: a shared layout element, or nothing at all. */
function partProps(part: AudioPart | undefined, layout: true | "position") {
  return part
    ? {
        layoutId: part.layoutId,
        layoutDependency: part.layoutDependency,
        layout,
        layoutCrossfade: false,
        transition: part.transition,
      }
    : {};
}

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
 * preview's bar and the viewer's player, so they all show one playback.
 *
 * The controls take pointer events inside the owner's card (whose content
 * doesn't), except while selecting, when they step aside (`inert`) and a
 * click anywhere selects the card. With `anchored`, the bar is the box the
 * media viewer morphs out of and back into.
 *
 * The root is a size container, so it's a stacking context: its layers
 * (track 1, menu 2, play 3, badge 4, checkbox 10) stack among themselves,
 * and whoever hosts it lays its own button under it (clicks reach the
 * button where the bar takes no pointer events).
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
  /** The owner's card only: the checkbox in the sleeve's corner, the menu slot. */
  owner?: AudioBarOwner;
  /** The folder badge, on the sleeve's bottom-end corner. */
  badge?: ReactNode;
  describedBy?: string;
}) {
  const { playing, toggle } = useAudioPlayer(link.id, link.duration);
  const reducedMotion = usePrefersReducedMotion();
  // Once the viewer moves off this pearl, its parts step out of the morph
  // until the viewer closes (remounted without their ids, `key`): Motion
  // would otherwise hand them the lead when the player's parts slide away,
  // inside a box it's hiding, and leave them drawn out of place. Back in
  // (remounted with their ids) as the viewer closes: if it closes onto this
  // pearl, they travel back from the player's like the first time.
  const open = useIsMediaOpen(link.id);
  const movedOff = useIsMediaMovedOff(link.id);
  const [steppedOut, setSteppedOut] = useState(false);
  if (anchored && movedOff && !steppedOut) setSteppedOut(true);
  if (!open && steppedOut) setSteppedOut(false);
  // The parts travel only out of the card the viewer opens from (a hover
  // preview's bar is another view of the pearl, never a morph's end), and
  // never under reduced motion.
  const partKey = steppedOut ? "out" : "in";
  const part = (name: "sleeve" | "words"): AudioPart | undefined =>
    anchored && !steppedOut && !reducedMotion
      ? {
          layoutId: pearlPartLayoutId(link.id, name),
          layoutDependency: FACE_LAYOUT_DEPENDENCY,
          transition: CARD_MORPH,
        }
      : undefined;
  const selecting = useIsSelectionActive();
  const src = safeRemoteImgSrc(link.url);
  const swapOut = owner ? sleeveSwapOut(selecting) : undefined;
  const image = Boolean(link.thumbnail && safeRemoteImgSrc(link.thumbnail));

  const secondLine = linkSecondLine(link);
  // An upload's facts shrink to the length; a link's domain just truncates.
  const length =
    link.upload && link.duration != null ? formatDuration(link.duration) : null;

  return (
    <AnchorIf link={link} anchored={anchored}>
      <div data-face="audio" className="@container relative h-[78px] bg-card">
        <div
          // pb: the track's lane under the sleeve (15px, the 3px rail, the
          // margin), so the sleeve sits at the margin like the player's.
          className="flex h-full items-center gap-2.5 p-[10px] pb-7"
        >
          <AudioSleeve
            key={`sleeve-${partKey}`}
            link={link}
            size={AUDIO_BAR.sleeve}
            radius={AUDIO_BAR.sleeveRadius}
            part={part("sleeve")}
            contentClassName={swapOut}
            // The mark takes the music note's place on the tint, except
            // while the card morphs (the player's sleeve shows the note):
            // the note, then the mark fading back once it has landed.
            // (`invisible` too, at rest: it's not there, just under the mark.)
            iconClassName="invisible opacity-0 transition-[opacity,visibility] duration-150 ease-out-strong [[data-pearl-morphing]_&]:visible [[data-pearl-morphing]_&]:opacity-100"
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
                // The mark and its scrim are the card's: they're gone while
                // it morphs, and fade back once it has landed.
                "[[data-pearl-morphing]_&]:opacity-0",
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
          <AudioWords key={`words-${partKey}`} part={part("words")} from={1 / WORDS_SCALE}>
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
          </AudioWords>
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
        {/* `data-card-menu`: a press on the track isn't the card's
            long-press. The track stays at the foot here and lands under the
            words in the player, so it doesn't travel: it's gone while the
            card morphs. */}
        <div
          data-card-menu=""
          inert={selecting}
          className={cn(
            "absolute inset-x-[10px] bottom-[10px] z-[1] transition-opacity duration-150 ease-out-strong [[data-pearl-morphing]_&]:opacity-0",
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
 * The words: the title over its second line, beside the sleeve. As a shared
 * part they travel by position only (`layout="position"`: a box that changes
 * width would stretch the text) and their text scales from the size it left
 * (`from`, uniform) to its own as they go, so 13px grows to 15.5px rather
 * than jumping.
 */
export function AudioWords({
  part,
  from,
  className,
  children,
}: {
  part?: AudioPart;
  /** The text's scale when the travel starts (the size it leaves at, over its own). */
  from: number;
  className?: string;
  children: ReactNode;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const scaling = useRef<Animation | null>(null);
  useEffect(() => () => scaling.current?.cancel(), []);
  return (
    <m.div
      data-words=""
      {...partProps(part, "position")}
      onLayoutAnimationStart={() => {
        const text = textRef.current;
        if (!part || !text || from === 1) return;
        scaling.current?.cancel();
        scaling.current = text.animate(
          [{ transform: `scale(${from})` }, { transform: "none" }],
          waapiTiming(part.transition),
        );
      }}
      className={cn("flex min-w-0 flex-1 flex-col", className)}
    >
      {/* The scale is its own element's: on the travelling one, Motion
          would fold it into its projection. */}
      <div ref={textRef} className="flex min-w-0 origin-top-left flex-col">
        {children}
      </div>
    </m.div>
  );
}

/**
 * The pearl's sleeve: its page's image (`thumbnail`) when it has one, else
 * the Reicon music icon on `bg-muted` (never generated art). `children`
 * lie over it (the owner's checkbox, the folder badge, the play mark); the
 * content swaps out under `contentClassName`. As a shared part (`part`) it
 * travels between the card's bar and the viewer's player, 40 to 64, its
 * corners (set inline, so Motion corrects them; the content inherits them)
 * 6 to 12; `onTravel` is told when it starts.
 */
export function AudioSleeve({
  link,
  size,
  radius,
  part,
  onTravel,
  children,
  contentClassName,
  iconClassName,
}: {
  link: Pick<Link, "thumbnail">;
  size: 40 | 64;
  radius: 6 | 12;
  part?: AudioPart;
  onTravel?: () => void;
  children?: ReactNode;
  contentClassName?: string;
  /** The music note's (shown when there's no image). */
  iconClassName?: string;
}) {
  const src = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = src !== null && failedSrc !== src;

  return (
    <m.div
      data-sleeve={image ? "image" : "icon"}
      {...partProps(part, true)}
      onLayoutAnimationStart={part ? onTravel : undefined}
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
          <MusicNote
            aria-hidden
            className={cn(size === 64 ? "size-7" : "size-5", iconClassName)}
          />
        )}
      </div>
      {children}
    </m.div>
  );
}
