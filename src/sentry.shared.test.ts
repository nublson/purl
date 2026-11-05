import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRACES_RATE,
  serverTracesSampler,
  sharedSentryOptions,
} from "./sentry.shared";

describe("sharedSentryOptions", () => {
  it("narrows data collection so saved links and searches are not sent", () => {
    expect(sharedSentryOptions.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
    });
    expect(sharedSentryOptions.dataCollection.httpHeaders).toMatchObject({
      request: { allow: ["user-agent", "accept", "content-type"] },
      response: false,
    });
    expect(sharedSentryOptions.ignoreErrors).toContain("AbortError");
  });
});

describe("serverTracesSampler", () => {
  it("always traces Vercel cron routes for monitor check-ins", () => {
    const inherit = vi.fn(() => 0.05);
    expect(
      serverTracesSampler({
        name: "GET /api/cron/enrich-links",
        inheritOrSampleWith: inherit,
      }),
    ).toBe(1);
    expect(inherit).not.toHaveBeenCalled();
  });

  it("uses the default rate for other transactions", () => {
    const inherit = vi.fn((rate: number) => rate * 0.5);
    expect(
      serverTracesSampler({
        name: "GET /api/links",
        inheritOrSampleWith: inherit,
      }),
    ).toBe(DEFAULT_TRACES_RATE * 0.5);
    expect(inherit).toHaveBeenCalledWith(DEFAULT_TRACES_RATE);
  });
});
