import { describe, expect, it } from "vitest";
import { sharedSentryOptions } from "./sentry.shared";

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
