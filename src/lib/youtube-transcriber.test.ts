import { describe, expect, it, vi } from "vitest";

vi.mock("youtube-transcript/dist/youtube-transcript.esm.js", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}));

const { extractVideoId, fetchYouTubeTranscript } = await import("./youtube-transcriber");
const { YoutubeTranscript } = (await import(
  "youtube-transcript/dist/youtube-transcript.esm.js"
)) as unknown as {
  YoutubeTranscript: { fetchTranscript: ReturnType<typeof vi.fn> };
};

describe("extractVideoId", () => {
  it("extracts id from youtube.com/watch?v=", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from youtu.be short links", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from /shorts/ URLs", () => {
    expect(extractVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from /live/ URLs", () => {
    expect(extractVideoId("https://youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
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
  });

  it("throws when transcript is empty after cleaning", async () => {
    vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue([
      { text: "[Music]", offset: 0, duration: 1000 },
      { text: "   ", offset: 1000, duration: 1000 },
    ] as never);

    await expect(
      fetchYouTubeTranscript("https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ).rejects.toThrow("YouTube transcript unavailable or empty");
  });
});

