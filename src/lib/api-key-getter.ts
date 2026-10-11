/** Prefix of every Purl API key (`defaultPrefix` in `auth.ts`). */
export const API_KEY_PREFIX = "purl_";

type CtxLike = {
  request?: { headers?: { get?: (k: string) => string | null } };
  headers?: { get?: (k: string) => string | null };
};

/**
 * The apiKey plugin's `customAPIKeyGetter`: reads `Authorization: Bearer purl_…`.
 *
 * Only `purl_` tokens count. With `enableSessionForAPIKeys` the plugin runs a
 * before-hook on every endpoint whenever this returns a key, and rejects keys
 * it can't find (`FORBIDDEN / INVALID_API_KEY`). OAuth access tokens from the
 * mcp plugin are 32 random characters with no prefix, so returning them made
 * every OAuth-authenticated MCP request throw.
 *
 * `ctx` is Better Auth's GenericEndpointContext, an internal type: pass it
 * through `unknown`.
 */
export function getPurlApiKey(ctx: unknown): string | null {
  const c = ctx as CtxLike;
  const authHeader =
    c.request?.headers?.get?.("authorization") ??
    c.headers?.get?.("authorization") ??
    null;
  if (typeof authHeader !== "string") return null;
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  return token.startsWith(API_KEY_PREFIX) ? token : null;
}
