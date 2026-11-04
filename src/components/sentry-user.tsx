"use client";

import { setSentryUser } from "@/lib/sentry-user";
import { useEffect } from "react";

/**
 * Identifies the signed-in user (by id) on browser events and replays.
 * Rendered by the `(app)` layout only, never by the landing demo, whose
 * `@purl` account isn't the visitor.
 */
export function SentryUser({ userId }: { userId: string }) {
  useEffect(() => {
    setSentryUser(userId);
    return () => setSentryUser(null);
  }, [userId]);
  return null;
}
