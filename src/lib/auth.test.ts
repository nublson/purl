import { describe, it, expect, vi } from "vitest";
import type { BetterAuthOptions } from "better-auth";

vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("server-only", () => ({}));

describe("auth config", () => {
  type AuthLike = {
    options?: {
      plugins?: Array<{
        id?: string;
        name?: string;
        options?: {
          oidcConfig?: { consentPage?: string; loginPage?: string };
        };
      }>;
    };
  };

  it("does not reject OAuth create profiles because of the username field", async () => {
    // Regression test for a bug where `additionalFields.username` was
    // `required: true`. Better Auth's OAuth account-creation path calls
    // `parseAdditionalUserInputFromProviderProfile(options, profile, "create")`
    // (node_modules/better-auth/dist/oauth2/link-account.mjs) BEFORE
    // `databaseHooks.user.create.before` runs and assigns a username. With
    // `required: true` and no `defaultValue`, `parseInputData`
    // (dist/db/schema.mjs) throws `APIError: username is required` for
    // every brand-new GitHub/Google/Apple sign-up — this reproduces that
    // exact call against our real, configured `auth.options` using the
    // library's own public `better-auth/db` entry point (no DB access; this
    // only reads schema shape, never hits Prisma).
    const { parseAdditionalUserInputFromProviderProfile } = await import("better-auth/db");
    const { auth } = await import("@/lib/auth");
    const options = (auth as unknown as { options: BetterAuthOptions }).options;
    const githubLikeProfile = {
      id: 123456,
      login: "octocat",
      email: "octocat@example.com",
      name: "The Octocat",
    };
    expect(() =>
      parseAdditionalUserInputFromProviderProfile(options, githubLikeProfile, "create"),
    ).not.toThrow();
  });

  it("includes the apiKey plugin", async () => {
    const { auth } = await import("@/lib/auth");
    const pluginIds =
      (auth as unknown as AuthLike).options?.plugins?.map(
        (p) => p.id ?? p.name,
      ) ?? [];
    expect(pluginIds).toContain("api-key");
    expect(pluginIds).toContain("mcp");
  });

  it("includes the mcp plugin with OAuth consent and login pages configured", async () => {
    const { auth } = await import("@/lib/auth");
    const plugins = (auth as unknown as AuthLike).options?.plugins ?? [];
    const pluginIds = plugins.map((p) => p.id ?? p.name);
    expect(pluginIds).toContain("mcp");

    const mcpPlugin = plugins.find((p) => (p.id ?? p.name) === "mcp");
    expect(mcpPlugin?.options?.oidcConfig?.consentPage).toBe("/oauth/consent");
    expect(mcpPlugin?.options?.oidcConfig?.loginPage).toBe("/");
  });

});

describe("Bearer token extraction logic", () => {
  // Mirror of the customAPIKeyGetter logic from auth.ts
  type CtxLike = {
    request?: { headers?: { get?: (k: string) => string | null } };
    headers?: { get?: (k: string) => string | null };
  };

  function extractBearerFromContext(ctx: CtxLike): string | null {
    const authHeader =
      ctx.request?.headers?.get?.("authorization") ??
      ctx.headers?.get?.("authorization") ??
      null;
    if (typeof authHeader !== "string") return null;
    if (!authHeader.startsWith("Bearer ") || authHeader.length <= 7) return null;
    return authHeader.slice(7);
  }

  function extractBearer(authHeader: string | null): string | null {
    return extractBearerFromContext({
      request: { headers: { get: (k) => (k === "authorization" ? authHeader : null) } },
    });
  }

  it("extracts token from valid Bearer header", () => {
    expect(extractBearer("Bearer purl_abc123")).toBe("purl_abc123");
  });

  it("returns null for missing header", () => {
    expect(extractBearer(null)).toBeNull();
  });

  it("returns null for non-Bearer scheme", () => {
    expect(extractBearer("Basic abc123")).toBeNull();
  });

  it("returns null for bare Bearer with no token", () => {
    expect(extractBearer("Bearer ")).toBeNull();
    expect(extractBearer("Bearer")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractBearer("")).toBeNull();
  });

  it("reads Authorization from ctx.request.headers when present", () => {
    expect(
      extractBearerFromContext({
        request: {
          headers: {
            get: (k) => (k === "authorization" ? "Bearer purl_from_request" : null),
          },
        },
        headers: { get: () => "Bearer purl_from_ctx" },
      }),
    ).toBe("purl_from_request");
  });

  it("falls back to ctx.headers when request headers are absent", () => {
    expect(
      extractBearerFromContext({
        headers: {
          get: (k) => (k === "authorization" ? "Bearer purl_from_ctx" : null),
        },
      }),
    ).toBe("purl_from_ctx");
  });
});
