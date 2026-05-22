import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-outbound-fetch", () => ({
  safeFetch: vi.fn(() =>
    Promise.reject(new Error("network blocked in youtube-transcriber unit tests")),
  ),
}));

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}));

const {
  extractVideoId,
  fetchYouTubeTranscript,
  isRecoverableYoutubeTranscriptError,
} = await import("./youtube-transcriber");
const { YoutubeTranscript } = (await import("youtube-transcript")) as unknown as {
  YoutubeTranscript: { fetchTranscript: ReturnType<typeof vi.fn> };
};

describe("extractVideoId", () => {
  it("extracts id from youtube.com/watch?v=", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts id from youtu.be short links", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from /shorts/ URLs", () => {
    expect(extractVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts id from /live/ URLs", () => {
    expect(extractVideoId("https://youtube.com/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("throws on unsupported patterns", () => {
    expect(() => extractVideoId("https://youtube.com/watch")).toThrow(
      "Missing YouTube video id",
    );
  });
});

describe("fetchYouTubeTranscript", () => {
  it("formats timestamps and strips bracketed non-speech like [Music]", async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue([
      { text: "[Music]", offset: 0, duration: 1000 },
      { text: " Hello   &amp;  welcome ", offset: 94_000, duration: 1000 },
      { text: "[Applause] great!", offset: 95_000, duration: 1000 },
      { text: "  ", offset: 96_000, duration: 1000 },
    ] as never);

    const out = await fetchYouTubeTranscript("https://youtube.com/watch?v=dQw4w9WgXcQ");

    expect(out).toBe("[00:01:34] Hello & welcome\n[00:01:35] great!");
    expect(YoutubeTranscript.fetchTranscript).toHaveBeenCalledWith(
      "dQw4w9WgXcQ",
      expect.objectContaining({ fetch: expect.any(Function) }),
    );
  });

  it("throws when transcript is empty after cleaning", async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue([
      { text: "[Music]", offset: 0, duration: 1000 },
      { text: "   ", offset: 1, duration: 1000 },
    ] as never);

    await expect(
      fetchYouTubeTranscript("https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ).rejects.toThrow("YouTube transcript unavailable or empty");
  });

  it("rethrows library error after retry paths when nothing succeeds", async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValue(
      new Error(
        "[YoutubeTranscript] 🚨 No transcripts are available for this video (dQw4w9WgXcQ)",
      ),
    );

    await expect(
      fetchYouTubeTranscript("https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ).rejects.toThrow("No transcripts are available for this video");
  });
});

describe("isRecoverableYoutubeTranscriptError", () => {
  it("returns true for library no-caption errors (message prefix)", () => {
    expect(
      isRecoverableYoutubeTranscriptError(
        new Error(
          "[YoutubeTranscript] 🚨 Transcript is disabled on this video (vid)",
        ),
      ),
    ).toBe(true);
    expect(
      isRecoverableYoutubeTranscriptError(
        new Error(
          "[YoutubeTranscript] 🚨 No transcripts are available for this video (vid)",
        ),
      ),
    ).toBe(true);
  });

  it("returns true for empty-after-clean error", () => {
    expect(
      isRecoverableYoutubeTranscriptError(
        new Error("YouTube transcript unavailable or empty"),
      ),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isRecoverableYoutubeTranscriptError(new Error("boom"))).toBe(false);
  });
});
