import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("server-only", () => ({}));

describe("auth config", () => {
  it("includes the apiKey plugin", async () => {
    const { auth } = await import("@/lib/auth");
    const pluginIds = (auth as any).options?.plugins?.map(
      (p: any) => p.id ?? p.name
    ) ?? [];
    expect(pluginIds).toContain("api-key");
  });
});

describe("Bearer token extraction logic", () => {
  // Mirror of the customAPIKeyGetter logic from auth.ts
  function extractBearer(authHeader: string | null): string | null {
    if (typeof authHeader !== "string") return null;
    if (!authHeader.startsWith("Bearer ") || authHeader.length <= 7) return null;
    return authHeader.slice(7);
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
});
