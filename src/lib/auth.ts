import { betterAuth } from "better-auth";
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
import { assignUsernameOnCreate } from "@/lib/auth-hooks";

export const auth = betterAuth({
  plugins: [
    apiKey({
      enableSessionForAPIKeys: true,
      defaultPrefix: "purl_",
      // Per-key rate limiting defaults to 10 requests/day, which is far too low
      // for the MCP server (every request re-validates the key) and the REST
      // API. Abuse protection is handled at the proxy layer (Upstash).
      rateLimit: {
        enabled: false,
      },
      customAPIKeyGetter: (ctx) => {
        // Extract token from "Authorization: Bearer purl_..." header
        // GenericEndpointContext is a Better Auth internal type — cast via unknown
        type CtxLike = {
          request?: { headers?: { get?: (k: string) => string | null } };
          headers?: { get?: (k: string) => string | null };
        };
        const c = ctx as unknown as CtxLike;
        const authHeader =
          c.request?.headers?.get?.("authorization") ??
          c.headers?.get?.("authorization") ??
          null;
        if (typeof authHeader !== "string") return null;
        if (!authHeader.startsWith("Bearer ") || authHeader.length <= 7) return null;
        return authHeader.slice(7);
      },
    }),
    mcp({
      loginPage: AUTH_LOGIN_PAGE,
      oidcConfig: {
        // Required by OIDCOptions' type (not optional, unlike consentPage) even
        // though the mcp plugin already forwards the top-level loginPage above --
        // duplicated here only to satisfy the installed Better Auth version's types.
        loginPage: AUTH_LOGIN_PAGE,
        consentPage: "/oauth/consent",
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
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: assignUsernameOnCreate,
      },
    },
  },
});
