/** Sentry sample API/page are for local/staging diagnostics only. */
export function isSentryExampleEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
