"use client";

import { afterTap, haptic } from "@/lib/haptics";
import { decideSwipe, settleDuration, SWIPE_REVEAL } from "@/lib/swipe-row";
import { cn } from "@/lib/utils";
import { Pen, Trash2 } from "reicon-react";
import * as React from "react";
import { HapticTarget } from "./haptic-target";
import { Typography } from "./typography";

/** Movement (px) before a touch counts as a swipe or a scroll. */
const LOCK_DISTANCE = 8;

/** Which side's action a row is open on: Edit (start) or Delete (end). */
export type SwipeSide = "edit" | "delete";

type Gesture = {
  id: number;
  x: number;
  y: number;
  base: number;
  offset: number;
  locked: "x" | "y" | null;
  lastX: number;
  lastT: number;
  velocity: number;
};

/**
 * A touch-screen row with an action on each side (the folder menu's rows):
 * swiped right it uncovers Edit, swiped left Delete. Past half the reveal it
 * stays open on that button; past 60% of its width (`decideSwipe`) the
 * release acts at once. Both only ask: `onEdit` and `onDelete` open dialogs
 * (and Delete's confirms). Touch only (a mouse or pen never swipes), and
 * never from `[data-folder-grip]`, which drags the row up and down instead.
 * Vertical moves stay the list's scroll (`touch-action: pan-y`). The
 * swipe's release, and a tap on an open row (which shuts it), never reach
 * the row: it's a link, and a menu item. The buttons are hidden from
 * assistive tech and out of the Tab order: the menu's Edit folder and
 * Delete folder, and the row's Delete key, are the other ways there.
 */
export function SwipeRow({
  name,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  children,
}: {
  /** The row's subject, for the buttons' tooltips ("Edit Reading list"). */
  name: string;
  open: SwipeSide | null;
  onOpenChange: (open: SwipeSide | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const editRef = React.useRef<HTMLButtonElement>(null);
  const deleteRef = React.useRef<HTMLButtonElement>(null);
  const gesture = React.useRef<Gesture | null>(null);
  // The release (or a tap that shut the row) mustn't click the row.
  const swallowClick = React.useRef(false);

  /** Moves the row; `animate` slides it (over `duration` ms, else 200). */
  const place = React.useCallback(
    (offset: number, animate: boolean, duration?: number) => {
      const content = contentRef.current;
      if (!content) return;
      content.style.transition = animate ? "" : "none";
      content.style.transitionDuration = duration ? `${duration}ms` : "";
      content.style.transform = offset ? `translateX(${offset}px)` : "";
      // Each button fills what the row uncovers on its side, so a full swipe
      // reads as one; only the uncovered one is drawn.
      for (const [button, shown] of [
        [editRef.current, offset > 0],
        [deleteRef.current, offset < 0],
      ] as const) {
        if (!button) continue;
        button.style.visibility = shown ? "visible" : "";
        button.style.width = `${Math.max(SWIPE_REVEAL, Math.abs(offset))}px`;
      }
    },
    [],
  );

  const restingOffset = (side: SwipeSide | null) =>
    side === "edit" ? SWIPE_REVEAL : side === "delete" ? -SWIPE_REVEAL : 0;

  // Open and shut from outside (another row opening, the menu closing).
  React.useLayoutEffect(() => {
    if (gesture.current?.locked === "x") return;
    place(restingOffset(open), true);
  }, [open, place]);

  const onPointerDown = (event: React.PointerEvent) => {
    // A gesture that ended without a click mustn't swallow this one's.
    swallowClick.current = false;
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    if ((event.target as Element).closest("[data-folder-grip]")) return;
    const base = restingOffset(open);
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      base,
      offset: base,
      locked: null,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.locked) {
      if (Math.abs(dy) > LOCK_DISTANCE && Math.abs(dy) >= Math.abs(dx)) {
        g.locked = "y";
        return;
      }
      if (Math.abs(dx) <= LOCK_DISTANCE) return;
      g.locked = "x";
      // Keeps the moves coming when the finger leaves the row (it can't
      // be captured once the browser has ended the touch).
      try {
        contentRef.current?.setPointerCapture(event.pointerId);
      } catch {}
    }
    if (g.locked !== "x") return;
    const width = contentRef.current?.offsetWidth ?? 0;
    g.offset = Math.max(-width, Math.min(width, g.base + dx));
    const dt = event.timeStamp - g.lastT;
    if (dt > 0) g.velocity = (event.clientX - g.lastX) / dt;
    g.lastX = event.clientX;
    g.lastT = event.timeStamp;
    place(g.offset, false);
  };

  const onPointerEnd = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (g.locked !== "x") {
      // A plain tap on an open row shuts it, and goes nowhere.
      if (open && !g.locked && event.type === "pointerup") {
        swallowClick.current = true;
        onOpenChange(null);
      }
      return;
    }
    swallowClick.current = true;
    const width = contentRef.current?.offsetWidth ?? 0;
    // Measured toward the side the row moved to.
    const side: SwipeSide | null =
      g.offset > 0 ? "edit" : g.offset < 0 ? "delete" : null;
    const sign = side === "edit" ? 1 : -1;
    const outcome =
      event.type === "pointercancel" || !side
        ? "closed"
        : decideSwipe({
            distance: Math.abs(g.offset),
            velocity: g.velocity * sign,
            width,
          });
    if (outcome === "full" && side) {
      place(
        sign * width,
        true,
        settleDuration(sign * width - g.offset, g.velocity),
      );
      if (side === "edit") onEdit();
      else onDelete();
      return;
    }
    const next = outcome === "open" ? side : null;
    const target = restingOffset(next);
    place(target, true, settleDuration(target - g.offset, g.velocity));
    onOpenChange(next);
  };

  // Haptics as on the row menu's Delete: Android vibrates from the tap, and
  // iOS ticks from the button's `HapticTarget` as long as the button is
  // still on the page, so the action (which closes the menu) runs a task
  // later.
  const act = (kind: "selection" | "warning", run: () => void) => () => {
    haptic(kind);
    afterTap(run);
  };

  return (
    <div className="relative overflow-hidden rounded-sm">
      {/* Only drawn while the row is moved aside. Edit is the neutral
          high-contrast pair (like the audio card's Play); Delete is red-600,
          not the `destructive` token: white text on it is 4.8:1 (on the
          token's lighter red, under 3:1). */}
      <button
        ref={editRef}
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        title={`Edit ${name}`}
        data-folder-swipe-edit=""
        className={cn(ACTION, "left-0 bg-foreground text-background")}
        onClick={act("selection", onEdit)}
      >
        <Pen className="size-4 shrink-0" />
        <Typography component="span" size="small" className="font-medium text-background">
          Edit
        </Typography>
        <HapticTarget />
      </button>
      <button
        ref={deleteRef}
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        title={`Delete ${name}`}
        data-folder-swipe-delete=""
        className={cn(ACTION, "right-0 bg-red-600 text-white")}
        onClick={act("warning", onDelete)}
      >
        <Trash2 className="size-4 shrink-0" />
        <Typography component="span" size="small" className="font-medium text-white">
          Delete
        </Typography>
        <HapticTarget />
      </button>
      <div
        ref={contentRef}
        data-swipe-row=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        className={cn(
          // Opaque, so the buttons stay behind it until uncovered.
          "relative bg-popover pointer-coarse:touch-pan-y",
          "transition-transform duration-200 ease-out-strong motion-reduce:transition-none",
        )}
      >
        {children}
      </div>
    </div>
  );
}

const ACTION =
  "invisible absolute inset-y-0 flex cursor-pointer items-center justify-center gap-1.5";
