"use client";

import { embedSrc } from "@/lib/embeds";
import type { Link } from "@/utils/links";
import type { Ref } from "react";

/** How long a live frame may take to load before the preview stays instead. */
export const EMBED_LOAD_TIMEOUT_MS = 8000;

declare global {
  interface Window {
    /** e2e only: a shorter load timeout for live frames. */
    __purlEmbedTimeoutMs?: number;
  }
}

/** The live frame's load timeout: `EMBED_LOAD_TIMEOUT_MS`, or the e2e override. */
export function embedLoadTimeoutMs(): number {
  const override =
    typeof window === "undefined" ? undefined : window.__purlEmbedTimeoutMs;
  return typeof override === "number" && Number.isFinite(override) && override >= 0
    ? override
    : EMBED_LOAD_TIMEOUT_MS;
}

/**
 * A live pearl's page, sandboxed: it runs as its own origin (never Purl's),
 * may open popups, and can't navigate Purl away (no `allow-top-navigation`).
 * The card and the media viewer both draw this one.
 */
export function EmbedFrame({
  ref,
  link,
  onLoad,
  className,
  inert,
  "data-state": dataState,
}: {
  ref?: Ref<HTMLIFrameElement>;
  link: Pick<Link, "url" | "title">;
  onLoad?: () => void;
  className?: string;
  inert?: boolean;
  "data-state"?: string;
}) {
  return (
    <iframe
      ref={ref}
      src={embedSrc(link)}
      title={link.title}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"
      allow="autoplay; fullscreen; clipboard-write; picture-in-picture"
      inert={inert}
      data-state={dataState}
      className={className}
      onLoad={onLoad}
    />
  );
}
