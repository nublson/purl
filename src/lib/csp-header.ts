/**
 * Production Content-Security-Policy for document responses.
 * Tuned for Next.js App Router, Vercel Analytics/Speed Insights (dev script host),
 * Supabase browser client + Realtime, Sentry, and untrusted `<img>` (https/http).
 */
export function buildContentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self'",
    [
      "connect-src 'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://vitals.vercel-insights.com",
      "https://*.sentry.io",
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
