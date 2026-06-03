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
