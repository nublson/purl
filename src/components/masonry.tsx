"use client";

import { cn } from "@/lib/utils";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Masonry for a grid of cards (`LINK_GRID_COLUMNS`): give the grid
 * `auto-rows-[1px]` once `masonry` is on, and wrap each card in a
 * `MasonryItem`. Cards need measuring, which only happens in the browser:
 * the server's HTML (and the first paint before hydration) shows plain
 * rows, and this turns masonry on before the next paint.
 */
export function useMasonry(active: boolean): boolean {
  const [masonry, setMasonry] = useState(false);
  useLayoutEffect(() => {
    // Deliberate: the switch has to land before the first paint, once the
    // cards exist to be measured (a layout effect, so no flash of rows).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) setMasonry(true);
  }, [active]);
  return masonry;
}

/**
 * A grid cell that spans as many 1px rows as its card is tall, plus the
 * vertical gutter (its bottom padding, the same as the column gap: 16px,
 * 40px from md). Measured before paint and again whenever the card
 * resizes (fonts, a title rewrapping). Before `masonry` is on, the cell is
 * a plain grid row (its padding is still the gutter).
 */
export function MasonryItem({
  masonry,
  className,
  style,
  children,
}: {
  masonry: boolean;
  /** For the card's box (e.g. its arrival animation). */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [span, setSpan] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // Nearest pixel: fractional card heights (16:10 thumbnails) round to
    // within half a pixel of the gutter, either way.
    const measure = () =>
      setSpan(Math.round(box.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <li
      // In masonry, hidden until measured so cards never paint stacked on
      // each other (a card added later is measured before its first paint).
      className={masonry && span === null ? "invisible" : undefined}
      style={
        masonry && span !== null ? { gridRowEnd: `span ${span}` } : undefined
      }
    >
      <div
        ref={boxRef}
        className={cn("pb-4 md:pb-10", className)}
        style={style}
      >
        {children}
      </div>
    </li>
  );
}
