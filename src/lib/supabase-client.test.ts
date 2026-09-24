import { afterEach, describe, expect, it, vi } from "vitest";

const RealtimeClient = vi.fn();
vi.mock("@supabase/realtime-js", () => ({ RealtimeClient }));

describe("getBrowserRealtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
    RealtimeClient.mockReset();
  });

  it("returns null on the server", async () => {
    const { getBrowserRealtime } = await import("./supabase-client");
    expect(getBrowserRealtime()).toBeNull();
  });

  it("connects to the project's realtime websocket with the anon key, once", async () => {
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const { getBrowserRealtime } = await import("./supabase-client");

    const first = getBrowserRealtime();
    const second = getBrowserRealtime();

    expect(first).toBe(second);
    expect(RealtimeClient).toHaveBeenCalledTimes(1);
    const [endpoint, options] = RealtimeClient.mock.calls[0];
    expect(endpoint).toBe("wss://abc.supabase.co/realtime/v1");
    expect(options.params).toEqual({ apikey: "anon-key" });
    await expect(options.accessToken()).resolves.toBe("anon-key");
  });
});
