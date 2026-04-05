"use client";

import type { Link } from "@/utils/links";

/**
 * Imperative handle for the home chat surface so link rows can "Add to chat"
 * without prop drilling through LinkGroup.
 */
export const chatSurfaceRef: {
  current: null | { openWithMention: (link: Link) => void };
} = { current: null };
