import "server-only";

import { SignJWT, importPKCS8 } from "jose";
import type { BetterAuthOptions } from "better-auth";

/** The three sign-in providers Purl supports. Apple is env-gated (see `getEnabledProviders`). */
export type ProviderId = "google" | "github" | "apple";

/** Trusted origin Better Auth must allow for Apple's form_post redirect back to our callback. */
export const APPLE_TRUSTED_ORIGIN = "https://appleid.apple.com";

/** MCP sign-in (and its OIDC consent flow) send the user to the landing page, not a dedicated /login route. */
export const AUTH_LOGIN_PAGE = "/";

/**
 * Account linking: a user who originally signed up with email/password (now
 * removed) or a different OAuth provider can link Google/GitHub/Apple to the
 * same account, even if their local email was never verified
 * (`requireLocalEmailVerified: false`) and, for an explicit Connect from
 * Settings, even if the provider reports a different email address than the
 * one already on file (`allowDifferentEmails: true`).
 *
 * `trustedProviders` is intentionally absent. Listing a provider as trusted
 * makes Better Auth skip the provider's own `emailVerified` check, so any
 * Google/GitHub/Apple identity merely *claiming* a legacy user's email (even
 * unverified) would be implicitly linked and signed in as that user. Without
 * it, implicit linking on sign-in only happens when the provider vouches that
 * the email is verified, and an explicit Connect with an unverified provider
 * email fails with `unable_to_link_account`.
 *
 * `updateUserInfoOnLink: true` copies the linking provider's name and image
 * onto the user (never the email) — this is how avatars get updated for
 * legacy accounts on their first OAuth sign-in, now that avatar upload is
 * gone and the app relies entirely on the OAuth provider's profile photo. Do
 * not add `overrideUserInfoOnSignIn`: it also rewrites the email on every
 * sign-in, which we don't want.
 */
export const ACCOUNT_LINKING = {
  enabled: true,
  requireLocalEmailVerified: false,
  allowDifferentEmails: true,
  updateUserInfoOnLink: true,
};

function hasGoogleVars(env: Partial<NodeJS.ProcessEnv>): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function hasGithubVars(env: Partial<NodeJS.ProcessEnv>): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

function hasAppleVars(env: Partial<NodeJS.ProcessEnv>): boolean {
  return Boolean(
    env.APPLE_CLIENT_ID &&
      env.APPLE_TEAM_ID &&
      env.APPLE_KEY_ID &&
      env.APPLE_PRIVATE_KEY,
  );
}

/**
 * Which providers are configured (have all required env vars set) for the
 * given environment. Apple only counts once all four of its vars are present.
 * Used by other tasks (e.g. the sign-in page) to decide which buttons to show.
 */
export function getEnabledProviders(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): ProviderId[] {
  const providers: ProviderId[] = [];
  if (hasGoogleVars(env)) providers.push("google");
  if (hasGithubVars(env)) providers.push("github");
  if (hasAppleVars(env)) providers.push("apple");
  return providers;
}

/**
 * Apple's `client_secret` is not a static value — it's a JWT signed with the
 * private key downloaded from the Apple Developer portal, per
 * https://www.better-auth.com/docs/authentication/apple#configuration.
 */
async function generateAppleClientSecret(env: {
  APPLE_TEAM_ID: string;
  APPLE_CLIENT_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
}): Promise<string> {
  const privateKey = await importPKCS8(
    env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    "ES256",
  );
  const now = Math.floor(Date.now() / 1000);
  const sixMonthsInSeconds = 180 * 24 * 60 * 60;

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + sixMonthsInSeconds)
    .setAudience("https://appleid.apple.com")
    .setSubject(env.APPLE_CLIENT_ID)
    .sign(privateKey);
}

/**
 * Builds Better Auth's `socialProviders` option from environment variables.
 *
 * Google and GitHub are required in production (missing vars throw so a
 * misconfigured deploy fails fast); outside production, missing vars just
 * skip that provider so local dev doesn't need every credential set. Apple is
 * always optional and only enabled once all four `APPLE_*` vars are present.
 *
 * `auth.ts` is imported at module scope by routes that `next build` needs to
 * evaluate to collect static params (e.g.
 * `.well-known/oauth-authorization-server/route.ts`), and `NODE_ENV` is
 * `"production"` during that build even though real OAuth vars aren't set
 * yet (they're a deploy-time secret, not a build-time one). Next sets
 * `NEXT_PHASE=phase-production-build` for exactly that step, so the
 * production check is skipped then — the missing provider is simply omitted,
 * the same as in a non-production environment — and only enforced for an
 * actual `production` runtime request.
 */
export function getSocialProviders(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): BetterAuthOptions["socialProviders"] {
  const isProductionRuntime =
    env.NODE_ENV === "production" && env.NEXT_PHASE !== "phase-production-build";

  function requireInProduction(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET") {
    if (isProductionRuntime && !env[name]) {
      throw new Error(`${name} is required in production for social sign-in.`);
    }
  }

  const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};

  requireInProduction("GOOGLE_CLIENT_ID");
  requireInProduction("GOOGLE_CLIENT_SECRET");
  if (hasGoogleVars(env)) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID as string,
      clientSecret: env.GOOGLE_CLIENT_SECRET as string,
    };
  }

  requireInProduction("GITHUB_CLIENT_ID");
  requireInProduction("GITHUB_CLIENT_SECRET");
  if (hasGithubVars(env)) {
    providers.github = {
      clientId: env.GITHUB_CLIENT_ID as string,
      clientSecret: env.GITHUB_CLIENT_SECRET as string,
    };
  }

  if (hasAppleVars(env)) {
    const appleEnv = {
      APPLE_TEAM_ID: env.APPLE_TEAM_ID as string,
      APPLE_CLIENT_ID: env.APPLE_CLIENT_ID as string,
      APPLE_KEY_ID: env.APPLE_KEY_ID as string,
      APPLE_PRIVATE_KEY: env.APPLE_PRIVATE_KEY as string,
    };
    providers.apple = async () => ({
      clientId: appleEnv.APPLE_CLIENT_ID,
      clientSecret: await generateAppleClientSecret(appleEnv),
    });
  }

  return providers;
}
