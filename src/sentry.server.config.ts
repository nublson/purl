import * as Sentry from "@sentry/nextjs";
import { serverTracesSampler, sharedSentryOptions } from "./sentry.shared";

Sentry.init({
  ...sharedSentryOptions,

  environment:
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  tracesSampler: serverTracesSampler,

  // The app's own warnings and errors (`[uploads] del failed`,
  // `[scrapeLinkMetadata] … falling back`, proxy-hop failures) become
  // searchable Sentry logs, linked to the trace they happened in.
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],
});
