"use client";

import { useIsMediaOpen } from "@/lib/media-viewer";
import { loadMotionFeatures } from "@/lib/motion-features-loader";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { LazyMotion, m } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

/** The `layoutId` a pearl's face and the viewer's Popup share. */
export function pearlLayoutId(id: string): string {
  return `pearl-${id}`;
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
  className,
  children,
}: {
  link: Pick<Link, "id">;
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
        className={cn("w-full overflow-hidden", morphing && "relative z-10", className)}
        style={{ borderRadius: MEDIA_RADIUS }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
