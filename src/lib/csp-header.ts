/**
 * Production Content-Security-Policy for document responses.
 * Tuned for Next.js App Router, Vercel Analytics/Speed Insights (dev script host),
 * Supabase browser client + Realtime, Sentry, and untrusted `<img>` (https/http).
 *
 * `connect-src` must allow the same remote https/http hosts as images where a service
 * worker handles fetches: SW `fetch()` is checked against `connect-src`, not `img-src`,
 * so a tight `connect-src` breaks favicons and OG thumbnails loaded from arbitrary
 * domains (see Serwist / PWA).
 *
 * Vercel Live (preview toolbar / feedback) loads `https://vercel.live` in an iframe; without
 * `frame-src` the policy falls back to `default-src` and the frame is blocked.
 */
export function buildContentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live",
    "frame-src 'self' https://vercel.live https://*.vercel.live",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self'",
    [
      "connect-src 'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://vitals.vercel-insights.com",
      "https://*.sentry.io",
      "https:",
      "http:",
    ].join(" "),
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}
