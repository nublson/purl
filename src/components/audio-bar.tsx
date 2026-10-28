"use client";

/* Adapted from Bencho's "Now playing" (bencho.dev), MIT licence: the bar's
   arrangement (a sleeve, the words beside it, a thin track along the foot),
   its one margin all round, and how it expands in place into the player:
   one tween, every size derived from it, the late parts, the swell on the
   close, the outside press. Here the shut bar's sleeve is the play control;
   the opened player's transport has its own. */

import { useAudioPlayer } from "@/hooks/use-audio-player";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useAudioExpanded } from "@/lib/audio-expansion";
import { isOverlayOpen, isTypingTarget } from "@/lib/keyboard";
import { useIsSelectionActive } from "@/lib/link-selection";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/format-duration";
import type { Link } from "@/utils/links";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Export5, MusicNote, Restart } from "reicon-react";
import { clamp, FLAT, mix, QUART, useTween } from "./audio-player-tween";
import { HapticTarget } from "./haptic-target";
import { PlayMark } from "./play-mark";
import { Checkbox } from "./ui/checkbox";

/* ── ONE margin, both states ───────────────────────────────
   Not one per state: a margin that changed would make the
   sleeve, the track and the transport all slide inward as the
   thing opened — a fourth motion nobody asked for, on top of
   the three that are the point. The object grows; its frame
   does not move.

   The sleeve is square, so one number is its width and its
   height at each end — and opened it is the number the whole
   stack below is measured from. */
const PAD = 10;
const ART = { s: [40, 64], r: [6, 12] } as const;
/* 78: the track needs a band of its own at the foot. */
const SHUT = 78;

/* ── the opened stack, measured from the sleeve down ───────
   Each gap is the distance from the thing above it, and the
   opened HEIGHT falls out of the sum rather than being a
   number somebody kept in step by hand. Change the sleeve and
   the rail, the times, the transport and the foot all follow.

   The bar needs none of this: it is one row and a track, and
   both are placed off the same margin. */
const RAIL_GAP = 22;
const CLOCK_GAP = 8;
const OPS_GAP = 16;
const RAIL_H = 3;
const CLOCK_H = 10;
const LEAD = 46; /* the play button, opened */

const RAIL_Y = PAD + ART.s[1] + RAIL_GAP;
const OPS_Y = RAIL_Y + RAIL_H + CLOCK_GAP + CLOCK_H + OPS_GAP + LEAD / 2;
/* the transport's own bottom, and one more margin under it */
const OPEN = Math.round(OPS_Y + LEAD / 2 + PAD);

/* How long the shape takes to change, either way. */
const MORPH_MS = 460;
/* The menu slot's side (the owner's `⋯`), and the gap before it. */
const MENU = 32;
const WORDS_GAP = 10;
/* The card's corner (`rounded-lg`, `MEDIA_RADIUS`). */
const CARD_RADIUS = 10;

/**
 * The bar's measures, in px. One margin (`pad`) all round, so nothing
 * slides inward when the bar opens into the player (`open` tall).
 */
export const AUDIO_BAR = {
  pad: PAD,
  height: SHUT,
  open: OPEN,
  sleeve: ART.s[0],
  sleeveRadius: ART.r[0],
  rail: RAIL_H,
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
 * The late parts under reduced motion, on the way in: the shape jumps, so
 * they fade (150ms) instead of riding the tween. Not on the way out: the
 * box is already 78px, and they'd fade over the title.
 */
const LATE_REDUCED =
  "motion-reduce:transition-[opacity,visibility] motion-reduce:duration-150 motion-reduce:ease-out";

/**
 * The bar's host: its card frame (the owner's, the shared folder's) or its
 * row. What a press outside the open bar is measured against, and what the
 * close's swell scales (`--audio-swell`, read by `LINK_CARD_FRAME`).
 */
const HOST = '[data-cy="link-card"], [data-cy="link-item"]';

/** The opened player's side buttons (Restart, Open file): 34px, outlined, 44px to the touch. */
const SIDE_BUTTON =
  "relative flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-foreground/70 outline-none transition-[background-color,color,scale] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-[5px]";

/**
 * An audio pearl's card: a now-playing bar that expands in place into its
 * player. Shut (78px): the sleeve (its page's image, else the tint) is the
 * play control, with the drawn play/pause mark on it; beside it the title
 * over its second line; the owner's menu after them; and a thin track along
 * the foot, which is the seek control. Under 200px of the bar's own width
 * (`@max-[200px]:`, a container query, so the server's HTML is right) an
 * upload's second line is just its length.
 *
 * A press on the bar away from its controls (the invisible `data-expand`
 * button: the whole bar shut, the sleeve-and-words row open) opens it, to
 * 189px: one tween `p` drives every size and position (nothing here has a
 * transition of its own), the sleeve grows to 64px with the words beside
 * it, the track moves to 22px under the sleeve, and the times and the
 * transport (Restart, Play, Open file) arrive late, into a shape that has
 * stopped growing; the sleeve's mark fades as the transport's Play takes
 * over. Esc, or a press outside its card, closes it; one bar is open at a
 * time (`audioExpansion`). Its height is its card's, so the masonry grid
 * follows it (`data-masonry-grow`: the cards below move down, none changes
 * column). Reduced motion: it jumps, and the late parts fade (150ms).
 * `expandable={false}` (the hover preview) keeps it a bar.
 *
 * It's a view of the page's one player (`useAudioPlayer`), like the hover
 * preview's bar and the list's row, so they all show one playback; opening
 * never changes playback. An audio pearl never opens the media viewer.
 *
 * The controls take pointer events inside the owner's card (whose content
 * doesn't), except while selecting, when they step aside (`inert`) and a
 * click anywhere selects the card.
 *
 * The root is a size container, so it's a stacking context: its layers
 * (the opener 0, track 1, menu 2, play 3, badge 4, checkbox 10) stack
 * among themselves, and whoever hosts it lays its own surface under it
 * (clicks reach it where the bar takes no pointer events).
 */
export function AudioBar({
  link,
  owner,
  badge,
  describedBy,
  expandable = true,
  expandRef,
  onExpandFocus,
}: {
  link: Link;
  /** The owner's card only: the checkbox in the sleeve's corner, the menu slot. */
  owner?: AudioBarOwner;
  /** The folder badge, on the sleeve's bottom-end corner. */
  badge?: ReactNode;
  describedBy?: string;
  /** False: a bar only (the hover preview): no opener, no tween. */
  expandable?: boolean;
  /** The opener (`data-expand`): the card's or row's focus anchor. */
  expandRef?: (el: HTMLButtonElement | null) => void;
  /** Focus on the opener (a row opens its preview for keyboard users). */
  onExpandFocus?: (event: FocusEvent<HTMLButtonElement>) => void;
}) {
  const { playing, elapsed, length: playLength, toggle, restart } = useAudioPlayer(
    link.id,
    link.duration,
  );
  const reducedMotion = usePrefersReducedMotion();
  const selecting = useIsSelectionActive();
  const expansion = useAudioExpanded(link.id);
  const open = expandable && expansion.open;
  const closeExpansion = expansion.close;
  const src = safeRemoteImgSrc(link.url);
  const swapOut = owner ? sleeveSwapOut(selecting) : undefined;
  const image = Boolean(link.thumbnail && safeRemoteImgSrc(link.thumbnail));
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  // The last press that started inside the bar, portals included (its menu).
  const insidePress = useRef<Event | null>(null);

  const setOpener = useCallback(
    (el: HTMLButtonElement | null) => {
      openerRef.current = el;
      expandRef?.(el);
    },
    [expandRef],
  );

  /* 0 shut, 1 open. Tweened once, read everywhere. */
  const p = useTween(open ? 1 : 0, MORPH_MS, reducedMotion, QUART);

  /* ── the swell, and why it is a SECOND number ────────────
     The bounce is not put back into `p`: `p` stays monotonic
     and the composition stays internally consistent at every
     frame. What bounces is the whole object, uniformly — a
     scale takes the box, the sleeve, the corners and the type
     together, so nothing can get out of step with anything
     else.

     It rides its own LINEAR clock rather than `p`, because
     `p` is quart-out and near its end for most of the move —
     a swell read off it would spike in the first two frames
     and be flat for the rest. And the peak is pushed late
     (^1.5 puts it at 0.63) so the object gathers on the way
     and releases as it lands, which is what reads as a bounce
     rather than as a pulse. Zero at BOTH ends by construction.

     ── ON THE CLOSE ONLY ────────────────────────────────────
     Opening already HAS its event: the box goes from 78 to
     189 and that is the whole thing you are meant to watch. A
     scale on top of it is a second size change running at the
     same time in the same direction. Closing is the opposite
     problem: most of it simply stops existing, so the dip
     gives it a gather to go with it — subtractive, working
     WITH the shrink rather than against it. */
  const u = useTween(open ? 1 : 0, MORPH_MS, reducedMotion, FLAT);
  const swell = Math.sin(Math.PI * clamp(u, 0, 1) ** 1.5);
  const zoom = open || reducedMotion ? 1 : 1 - 0.035 * swell;

  /* The object is the card, so the dip is the card's: its frame, ring and
     ground with it, not just what's inside. A variable can't climb from
     here to the host, so it's written there (`transform`, which composes
     with the frame's own press `scale` and its transition); unset, the
     frame's `transform` is none, so no other card gains a stacking
     context. The masonry measures the box, not the scale. */
  useLayoutEffect(() => {
    if (zoom === 1) return;
    const host = rootRef.current?.closest<HTMLElement>(HOST);
    if (!host) return;
    host.style.setProperty("--audio-swell", `scale(${zoom})`);
    return () => {
      host.style.removeProperty("--audio-swell");
    };
  }, [zoom]);

  /* Everything below is derived, never stored. A second piece
     of state describing the same transformation is a second
     thing that can be out of step with the first. */
  const h = mix(SHUT, OPEN, p);
  const sleeve = mix(ART.s[0], ART.s[1], p);
  /* the deep half of the morph, for the things that only
     exist opened. Held back to the last 40% so they arrive
     into a shape that has stopped growing rather than sliding
     about inside one that has not. */
  const late = clamp((p - 0.6) / 0.4, 0, 1);
  const railTop = mix(SHUT - PAD - RAIL_H, RAIL_Y, p);
  const wordsLeft = mix(PAD + ART.s[0] + WORDS_GAP, PAD + ART.s[1] + WORDS_GAP, p);
  const wordsRight = PAD + (owner ? MENU + WORDS_GAP : 0);

  const secondLine = linkSecondLine(link);
  // An upload's facts shrink to the length; a link's domain just truncates.
  const length =
    link.upload && link.duration != null ? formatDuration(link.duration) : null;

  // Gone (deleted, filtered out, the page left): it doesn't stay open.
  useEffect(() => {
    if (!expandable) return;
    return () => closeExpansion();
  }, [expandable, closeExpansion]);

  /* ── outside closes it ───────────────────────────────────
     Only while it is open, and only for a press that started
     outside its card. `pointerdown` rather than click: a press
     that begins outside and drifts in is still somebody
     reaching past this player, and waiting for the click lets
     it land on whatever is underneath first. A press in the
     bar's own menu (a portal, outside its box in the DOM, but
     inside it in React's tree) is inside. */
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      /* isTrusted: only a real hand dismisses this, never a
         scripted pointer bubbling to the document. */
      if (!event.isTrusted || event === insidePress.current) return;
      const root = rootRef.current;
      const host = root?.closest(HOST) ?? root;
      if (host && !host.contains(event.target as Node)) closeExpansion();
    };
    /* the next tick, or the press that opened it closes it */
    const id = window.setTimeout(
      () => document.addEventListener("pointerdown", away),
      0,
    );
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", away);
    };
  }, [open, closeExpansion]);

  // Esc closes it: from inside it (focus back on its opener, since the
  // transport goes inert), or from the page, unless a field or an overlay
  // (a menu, a dialog) has the key.
  // Not while selecting: Esc clears the selection then (the bar is inert).
  useEffect(() => {
    if (!open || selecting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const root = rootRef.current;
      const inside = root !== null && root.contains(document.activeElement);
      if (!inside && (isTypingTarget(event.target) || isOverlayOpen())) return;
      closeExpansion();
      if (inside) {
        event.preventDefault();
        event.stopPropagation();
        openerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, selecting, closeExpansion]);

  return (
    <div
      ref={rootRef}
      data-face="audio"
      data-open={p > 0 || undefined}
      // The part of its height that's a growth in place: the masonry keeps
      // every card in its column while it grows.
      data-masonry-grow={expandable ? h - SHUT : undefined}
      className="@container relative overflow-hidden bg-card"
      style={{ height: h }}
      onPointerDownCapture={(event) => {
        insidePress.current = event.nativeEvent;
      }}
    >
      {expandable ? (
        /* ── the one thing you press to change shape ───────
           Invisible, and it is the WHOLE bar when shut — the
           track's band at the foot is part of the object, and
           a bar that only answers along the row its sleeve is
           in has a dead third nobody can see the edge of.

           Opened, it is the sleeve and the words only, so a
           player you have opened does not collapse because
           you reached for the title.

           Declared BEFORE the controls on purpose: they paint
           on top, and have to win a press that lands on both. */
        <button
          ref={setOpener}
          type="button"
          data-expand=""
          inert={selecting}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${link.title}`}
          aria-describedby={describedBy}
          className={cn(
            "absolute z-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset [-webkit-touch-callout:none]",
            selecting ? "pointer-events-none" : "pointer-events-auto",
          )}
          style={{
            left: mix(0, PAD, p),
            top: mix(0, PAD, p),
            right: mix(0, PAD, p),
            /* every pixel of the bar, and the sleeve's own height
               once it is open */
            height: mix(SHUT, ART.s[1], p),
            borderRadius: mix(CARD_RADIUS, ART.r[1], p),
          }}
          onFocus={onExpandFocus}
          onClick={(event) => {
            keepClick(event);
            if (owner?.consumeLongPress()) return;
            expansion.toggle();
          }}
        />
      ) : null}
      <div
        className="pointer-events-none absolute"
        style={{ left: PAD, top: PAD }}
      >
        <AudioSleeve
          link={link}
          size={sleeve}
          radius={mix(ART.r[0], ART.r[1], p)}
          contentClassName={swapOut}
          // On the bar the mark takes the music note's place on the tint;
          // opened, the note comes back as the mark fades.
          iconOpacity={late}
        >
          {/* The shut bar's sleeve is the play button: the mark on its
              tint, or on a scrim over its image; 44px to the touch. Above
              the menu and the track, so it wins where their touch areas
              meet. A long-press here still selects the card. Opened, the
              transport's Play takes over: the mark fades with `late`. */}
          <button
            type="button"
            data-play=""
            disabled={!src}
            inert={selecting || open}
            // Opened, the transport's Play is the one there is.
            aria-hidden={open || undefined}
            aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
            className={cn(
              "absolute inset-0 z-[3] flex cursor-pointer items-center justify-center rounded-[inherit] text-foreground outline-none transition-[opacity,scale] duration-150 ease-out-strong focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100 [-webkit-touch-callout:none] pointer-coarse:after:absolute pointer-coarse:after:-inset-[2px]",
              selecting || open ? "pointer-events-none" : "pointer-events-auto",
              swapOut,
            )}
            onClick={(event) => {
              keepClick(event);
              if (owner?.consumeLongPress()) return;
              if (src) toggle(src);
            }}
          >
            <span
              data-mark=""
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded-[inherit]",
                image && "bg-background/60",
              )}
              style={{ opacity: 1 - late }}
            >
              <PlayMark playing={playing} size={16} reducedMotion={reducedMotion} />
            </span>
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
                    ? // In the sleeve's place (centred), a 40px hit area.
                      "pointer-events-auto inset-0 m-auto opacity-100 after:-inset-3"
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
      </div>
      {/* Level with the sleeve, and centred BY it: same top, same
          height, and the words centre themselves inside that — beside
          it at BOTH ends; the type grows with the sleeve. */}
      <div
        data-words=""
        className="pointer-events-none absolute flex min-w-0 flex-col justify-center"
        style={{ left: wordsLeft, right: wordsRight, top: PAD, height: sleeve }}
      >
        {/* One line on the bar; two beside the opened sleeve (from
            halfway, when there's room for them). */}
        <span
          className={cn(
            "font-medium text-foreground",
            p < 0.5 ? "truncate" : "line-clamp-2 break-words",
          )}
          style={{ fontSize: mix(13, 15.5, p), lineHeight: `${mix(16, 19, p)}px` }}
        >
          {link.title}
        </span>
        {/* `text-foreground/70`, like Kbd: `text-muted-foreground` on the
            card's tint is under 4.5:1 for small text in light mode. */}
        <span
          className="truncate text-foreground/70"
          style={{ fontSize: mix(11, 12, p), lineHeight: `${mix(14, 15, p)}px` }}
        >
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
        // menu shows (the card reveals it: on hover, always on touch);
        // level with the sleeve's middle, like the words.
        <div
          className={cn(
            "absolute z-[2] flex size-8",
            selecting ? "pointer-events-none" : "pointer-events-auto",
          )}
          style={{ right: PAD, top: PAD + sleeve / 2 - MENU / 2 }}
        >
          {owner.menu}
        </div>
      ) : null}
      {/* ── the track ───────────────────────────────────────
          Inset by the same margin as everything else, at the foot
          shut and 22px under the sleeve opened: one margin, so its
          ends never move. `data-card-menu`: a press on it isn't the
          card's long-press. */}
      <div
        data-card-menu=""
        inert={selecting}
        className={cn(
          "absolute inset-x-[10px] z-[1]",
          selecting ? "pointer-events-none" : "pointer-events-auto",
        )}
        style={{ top: railTop }}
        onClick={keepClick}
      >
        <AudioTrack
          link={link}
          rangeClassName={
            open
              ? // 44px to the touch, centred on the rail: clear of the
                // sleeve above and the transport below.
                "pointer-coarse:h-11"
              : // To the touch, the range runs from the bar's bottom edge
                // 40px up (under play's and the menu's areas, which lie
                // above it).
                "pointer-coarse:top-auto pointer-coarse:-bottom-[10px] pointer-coarse:h-10 pointer-coarse:translate-y-0"
          }
        />
      </div>
      {expandable ? (
        <>
          {/* The TIMES belong to the opened player only: they ride
              `late`, under the rail. Plain text, not a live region: the
              range's value says the same. */}
          <div
            data-times=""
            aria-hidden={!open || undefined}
            className={cn(
              "pointer-events-none absolute inset-x-[10px] flex items-center justify-between text-[11px] leading-none text-foreground/70 tabular-nums",
              open && LATE_REDUCED,
            )}
            style={{
              top: railTop + RAIL_H + CLOCK_GAP,
              height: CLOCK_H,
              opacity: late,
              visibility: late > 0 ? undefined : "hidden",
            }}
          >
            <span data-elapsed="">{formatDuration(elapsed)}</span>
            <span data-remaining="">
              {playLength ? `−${formatDuration(Math.max(0, playLength - elapsed))}` : null}
            </span>
          </div>
          {/* ── the transport ───────────────────────────────────
              It belongs to the opened player alone, so it rides
              `late`, arriving after the box has stopped growing,
              and takes its hit area with it rather than sitting
              invisible over the bar. On the foot of the box, so it
              is never cut off while it fades in. */}
          <div
            data-transport=""
            inert={!open || selecting}
            aria-hidden={!open || undefined}
            className={cn(
              // The gap gives way on the narrowest cards (a 116px row).
              "absolute inset-x-[10px] flex items-center justify-center gap-[clamp(4px,(100cqw-134px)/2,14px)]",
              open && LATE_REDUCED,
              late > 0.9 && !selecting ? "pointer-events-auto" : "pointer-events-none",
            )}
            style={{
              top: h - PAD - LEAD,
              height: LEAD,
              opacity: late,
              visibility: late > 0 ? undefined : "hidden",
            }}
          >
            <button
              type="button"
              disabled={!src || (elapsed === 0 && !playing)}
              aria-label={`Restart ${link.title}`}
              className={SIDE_BUTTON}
              onClick={(event) => {
                keepClick(event);
                restart();
              }}
            >
              <Restart className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={!src}
              aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
              className="flex size-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background outline-none transition-[scale] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100"
              onClick={(event) => {
                keepClick(event);
                if (src) toggle(src);
              }}
            >
              <PlayMark playing={playing} size={18} reducedMotion={reducedMotion} />
            </button>
            {/* A real link, like the row menu's item: Cmd/Ctrl-click and
                the browser's own link handling work as on any link. */}
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open file"
              className={SIDE_BUTTON}
              onClick={(event) => event.stopPropagation()}
            >
              <Export5 className="size-4" aria-hidden />
            </a>
          </div>
        </>
      ) : null}
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
  iconOpacity = 1,
}: {
  link: Pick<Link, "thumbnail">;
  /** px: 40 on the bar, 64 opened, anything between while it grows. */
  size: number;
  radius: number;
  children?: ReactNode;
  contentClassName?: string;
  /** The music icon's opacity (0: hidden), when the sleeve has no image. */
  iconOpacity?: number;
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
          <MusicNote
            aria-hidden
            // 20px on the 40px sleeve, 28px on the 64px one.
            style={{
              width: 20 + ((size - 40) * 8) / 24,
              height: 20 + ((size - 40) * 8) / 24,
              opacity: iconOpacity,
              visibility: iconOpacity > 0 ? undefined : "hidden",
            }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
