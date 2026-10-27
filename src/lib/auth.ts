import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { mcp } from "better-auth/plugins";
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
  deleteUserBlobsBeforeDelete,
  revokeSaveOnlyAppsOnSignOut,
} from "@/lib/auth-hooks";
import { ADVERTISED_SCOPES, SAVE_SCOPE } from "@/lib/oauth-scopes";
import { API_KEY_PREFIX, getPurlApiKey } from "@/lib/api-key-getter";

export const auth = betterAuth({
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
    mcp({
      loginPage: AUTH_LOGIN_PAGE,
      oidcConfig: {
        // Required by OIDCOptions' type (not optional, unlike consentPage) even
        // though the mcp plugin already forwards the top-level loginPage above --
        // duplicated here only to satisfy the installed Better Auth version's types.
        loginPage: AUTH_LOGIN_PAGE,
        consentPage: "/oauth/consent",
        // Authorize and token accept the save-only scope (merged with the
        // plugin's openid/profile/email/offline_access).
        scopes: [SAVE_SCOPE],
        // Advertised in the protected-resource document. The authorization
        // server document is patched in its route (the plugin's top-level
        // `metadata` option isn't typed in this version).
        metadata: { scopes_supported: [...ADVERTISED_SCOPES] },
      },
    }),
  ],
  database: prismaAdapter(prisma, {
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
      beforeDelete: async (user) => {
        await deleteUserBlobsBeforeDelete(user);
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
