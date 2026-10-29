import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("og-theme constants", () => {
  it("embeds the muted globe and pearl mark as drawable data URLs", async () => {
    const { GLOBE_SVG, LOGO_SVG, MUTED } = await import("./og-theme");
    expect(GLOBE_SVG.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(LOGO_SVG.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const globe = Buffer.from(GLOBE_SVG.split(",")[1]!, "base64").toString("utf8");
    expect(globe).toContain(MUTED);
  });
});

describe("loadInter", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads 400, 500 and 600 once and reuses the same promise", async () => {
    fetchMock.mockImplementation(async (url) => {
      const weight = String(url).match(/inter-latin-(\d+)/)?.[1];
      return new Response(new ArrayBuffer(8), { status: 200, headers: { "x-w": weight! } });
    });

    const { loadInter } = await import("./og-theme");
    const first = await loadInter();
    const second = await loadInter();

    expect(second).toBe(first);
    expect(first).toHaveLength(3);
    expect(first.map((f) => f.weight).sort()).toEqual([400, 500, 600]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    }
  });

  it("returns an empty list when the CDN fails and tries again on the next call", async () => {
    let calls = 0;
    fetchMock.mockImplementation(async () => {
      calls += 1;
      if (calls <= 3) throw new Error("offline");
      return new Response(new ArrayBuffer(4), { status: 200 });
    });

    const { loadInter } = await import("./og-theme");
    expect(await loadInter()).toEqual([]);
    expect(calls).toBe(3);

    const fonts = await loadInter();
    expect(fonts).toHaveLength(3);
    expect(calls).toBe(6);
  });

  it("treats a non-OK response as failure", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    const { loadInter } = await import("./og-theme");
    expect(await loadInter()).toEqual([]);
  });
});
