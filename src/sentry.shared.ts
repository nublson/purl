import * as Sentry from "@sentry/nextjs";

/**
 * Options shared by every Sentry.init (browser, server, edge).
 *
 * Privacy: links, titles, notes and searches are private. SDK v11's
 * `dataCollection` collects everything by default (request and response
 * bodies, cookies, query strings, all headers), so it is narrowed here:
 * no bodies (a save or a note edit carries the user's URLs and notes), no
 * cookies, no query strings (`?q=` is a search), a few harmless request
 * headers, and no automatic user fields (IP, email). The user is identified
 * by id only (`setSentryUser`).
 */
export const sharedSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpBodies: [],
    urlQueryParams: false,
    httpHeaders: {
      request: { allow: ["user-agent", "accept", "content-type"] },
      response: false,
    },
  },
  // Expected aborts: leaving the page mid-upload, the enrich cron's lookup
  // timeouts, a fetch cancelled by navigation.
  ignoreErrors: ["AbortError"],
} satisfies Sentry.BrowserOptions & Sentry.NodeOptions;

const DEFAULT_TRACES_RATE =
  process.env.NODE_ENV === "development" ? 1.0 : 0.1;

/**
 * Server and edge sampling: every Vercel cron request is traced, since the
 * Cron Monitors (`vercelCronsMonitoring` in next.config.ts) are built from
 * those spans and a sampled-out run would read as a missed check-in.
 */
export function serverTracesSampler({
  name,
  inheritOrSampleWith,
}: {
  name: string;
  inheritOrSampleWith: (fallbackRate: number) => number;
}): number {
  if (name.includes("/api/cron/")) return 1;
  return inheritOrSampleWith(DEFAULT_TRACES_RATE);
}

export { DEFAULT_TRACES_RATE };
