"use client";

import { setLinksRead } from "@/lib/link-read-state";
import { EASE_OUT_STRONG } from "@/lib/motion";
import {
  closeSwipeRow,
  setOpenSwipeRow,
  SWIPE_OPEN_X,
  SWIPE_READ_AT,
  swipeAxis,
  swipeOffset,
  swipeRelease,
  swipeRevealed,
  useOpenSwipeRow,
} from "@/lib/swipe-row";
import { cn } from "@/lib/utils";
import type { Link as LinkType } from "@/utils/links";
import { Check, CircleDot, FolderInput, Trash } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react";
import * as React from "react";
import { LINK_FOLDER_LIST, LinkFolderItems } from "./link-folder-submenu";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/**
 * A swipe button showing (it has room, and the row is held or open) or
 * not, so closing fades them out at once instead of under the returning
 * row: from half size and clear,
 * a transition so a quick back-and-forth retargets instead of restarting.
 */
const buttonReveal = (shown: boolean) =>
  cn(
    "transition-[opacity,scale] duration-200 ease-out-strong",
    shown ? "scale-100 opacity-100" : "pointer-events-none scale-50 opacity-0",
    // Reduced motion: they fade, without growing.
    "motion-reduce:scale-100",
  );

/**
 * A link row's swipe actions, on phones (`enabled`). The row follows the
 * finger sideways (vertical drags scroll the list as usual):
 * - right, released past `SWIPE_READ_AT`: toggles read, then springs back.
 *   The indicator behind it fills in once letting go would act.
 * - left: reveals Delete (outer) then Move, and rests open past halfway.
 *   Tapping the row, scrolling, or swiping another row closes it.
 *
 * A swipe never opens the link: the click that follows it is swallowed.
 * Everything here is also in the row menu and the selection bar.
 */
export function LinkSwipeRow({
  link,
  read,
  enabled,
  leaving,
  onDelete,
  onSwipeStart,
  children,
}: {
  link: LinkType;
  read: boolean;
  enabled: boolean;
  /** The row is fading out (deleted, moved away): the actions fade with it. */
  leaving: boolean;
  onDelete: () => void;
  /**
   * A swipe took the finger: the row's long-press must stop now, since the
   * row won't see this touch's later moves or its release (captured here).
   */
  onSwipeStart: () => void;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const transform = useTransform(x, (value) => `translateX(${value}px)`);
  const reduceMotion = useReducedMotion();
  const isOpen = useOpenSwipeRow() === link.id;
  // Off its resting place: clip the row's box (the content slides out of it).
  const [away, setAway] = React.useState(false);
  const [side, setSide] = React.useState<"read" | "actions" | null>(null);
  const [revealed, setRevealed] = React.useState<0 | 1 | 2>(0);
  const [armed, setArmed] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const gestureRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    base: number;
    axis: "x" | "y" | null;
  } | null>(null);
  // A swipe just ended: the click it may produce must not open the link.
  const swipedRef = React.useRef(false);
  const moveOpenRef = React.useRef(false);

  useMotionValueEvent(x, "change", (raw) => {
    // The spring's last fraction of a pixel counts as rest.
    const value = Math.abs(raw) < 0.5 ? 0 : raw;
    // Back at rest (and no finger on it): nothing to clip or show.
    if (value === 0 && !gestureRef.current) setAway(false);
    setSide(value > 0 ? "read" : value < 0 ? "actions" : null);
    setRevealed(swipeRevealed(value));
    setArmed(value >= SWIPE_READ_AT);
  });

  const settle = React.useCallback(
    (target: number) => {
      animate(
        x,
        target,
        reduceMotion
          ? { duration: 0.15, ease: EASE_OUT_STRONG }
          : { type: "spring", duration: 0.35, bounce: 0 },
      );
    },
    [x, reduceMotion],
  );

  // Closed from elsewhere (another row swiped, a tap outside, a scroll):
  // back to rest, unless a finger is on this row.
  React.useEffect(() => {
    if (!isOpen && !gestureRef.current && x.get() < 0) settle(0);
  }, [isOpen, settle, x]);

  // Selection mode (or a desktop-sized window) turns swiping off, even
  // mid-gesture: a long-press that selects the row ends the swipe, so a
  // selected row is never also dragged.
  React.useEffect(() => {
    if (enabled) return;
    gestureRef.current = null;
    closeSwipeRow(link.id);
    if (x.get() !== 0) settle(0);
  }, [enabled, link.id, settle, x]);

  React.useEffect(() => () => closeSwipeRow(link.id), [link.id]);

  // While open: a touch anywhere else, or a scroll, closes it.
  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (moveOpenRef.current) return;
      if (rootRef.current?.contains(event.target as Node)) return;
      closeSwipeRow(link.id);
    };
    const onScroll = () => {
      if (!moveOpenRef.current) closeSwipeRow(link.id);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen, link.id]);

  // Not the row itself: its action buttons, or a portal (the Move menu,
  // the row menu), whose React events still bubble through this tree.
  const notTheRow = (target: EventTarget | null) =>
    Boolean(actionsRef.current?.contains(target as Node)) ||
    !rootRef.current?.contains(target as Node);

  const release = (cancelled: boolean) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.axis !== "x") return;
    if (cancelled) {
      settle(gesture.base);
      if (gesture.base === 0) closeSwipeRow(link.id);
      return;
    }
    const outcome = swipeRelease(x.get());
    if (outcome === "open") {
      setOpenSwipeRow(link.id);
      settle(SWIPE_OPEN_X);
      return;
    }
    closeSwipeRow(link.id);
    settle(0);
    if (outcome === "read") void setLinksRead([link.id], !read);
  };

  return (
    <div
      ref={rootRef}
      // pan-y: vertical drags stay the browser's (scrolling); sideways ones
      // reach the handlers below.
      className={cn(
        "relative rounded-md",
        // Held (a finger on it, or resting open): one hairline edge around
        // the whole component, row and buttons, drawn above the sliding
        // row so it stays continuous. It fades with the row's fill, so the
        // two leave together during the spring back instead of the edge
        // cutting off when the row arrives.
        enabled &&
          "touch-pan-y after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-md after:opacity-0 after:ring-1 after:ring-border after:transition-opacity after:duration-150 after:ease-out-strong after:ring-inset",
        enabled && isOpen && "after:opacity-100",
        away && "overflow-hidden",
      )}
      onPointerDown={(event) => {
        swipedRef.current = false;
        if (!enabled || event.pointerType !== "touch") return;
        if (notTheRow(event.target)) return;
        x.stop();
        gestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          base: x.get(),
          axis: null,
        };
      }}
      onPointerMove={(event) => {
        const gesture = gestureRef.current;
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        if (!enabled) {
          gestureRef.current = null;
          return;
        }
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (gesture.axis === null) {
          gesture.axis = swipeAxis(dx, dy);
          if (gesture.axis === "y") {
            gestureRef.current = null;
            return;
          }
          if (gesture.axis === null) return;
          // A swipe: this row takes the finger (and any other row closes).
          event.currentTarget.setPointerCapture(event.pointerId);
          onSwipeStart();
          swipedRef.current = true;
          setAway(true);
          setOpenSwipeRow(link.id);
        }
        x.set(swipeOffset(gesture.base + dx, { fromOpen: gesture.base < 0 }));
      }}
      onPointerUp={() => release(false)}
      onPointerCancel={() => release(true)}
      onClickCapture={(event) => {
        if (notTheRow(event.target)) return;
        // The click a swipe produced, or a tap that closes an open row:
        // neither opens the link.
        if (swipedRef.current || isOpen) {
          event.preventDefault();
          event.stopPropagation();
          swipedRef.current = false;
          if (isOpen) closeSwipeRow(link.id);
        }
      }}
    >
      {enabled ? (
        <div
          ref={actionsRef}
          className={cn(
            "absolute inset-0 transition-opacity duration-200 ease-out-strong",
            leaving && "opacity-0",
          )}
        >
          {/* Right swipe: what letting go will do. Decorative; the row's
              menu names the same action. */}
          {side === "read" ? (
            <div
              aria-hidden
              data-swipe-indicator
              // Gone the moment the finger lifts: the row springs back
              // over it with its fill already fading, so it would show
              // through the title on the way.
              className={cn(
                "absolute inset-y-0 left-2 flex items-center transition-opacity duration-100 ease-out-strong",
                !isOpen && "opacity-0",
              )}
            >
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full transition-[background-color,color,scale] duration-150 ease-out-strong [&_svg]:size-4",
                  armed
                    ? "scale-100 bg-primary text-primary-foreground"
                    : "scale-75 bg-muted text-muted-foreground",
                  // Reduced motion: only its color says it's armed.
                  "motion-reduce:scale-100",
                )}
              >
                {read ? <CircleDot /> : <Check />}
              </div>
            </div>
          ) : null}
          {/* Left swipe: Delete at the edge first, then Move. Reachable
              (and announced) only while the row is open. */}
          <div
            inert={!isOpen}
            className="absolute inset-y-0 right-2 flex items-center gap-1"
          >
              {away ? (
                <div className={buttonReveal(isOpen && side === "actions" && revealed >= 2)}>
                  <DropdownMenu
                    open={moveOpen}
                    onOpenChange={(open) => {
                      setMoveOpen(open);
                      moveOpenRef.current = open;
                      if (!open) closeSwipeRow(link.id);
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move to folder"
                        className="bg-accent"
                      >
                        <FolderInput />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={LINK_FOLDER_LIST}>
                      <LinkFolderItems link={link} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
              {away ? (
                <div className={buttonReveal(isOpen && side === "actions" && revealed >= 1)}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete"
                    className="bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive dark:bg-destructive/20"
                    onClick={onDelete}
                  >
                    <Trash />
                  </Button>
                </div>
              ) : null}
          </div>
        </div>
      ) : null}
      {/* Off its resting place, the row is visibly held: the hover color,
          made opaque (accent at 40% on the page background), so the edge
          drawn over it reads the same as over the page. */}
      <motion.div
        style={{ transform }}
        className={cn(
          "relative rounded-md transition-[background-color] duration-150 ease-out-strong",
          isOpen && "bg-[color-mix(in_oklab,var(--accent)_40%,var(--background))]",
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}
