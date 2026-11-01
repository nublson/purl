"use client";

import { cn } from "@/lib/utils";
import * as React from "react";
import { Memo } from "reicon-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/** A hovered note closes this long after the pointer leaves it. */
const HOVER_CLOSE_MS = 150;

type OpenedBy = "hover" | "press";

/**
 * Says a link has a private note, and opens it: on the owner's rows and page
 * cards only (never on the shared folder page). A button named "Note" drawing
 * the `Memo` at 14px in a 24px box (44px to the touch), the last thing on a
 * row's title line and beside a card's domain. Hovering it with a pointer
 * that hovers opens the note at once and leaving closes it; a click, a tap or
 * Enter keeps it open until an outside press or Escape, which hands focus
 * back to the mark. The Edit dialog is still the only place to write.
 *
 * It carries `data-card-menu`, so a press on it is its own, not the row's or
 * the card's long-press, and not the card's press scale.
 */
export function NoteMark({
  notes,
  inert = false,
  className,
  onOpenChange,
  onHoverChange,
}: {
  notes: string;
  /** While selecting: a click there should toggle the row or card instead. */
  inert?: boolean;
  className?: string;
  /** The note opened or closed (a row shuts its own hover preview meanwhile). */
  onOpenChange?: (open: boolean) => void;
  /** A hovering pointer entered or left the mark (a row holds its preview). */
  onHoverChange?: (hovering: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const openedByRef = React.useRef<OpenedBy | null>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Escape returns focus to the mark; a hover's end or an outside press
  // doesn't move focus at all.
  const escapedRef = React.useRef(false);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);
  React.useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const change = React.useCallback(
    (next: boolean, by: OpenedBy | null) => {
      clearCloseTimer();
      openedByRef.current = next ? by : null;
      setOpen(next);
      onOpenChange?.(next);
    },
    [clearCloseTimer, onOpenChange],
  );

  // Leaving the mark or the note closes a hovered one, after a beat that
  // lets the pointer cross from the one to the other.
  const scheduleHoverClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      if (openedByRef.current === "hover") change(false, null);
    }, HOVER_CLOSE_MS);
  };

  React.useEffect(() => {
    if (inert && open) change(false, null);
  }, [inert, open, change]);

  return (
    <Popover
      open={open}
      modal={false}
      // Radix: the trigger's click, an outside press, Escape.
      onOpenChange={(next) => change(next, next ? "press" : null)}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Note"
          data-cy="note-mark"
          data-card-menu
          inert={inert}
          className={cn(
            "relative z-[1] flex h-5 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors duration-150 ease-out-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground",
            // 44px to the touch, without moving anything.
            "pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5",
            className,
          )}
          onClick={(event) => {
            // Never the row's link or the card's opener.
            event.stopPropagation();
            // A click on a hovered note keeps it: it's now pressed open.
            if (open && openedByRef.current === "hover") {
              event.preventDefault();
              openedByRef.current = "press";
            }
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return;
            onHoverChange?.(true);
            clearCloseTimer();
            if (!open) change(true, "hover");
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "touch") return;
            onHoverChange?.(false);
            scheduleHoverClose();
          }}
        >
          <Memo className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-cy="note-popover"
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={16}
        // The note as the hover preview shows it, scrolling inside past
        // about ten lines so a 2,000-character note never covers the page.
        className="max-h-56 w-64 overflow-y-auto wrap-anywhere p-3 text-xs whitespace-pre-line text-muted-foreground"
        onPointerEnter={clearCloseTimer}
        onPointerLeave={scheduleHoverClose}
        // A hovered note never takes focus from where it was.
        onOpenAutoFocus={(event) => {
          if (openedByRef.current === "hover") event.preventDefault();
        }}
        onEscapeKeyDown={() => {
          escapedRef.current = true;
        }}
        onCloseAutoFocus={(event) => {
          if (!escapedRef.current) event.preventDefault();
          escapedRef.current = false;
        }}
      >
        {notes}
      </PopoverContent>
    </Popover>
  );
}
