import { afterEach, describe, expect, it, vi } from "vitest";

describe("DEFAULT_TRACES_RATE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadRate() {
    const { DEFAULT_TRACES_RATE } = await import("./sentry.shared");
    return DEFAULT_TRACES_RATE;
  }

  it("samples every trace in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await loadRate()).toBe(1);
  });

  it("samples 10% of traces outside development", async () => {
    for (const nodeEnv of ["production", "test"]) {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", nodeEnv);
      expect(await loadRate()).toBe(0.1);
    }
  });
});
