"use client";

import { cn } from "@/lib/utils";
import type * as React from "react";

/**
 * Safari's native switch (`<input type="checkbox" switch>`, iOS 17.4+)
 * ticks when a real tap toggles it, the only haptic iOS gives a web page.
 * Toggling it from code stopped working (iOS 26.5), so the tap itself has
 * to land on a `<label>` wired to it. Technique from ios-haptics
 * (github.com/tijnjh/ios-haptics, MIT).
 */
const SWITCH_ATTRIBUTE = { switch: "" } as Record<string, string>;

/**
 * An invisible label over its parent (which must be positioned), wired to a
 * hidden native switch: tapping the parent toggles the switch, so iOS plays
 * its tick. Pair it with `haptic(kind)` in the action, for Android.
 *
 * - Touch screens only (`pointer-coarse:`, CSS, so the server's HTML is
 *   right), and never inside a disabled control: a tap that does nothing
 *   mustn't tick.
 * - The switch is 1px and never under the finger: WebKit treats a
 *   touchstart on a switch as handled, which cancels scrolling.
 * - Pass-through (no `onTap`): the tap's click bubbles on to the parent's
 *   own handlers. The label then forwards a second click to the switch;
 *   that one stops at the switch, so the parent acts once.
 * - Owner (`onTap`): for parents whose handlers call `preventDefault()`,
 *   which would cancel the label (no tick). The label takes the tap,
 *   stops it there and calls `onTap` in a later task: if the tap unmounts
 *   this label (deselecting the last row ends selection) before the
 *   browser toggles the switch, there's no tick, and React applies a
 *   tap's updates right away.
 */
export function HapticTarget({
  onTap,
  className,
}: {
  onTap?: (event: React.MouseEvent<HTMLLabelElement>) => void;
  className?: string;
}) {
  return (
    <label
      aria-hidden="true"
      data-haptic-target=""
      className={cn(
        "absolute inset-0 hidden touch-manipulation [-webkit-tap-highlight-color:transparent] pointer-coarse:block",
        "in-disabled:hidden in-data-disabled:hidden",
        className,
      )}
      onClick={
        onTap
          ? (event) => {
              event.stopPropagation();
              setTimeout(() => onTap(event), 0);
            }
          : undefined
      }
    >
      <input
        type="checkbox"
        {...SWITCH_ATTRIBUTE}
        tabIndex={-1}
        className="invisible absolute m-0 size-px"
        onClick={(event) => event.stopPropagation()}
      />
    </label>
  );
}
