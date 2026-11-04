import * as Sentry from "@sentry/nextjs";
import { DEFAULT_TRACES_RATE, sharedSentryOptions } from "./sentry.shared";

Sentry.init({
  ...sharedSentryOptions,

  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development",

  // Replay keeps its defaults on purpose (all text masked, all media
  // blocked): titles, notes and uploads are private. Don't loosen them.
  integrations: [Sentry.replayIntegration()],

  tracesSampleRate: DEFAULT_TRACES_RATE,

  // Capture Replay for 10% of sessions, plus 100% of sessions with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Avoid noise from local browser extensions.
  denyUrls: [/extensions\//i, /^chrome(?:-extension)?:\/\//i],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
