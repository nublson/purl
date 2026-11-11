import * as Sentry from "@sentry/nextjs";
import { DEFAULT_TRACES_RATE, sharedSentryOptions } from "./sentry.shared";

Sentry.init({
  ...sharedSentryOptions,

  environment:
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  tracesSampleRate: DEFAULT_TRACES_RATE,

  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],
});
