import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { apiKey } from "@better-auth/api-key";
import prisma from "@/lib/prisma";
import {
  ACCOUNT_LINKING,
  APPLE_TRUSTED_ORIGIN,
  AUTH_LOGIN_PAGE,
  getEnabledProviders,
  getSocialProviders,
} from "@/lib/auth-providers";
import {
  assignUsernameOnCreate,
  deleteUserBlobsAfterDelete,
  revokeSaveOnlyAppsOnSignOut,
} from "@/lib/auth-hooks";
import { ADVERTISED_SCOPES } from "@/lib/oauth-scopes";
import { mcpResource } from "@/lib/oauth-issuer";
import { API_KEY_PREFIX, getPurlApiKey } from "@/lib/api-key-getter";

const OAUTH_MODELS = new Set([
  "jwks",
  "oauthClient",
  "oauthClientAssertion",
  "oauthClientResource",
  "oauthConsent",
  "oauthAccessToken",
  "oauthRefreshToken",
  "oauthResource",
]);

/**
 * Unit tests replace Prisma with a partial stub. Plugin init seeds
 * `oauthResource` on import, and a stub that omits the model rejects that
 * write. The real client already has these delegates, so this is a no-op there.
 */
function withOAuthModelStubs<T extends object>(client: T): T {
  const stub = {
    findFirst: async () => null,
    findUnique: async () => null,
    findMany: async () => [],
    create: async ({ data }: { data?: Record<string, unknown> } = {}) => ({
      id: "oauth-seed",
      ...data,
    }),
    update: async () => ({}),
    delete: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
  };
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value !== undefined) return value;
      if (typeof prop === "string" && OAUTH_MODELS.has(prop)) return stub;
      return value;
    },
  });
}

export const auth = betterAuth({
  // The JWT plugin's `/token` route signs session payloads with the same key
  // the OAuth provider uses for access tokens. It is not part of MCP login.
  disabledPaths: ["/token"],
  plugins: [
    apiKey({
      enableSessionForAPIKeys: true,
      defaultPrefix: API_KEY_PREFIX,
      // Per-key rate limiting defaults to 10 requests/day, which is far too low
      // for the MCP server (every request re-validates the key) and the REST
      // API. Abuse protection is handled at the proxy layer (Upstash).
      rateLimit: {
        enabled: false,
      },
      customAPIKeyGetter: getPurlApiKey,
    }),
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      loginPage: AUTH_LOGIN_PAGE,
      consentPage: "/oauth/consent",
      resource: mcpResource(),
      // Authorize and token accept the save-only scope along with the OIDC
      // defaults. Both discovery documents advertise this list.
      scopes: [...ADVERTISED_SCOPES],
      advertisedMetadata: { scopes_supported: [...ADVERTISED_SCOPES] },
      // Claude and other MCP clients register themselves. 1.7 leaves dynamic
      // registration off unless both flags are set.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Pre-registered clients (the extension, nublson.com) are not rows in
      // oauthClientResource. Open registration also requests the resource.
      enforcePerClientResources: false,
    }),
  ],
  database: prismaAdapter(withOAuthModelStubs(prisma), {
    provider: "postgresql",
  }),
  trustedOrigins: getEnabledProviders(process.env).includes("apple")
    ? [APPLE_TRUSTED_ORIGIN]
    : undefined,
  socialProviders: getSocialProviders(process.env),
  account: {
    accountLinking: ACCOUNT_LINKING,
  },
  user: {
    deleteUser: {
      enabled: true,
      afterDelete: async (user) => {
        await deleteUserBlobsAfterDelete(user);
      },
    },
    additionalFields: {
      username: {
        type: "string",
        // `input: false` already keeps clients from setting this directly.
        // `required` must stay false: Better Auth's OAuth create path runs
        // `parseAdditionalUserInputFromProviderProfile(..., "create")`
        // (node_modules/better-auth/dist/oauth2/link-account.mjs) BEFORE
        // `databaseHooks.user.create.before` below assigns a username, and
        // `parseInputData` (dist/db/schema.mjs) throws BAD_REQUEST for a
        // `required: true` field with no `defaultValue` at that point — every
        // new OAuth sign-up would fail. The Prisma column is still
        // `String @unique` (NOT NULL); the hook always supplies the value
        // before the row is written, so no row is ever created without one.
        // Regression test: src/lib/auth.test.ts "does not reject OAuth
        // create profiles because of the username field".
        required: false,
        input: false,
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      // Bumped from the default "1": pre-deploy signed session_data cookies
      // were cached before `username` existed on the user, and Better Auth
      // serves a cached cookie's user as-is without re-checking the DB
      // (dist/api/routes/session.mjs). Changing `version` invalidates every
      // cookie cache signed under the old version — session.mjs compares it
      // and falls back to a fresh DB lookup — so no signed-in user can hit
      // getSessionUser's username check below with a stale, username-less
      // cached user after this deploys. Bump again if another field is ever
      // added that old caches wouldn't have and code assumes is present.
      version: "2",
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-out") await revokeSaveOnlyAppsOnSignOut(ctx);
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: assignUsernameOnCreate,
      },
    },
  },
});
