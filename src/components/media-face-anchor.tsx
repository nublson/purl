"use client";

import { useIsMediaOpen } from "@/lib/media-viewer";
import { loadMotionFeatures } from "@/lib/motion-features-loader";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { LazyMotion, m } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Faces and the viewer's Popup share this `layoutDependency`. A face never
 * changes it, so its re-renders (the image loading, the masonry moving it)
 * never start a layout animation: only the shared transition with the
 * Popup does. The viewer gives its Popup the same value while it swaps
 * which face it belongs to (see `media-viewer.tsx`): Motion reads equal
 * dependencies on the Popup and a face as "nothing to morph". The Popup
 * switching from `undefined` to this value (and back) is itself a
 * dependency change, so Motion takes a snapshot of it then; that's
 * harmless, since the Popup's box doesn't move.
 */
export const FACE_LAYOUT_DEPENDENCY = "pearl-face";

/**
 * A card's corner radius (`rounded-lg`, 10px), in px: Motion keeps a
 * corner round while it scales a box only when the radius is a style value
 * it can correct, so faces and the Popup set it inline.
 */
export const MEDIA_RADIUS = 10;

/**
 * A list row's icon radius, in px: the favicon's own (`rounded-[3px]` in
 * `LinkIcon`), so a row's anchor clips its image pearl as the row drew it.
 */
export const ROW_ICON_RADIUS = 3;

/** The `layoutId` a pearl's face and the viewer's Popup share. */
export function pearlLayoutId(id: string): string {
  return `pearl-${id}`;
}

/**
 * Every corner rounded (an image or video face, which is the whole card),
 * or only the top two (the audio strip, with the title strip under it).
 * Per corner, so Motion can correct each one while it scales the box.
 */
function cornerStyle(corners: "all" | "top", radius: number): CSSProperties {
  return corners === "all"
    ? { borderRadius: radius }
    : {
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      };
}

/**
 * What the media viewer morphs out of and back into: a face's media box,
 * tagged with the pearl's `layoutId`. No `layout` prop: the face itself
 * never animates on its own; Motion hides it while the viewer is open and
 * morphs it back from the viewer's box on close. It rounds and clips
 * itself (its card doesn't clip it, or the morph back would be cropped to
 * the card) and rides above its neighbours while the viewer is open and
 * until the morph back has played.
 */
export function MediaAnchor({
  link,
  corners = "all",
  radius = MEDIA_RADIUS,
  className,
  children,
}: {
  link: Pick<Link, "id">;
  /** Which of the face's corners are the card's (and so rounded). */
  corners?: "all" | "top";
  /** Their radius in px: a card's by default; a list row's icon is smaller. */
  radius?: number;
  className?: string;
  children: ReactNode;
}) {
  const open = useIsMediaOpen(link.id);
  const [morphing, setMorphing] = useState(false);
  if (open && !morphing) setMorphing(true);
  const ref = useRef<HTMLDivElement>(null);
  // Closed onto another card, this one never morphs back: lower it anyway.
  useEffect(() => {
    if (open || !morphing) return;
    const timer = setTimeout(() => setMorphing(false), 1000);
    return () => clearTimeout(timer);
  }, [open, morphing]);
  // Motion hid this face when the viewer opened from it. If the viewer then
  // closed onto another card, Motion shows it again without a morph, and
  // without a morph it never clears the `visibility: hidden` it wrote: clear
  // it once the viewer is off this pearl.
  useEffect(() => {
    if (open) return;
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (el?.style.visibility === "hidden") el.style.visibility = "";
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <m.div
        ref={ref}
        layoutId={pearlLayoutId(link.id)}
        layoutDependency={FACE_LAYOUT_DEPENDENCY}
        onLayoutAnimationComplete={() => {
          if (!open) setMorphing(false);
        }}
        // While it morphs (open, then back): lists lift their rows'
        // `content-visibility` containment, which would clip the morph to
        // the row, and rows keep a hovered row's icon shown (`LinkItem`).
        data-pearl-morphing={morphing || undefined}
        className={cn("w-full overflow-hidden", morphing && "relative z-10", className)}
        style={cornerStyle(corners, radius)}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
