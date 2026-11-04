import * as Sentry from "@sentry/nextjs";

/**
 * Tags the current Sentry scope with the signed-in user, by id only (no email,
 * name or username: see `dataCollection` in src/sentry.shared.ts). On the
 * server the Next.js SDK isolates scopes per request, so this never leaks
 * between users.
 */
export function setSentryUser(userId: string | null): void {
  Sentry.setUser(userId ? { id: userId } : null);
}
