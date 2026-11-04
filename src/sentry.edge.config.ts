import * as Sentry from "@sentry/nextjs";
import { serverTracesSampler, sharedSentryOptions } from "./sentry.shared";

Sentry.init({
  ...sharedSentryOptions,

  environment:
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  tracesSampler: serverTracesSampler,

  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],
});
