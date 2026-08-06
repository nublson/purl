import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("server-only", () => ({}));

type AuthPlugin = { id?: string; name?: string };

function getPluginIds(auth: { options?: { plugins?: AuthPlugin[] } }): string[] {
  return auth.options?.plugins?.map((p) => p.id ?? p.name ?? "") ?? [];
}

describe("auth config", () => {
  it("includes the apiKey and mcp plugins", async () => {
    const { auth } = await import("@/lib/auth");
    const pluginIds = getPluginIds(auth as { options?: { plugins?: AuthPlugin[] } });
    expect(pluginIds).toContain("api-key");
    expect(pluginIds).toContain("mcp");
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
