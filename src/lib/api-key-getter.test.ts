import { describe, expect, it } from "vitest";
import { getPurlApiKey } from "./api-key-getter";

const ctx = (authorization?: string) => ({
  request: {
    headers: {
      get: (k: string) => (k === "authorization" ? (authorization ?? null) : null),
    },
  },
});

describe("getPurlApiKey", () => {
  it("returns a purl_ API key from the Bearer header", () => {
    expect(getPurlApiKey(ctx("Bearer purl_abc123"))).toBe("purl_abc123");
  });

  it("ignores OAuth access tokens so the apiKey hook doesn't reject them", () => {
    // Better Auth's mcp plugin issues 32-character tokens with no purl_ prefix.
    expect(getPurlApiKey(ctx("Bearer " + "a".repeat(32)))).toBeNull();
  });

  it("returns null without an Authorization header, a Bearer scheme or a token", () => {
    expect(getPurlApiKey(ctx())).toBeNull();
    expect(getPurlApiKey(ctx("Basic purl_abc123"))).toBeNull();
    expect(getPurlApiKey(ctx("Bearer "))).toBeNull();
  });

  it("falls back to ctx.headers when the request has none", () => {
    const headers = { get: () => "Bearer purl_xyz" };
    expect(getPurlApiKey({ headers })).toBe("purl_xyz");
  });
});
