/**
 * `Cache-Control` for OAuth discovery metadata (`/.well-known/oauth-*`):
 * fresh on the Vercel CDN for an hour, then served stale for up to a day
 * while it refreshes in the background. Safe because Better Auth builds
 * the metadata from the configured base URL (BETTER_AUTH_URL), not the
 * request: every caller on every domain gets the same document.
 */
export const DISCOVERY_CACHE_CONTROL =
  "public, s-maxage=3600, stale-while-revalidate=86400";

/**
 * Wraps a route handler so its successful responses are served from the CDN
 * with `cacheControl`, keeping the handler's other headers (e.g. CORS).
 * Errors pass through uncached. Only for responses that are the same for
 * every caller: never for anything that reads a session or API key.
 */
export function withCdnCache(
  handler: (request: Request) => Promise<Response> | Response,
  cacheControl: string,
) {
  return async (request: Request): Promise<Response> => {
    const res = await handler(request);
    if (!res.ok) return res;
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", cacheControl);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
