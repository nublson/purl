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
 * How much shorter than the others a column must be to take the next card
 * over a column further left. Placing each card in the strictly shortest
 * column breaks reading order: when two columns end a few pixels apart, the
 * next card lands in the right one and the card after it in the left, a
 * hair lower, so the eye (reading left to right) meets them in reverse,
 * e.g. "Last week" before "Yesterday". Within this distance the columns
 * count as level and the leftmost one wins; it also caps how uneven the
 * columns can get.
 */
const LEVEL_TOLERANCE_PX = 32;

/**
 * Masonry for a grid of cards (`LINK_GRID_COLUMNS`): give the grid
 * `auto-rows-[1px]` and `ref={listRef}` once `masonry` is on, and wrap each
 * card in a `MasonryItem`. Each card is placed in order, in the leftmost
 * column that's level with the shortest (`LEVEL_TOLERANCE_PX`), spanning
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

function placeCards(list: HTMLElement) {
  const columns = getComputedStyle(list)
    .gridTemplateColumns.split(" ")
    .filter(Boolean).length;
  if (columns === 0) return;
  const bottoms = new Array<number>(columns).fill(0);
  for (const item of Array.from(list.children) as HTMLElement[]) {
    const box = item.firstElementChild;
    if (!(box instanceof HTMLElement)) continue;
    // Layout height, whole pixels (fractional 16:10 thumbnails round to
    // within half a pixel of the gutter), ignoring transforms: a card
    // mid-arrival (scaled) still takes its full height.
    const height = box.offsetHeight;
    const shortest = Math.min(...bottoms);
    const column = bottoms.findIndex(
      (bottom) => bottom <= shortest + LEVEL_TOLERANCE_PX,
    );
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
  children,
}: {
  /** For the card's box (e.g. its arrival animation). */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <li>
      <div className={cn("pb-4 md:pb-10", className)} style={style}>
        {children}
      </div>
    </li>
  );
}
