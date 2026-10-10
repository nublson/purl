"use client";

import { cn } from "@/lib/utils";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * How far apart two columns' bottoms can be and still count as level.
 * Placing each card in the strictly shortest column breaks reading order:
 * when two columns end a few pixels apart, the next card can land in the
 * right one and the card after it in the left, a hair lower, so the eye
 * (reading left to right) meets them in reverse, e.g. "Last week" before
 * "Yesterday". Among level columns, the next card goes in the first one to
 * the right of the previous card (the same visual row), and only wraps to
 * the leftmost when none is (a new row). A card can then sit at most this
 * much higher than the one before it, and only to its right; it also caps
 * how uneven the columns can get.
 */
const LEVEL_TOLERANCE_PX = 32;

/**
 * Masonry for a grid of cards (`LINK_GRID_COLUMNS`): give the grid
 * `auto-rows-[1px]` and `ref={listRef}` once `masonry` is on, and wrap each
 * card in a `MasonryItem`. Each card is placed in order, in the leftmost
 * column that's level with the shortest, continuing the previous card's
 * row (`chooseMasonryColumn`), spanning
 * as many 1px rows as it is tall. Cards need measuring, which only happens
 * in the browser: the server's HTML (and the first paint before hydration)
 * shows plain rows, and this turns masonry on before the next paint.
 * Re-placed whenever a card resizes (fonts, a title rewrapping), the grid
 * changes width (its column count), or cards come and go.
 */
export function useMasonry(active: boolean): {
  masonry: boolean;
  listRef: RefObject<HTMLUListElement | null>;
} {
  const [masonry, setMasonry] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    // Deliberate: the switch has to land before the first paint, once the
    // cards exist to be measured (a layout effect, so no flash of rows).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) setMasonry(true);
  }, [active]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = () => Array.from(list.children) as HTMLElement[];
    if (!masonry || !active) {
      for (const item of items()) clearPlacement(item);
      return;
    }
    // Observers run after layout and before paint, so a card added or
    // resized is placed before anyone sees it out of place.
    const resizes = new ResizeObserver(() => placeCards(list));
    const watch = () => {
      resizes.disconnect();
      resizes.observe(list);
      for (const item of items()) {
        if (item.firstElementChild) resizes.observe(item.firstElementChild);
      }
    };
    const mutations = new MutationObserver(() => {
      watch();
      placeCards(list);
    });
    mutations.observe(list, { childList: true });
    watch();
    placeCards(list);
    return () => {
      resizes.disconnect();
      mutations.disconnect();
      for (const item of items()) clearPlacement(item);
    };
  }, [masonry, active]);

  return { masonry: masonry && active, listRef };
}

/**
 * The column for the next card, given each column's bottom and the
 * previous card's column (-1 for the first card): the first level column
 * to the right of the previous card, or else the leftmost level column.
 */
export function chooseMasonryColumn(bottoms: number[], previous: number): number {
  const shortest = Math.min(...bottoms);
  const level = (bottom: number) => bottom <= shortest + LEVEL_TOLERANCE_PX;
  const toTheRight = bottoms.findIndex(
    (bottom, index) => index > previous && level(bottom),
  );
  return toTheRight !== -1 ? toTheRight : bottoms.findIndex(level);
}

function placeCards(list: HTMLElement) {
  const items = Array.from(list.children) as HTMLElement[];
  // Count the template's columns with no card placed: a card left in
  // column 4 after the grid narrows to 2 makes implicit columns, which the
  // computed template includes, so the count would stay 4 and the cards
  // would never come back to 2 columns until a reload.
  for (const item of items) clearPlacement(item);
  const columns = getComputedStyle(list)
    .gridTemplateColumns.split(" ")
    .filter(Boolean).length;
  if (columns === 0) return;
  const bottoms = new Array<number>(columns).fill(0);
  let previous = -1;
  for (const item of items) {
    const box = item.firstElementChild;
    if (!(box instanceof HTMLElement)) continue;
    // Layout height, whole pixels (fractional 16:10 thumbnails round to
    // within half a pixel of the gutter), ignoring transforms: a card
    // mid-arrival (scaled) still takes its full height.
    const height = box.offsetHeight;
    const column = chooseMasonryColumn(bottoms, previous);
    previous = column;
    item.style.gridColumn = String(column + 1);
    item.style.gridRow = `${bottoms[column] + 1} / span ${Math.max(height, 1)}`;
    bottoms[column] += height;
  }
}

function clearPlacement(item: HTMLElement) {
  item.style.gridColumn = "";
  item.style.gridRow = "";
}

/**
 * A grid cell: the card's box, whose bottom padding is the vertical gutter
 * (the same as the column gap: 16px, 40px from md). `useMasonry` measures
 * the box and places the cell; before masonry is on, it's a plain grid row
 * (its padding is still the gutter).
 */
export function MasonryItem({
  className,
  style,
  flip,
  children,
}: {
  /** Its `data-flip` key (see `src/lib/flip.ts`). */
  flip?: string;
  /** For the card's box (e.g. its arrival animation). */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <li>
      <div
        className={cn("pb-4 md:pb-10", className)}
        style={style}
        data-flip={flip}
      >
        {children}
      </div>
    </li>
  );
}
