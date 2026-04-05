"use client";

import type { Link } from "@/utils/links";

/**
 * Imperative handle for the private-layout chat widget (link rows, etc.).
 */
export const chatSurfaceRef: {
  current: null | {
    openWithMention: (link: Link) => void;
    openWidget: () => void;
  };
} = { current: null };
