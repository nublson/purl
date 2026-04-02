import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const captureException = vi.mocked((await import("@sentry/nextjs")).captureException);
const { logIngestFailure, logIngestStart } = await import("./ingest-logger");

describe("ingest-logger", () => {
  beforeEach(() => {
    captureException.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("logs ingest start as structured JSON", () => {
    const logSpy = vi.spyOn(console, "log");

    logIngestStart("WEB", "link-1", "https://example.com");

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        event: "ingest_started",
        contentType: "WEB",
        linkId: "link-1",
        url: "https://example.com",
      }),
    );
  });

  it("calls Sentry.captureException with tags and extra context", () => {
    const err = new Error("boom");

    logIngestFailure("WEB", "link-1", "https://example.com", err);

    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { contentType: "WEB" },
      extra: { linkId: "link-1", url: "https://example.com" },
    });
  });
});
