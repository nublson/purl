const LOOPBACK_FALLBACK = "http://127.0.0.1:3000";

/** Site origin from `BETTER_AUTH_URL` (else `BASE_URL`), for issuer and resource URLs. */
export function configuredOrigin(): string {
  const raw = process.env.BETTER_AUTH_URL || process.env.BASE_URL || LOOPBACK_FALLBACK;
  try {
    return new URL(raw).origin;
  } catch {
    return new URL(LOOPBACK_FALLBACK).origin;
  }
}

/**
 * MCP protected-resource identifier. The 1.6 plugin advertised the site origin
 * when `resource` was unset, and existing clients request that value.
 */
export function mcpResource(): string {
  return configuredOrigin();
}

/** Authorization server issuer: the site origin plus Better Auth's base path. */
export function oauthIssuer(): string {
  return `${configuredOrigin()}/api/auth`;
}

export function oauthJwksUrl(): string {
  return `${oauthIssuer()}/jwks`;
}
