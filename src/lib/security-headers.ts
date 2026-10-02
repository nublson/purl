import { buildContentSecurityPolicy } from "./csp-header";

export type SecurityHeader = { key: string; value: string };

/** Sent on every response, in development and production. */
export const BASE_SECURITY_HEADERS: readonly SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Legacy fallback for the CSP's `frame-ancestors 'none'` (older browsers),
  // and the only framing protection in dev, where the CSP isn't sent.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/**
 * Headers `next.config.ts` applies to every route. Production adds the
 * Content-Security-Policy; dev leaves it out (it would block dev tooling).
 */
export function buildSecurityHeaders(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): SecurityHeader[] {
  if (nodeEnv !== "production") return [...BASE_SECURITY_HEADERS];
  return [
    ...BASE_SECURITY_HEADERS,
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
  ];
}
