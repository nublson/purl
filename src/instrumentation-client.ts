// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const sentryEnabled =
  process.env.NEXT_PUBLIC_SENTRY_ENABLED === "true" ||
  process.env.NODE_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: sentryEnabled,

  // Session Replay is intentionally not enabled: it ships rrweb (~40 KB gz) to
  // every visitor on every page.

  // Sample 10% of traces; 100% added per-navigation overhead for every user.
  tracesSampleRate: sentryEnabled ? 0.1 : 0,
  // Enable logs to be sent to Sentry
  enableLogs: sentryEnabled,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
