import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppBaseUrl } from "./billing-url";

describe("getAppBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers BETTER_AUTH_URL and strips a trailing slash", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.purl.example/");
    vi.stubEnv("VERCEL_URL", "ignored.vercel.app");

    expect(getAppBaseUrl()).toBe("https://app.purl.example");
  });

  it("falls back to https://VERCEL_URL when BETTER_AUTH_URL is unset", () => {
    vi.stubEnv("VERCEL_URL", "my-app.vercel.app");

    expect(getAppBaseUrl()).toBe("https://my-app.vercel.app");
  });

  it("normalizes VERCEL_URL that already includes a scheme", () => {
    vi.stubEnv("VERCEL_URL", "https://preview.vercel.app");

    expect(getAppBaseUrl()).toBe("https://preview.vercel.app");
  });

  it("defaults to localhost when no env vars are set", () => {
    expect(getAppBaseUrl()).toBe("http://localhost:3000");
  });
});
