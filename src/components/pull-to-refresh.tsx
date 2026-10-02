"use client";

import {
  classifyDrag,
  PULL_MIN_REFRESH_MS,
  PULL_REFRESHING_OFFSET,
  PULL_THRESHOLD,
  pullDistance,
} from "@/lib/pull-to-refresh";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

/** Settle/snap motion for the list and spinner (never while the finger is down). */
const SETTLE_TRANSITION = "translate 300ms cubic-bezier(0.2, 0, 0, 1)";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Touches that start here are typing or picking, never a pull. */
const NON_PULL_TARGETS =
  "input, textarea, select, [contenteditable=''], [contenteditable='true']";

/**
 * iOS-style pull-to-refresh for touch screens: at the top of the list,
 * pulling down slides the content down and reveals a spinner above it;
 * releasing past `PULL_THRESHOLD` runs `onRefresh` (which resolves `false`
 * on failure) while the list rests a little lower, then slides back.
 *
 * It listens on the nearest `<main>`, the app's scroll container (the page
 * itself doesn't scroll), and moves the list by writing styles directly, so
 * a pull never re-renders the list. Off while `disabled` (e.g. while links
 * are selected) and while a dialog or menu has locked scrolling.
 */
export function PullToRefresh({
  onRefresh,
  disabled = false,
  className,
  children,
}: {
  onRefresh: () => Promise<boolean>;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const indicatorRef = React.useRef<HTMLDivElement>(null);
  const iconRef = React.useRef<SVGSVGElement>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  // Read inside the touch listeners, which bind once.
  const onRefreshRef = React.useRef(onRefresh);
  const disabledRef = React.useRef(disabled);
  const refreshingRef = React.useRef(false);
  React.useEffect(() => {
    onRefreshRef.current = onRefresh;
    disabledRef.current = disabled;
  });

  /** Moves the list (and the spinner riding above it) to `distance`. */
  const moveTo = React.useCallback((distance: number, animate: boolean) => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    const icon = iconRef.current;
    if (!content || !indicator || !icon) return;
    const transition =
      animate && !prefersReducedMotion() ? SETTLE_TRANSITION : "none";
    const progress = Math.min(1, distance / PULL_THRESHOLD);
    content.style.transition = transition;
    content.style.translate = distance > 0 ? `0 ${distance}px` : "";
    indicator.style.transition = animate
      ? `${transition}, opacity 150ms ease-out`
      : "none";
    indicator.style.translate = distance > 0 ? `0 ${distance}px` : "";
    indicator.style.opacity = String(progress);
    indicator.toggleAttribute("data-armed", distance >= PULL_THRESHOLD);
    // The spinner turns with the finger; while refreshing it spins on its own.
    icon.style.rotate =
      refreshingRef.current || prefersReducedMotion()
        ? ""
        : `${progress * 270}deg`;
  }, []);

  const refresh = React.useCallback(async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    setAnnouncement("Refreshing links");
    moveTo(PULL_REFRESHING_OFFSET, true);
    const [ok] = await Promise.all([
      onRefreshRef.current().catch(() => false),
      new Promise((resolve) => setTimeout(resolve, PULL_MIN_REFRESH_MS)),
    ]);
    refreshingRef.current = false;
    setRefreshing(false);
    setAnnouncement(ok ? "Links refreshed" : "");
    if (!ok) {
      toast.error("Unable to refresh. Check your connection and try again.");
    }
    moveTo(0, true);
  }, [moveTo]);

  React.useEffect(() => {
    const scroller = contentRef.current?.closest("main");
    if (!scroller) return;

    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let distance = 0;

    const reset = () => {
      start = null;
      pulling = false;
      distance = 0;
    };

    const onTouchStart = (event: TouchEvent) => {
      reset();
      if (
        event.touches.length !== 1 ||
        disabledRef.current ||
        refreshingRef.current ||
        scroller.scrollTop > 0 ||
        // A dialog or menu is open (Radix locks scrolling).
        document.body.hasAttribute("data-scroll-locked") ||
        (event.target instanceof Element &&
          event.target.closest(NON_PULL_TARGETS))
      ) {
        return;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!pulling) {
        const kind = classifyDrag(dx, dy);
        if (kind === "undecided") return;
        if (kind === "ignore" || scroller.scrollTop > 0) {
          start = null;
          return;
        }
        pulling = true;
      }
      // Ours now: keep the list from scrolling or bouncing underneath.
      if (event.cancelable) event.preventDefault();
      distance = pullDistance(dy);
      moveTo(distance, false);
    };

    const onTouchEnd = () => {
      if (!pulling) {
        reset();
        return;
      }
      const release = distance;
      reset();
      if (release >= PULL_THRESHOLD) void refresh();
      else moveTo(0, true);
    };

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    // Not passive: a pull has to stop the native scroll.
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [moveTo, refresh]);

  return (
    <div className="relative">
      {/* Sits just above the list and rides down with it. */}
      <div
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 flex justify-center text-muted-foreground opacity-0 data-armed:text-foreground"
      >
        <Loader2Icon
          ref={iconRef}
          className={cn(
            "size-5",
            refreshing && "animate-spin motion-reduce:animate-none",
          )}
        />
      </div>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      <div ref={contentRef} className={cn("flex flex-col", className)}>
        {children}
      </div>
    </div>
  );
}
