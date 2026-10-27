"use client";

import { mediaViewer, type MediaViewerPreset } from "@/lib/media-viewer";
import type { Link } from "@/utils/links";
import type { ComponentPropsWithoutRef, MouseEvent, Ref } from "react";

/**
 * What a media pearl's card (or row) is instead of a link: a button that
 * opens the media viewer on it. While selecting, a click is the caller's
 * (`onClick` toggles the selection) and the viewer stays shut; a click that
 * ends a long-press opens nothing either (`consumeLongPress`).
 *
 * `data-pearl-button` lets the viewer find it again, to give it focus back.
 */
export function MediaOpenButton({
  ref,
  link,
  selecting,
  consumeLongPress,
  preset,
  onClick,
  ...props
}: Omit<ComponentPropsWithoutRef<"button">, "onClick" | "type"> & {
  ref?: Ref<HTMLButtonElement>;
  link: Pick<Link, "id" | "title">;
  /** A selection is active: the click is `onClick`'s alone. */
  selecting: boolean;
  /** True once when this click ends a long-press (which already acted). */
  consumeLongPress?: () => boolean;
  /** The morph's spring (cards: smooth, rows: snappy). */
  preset?: MediaViewerPreset;
  /** Runs instead of opening the viewer while selecting. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={link.title}
      data-pearl-button={link.id}
      {...props}
      onClick={(event) => {
        if (consumeLongPress?.()) return;
        if (selecting) {
          onClick?.(event);
          return;
        }
        mediaViewer.open(link.id, { preset });
      }}
    />
  );
}
