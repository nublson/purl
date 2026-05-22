import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/safe-outbound-fetch", () => ({
  safeFetch: vi.fn(() =>
    Promise.reject(new Error("network blocked in youtube-transcriber unit tests")),
  ),
}));

vi.mock("@/lib/ai", () => ({
  getTranscriptionModel: vi.fn(() => "whisper-model"),
}));

vi.mock("ai", () => ({
  experimental_transcribe: vi.fn(),
}));

class MockTranscriptSegment {
  static type = "TranscriptSegment";
  snippet: { text: string };
  start_ms: string;
  constructor(snippet: { text: string }, start_ms: string) {
    this.snippet = snippet;
    this.start_ms = start_ms;
  }
  is(klass: unknown) {
    return klass === MockTranscriptSegment;
  }
}

const mockGetTranscript = vi.fn();
const mockChooseFormat = vi.fn();
const mockGetInfo = vi.fn(() =>
  Promise.resolve({
    getTranscript: mockGetTranscript,
    chooseFormat: mockChooseFormat,
  }),
);

vi.mock("youtubei.js", () => {
  const mockCreate = vi.fn(() =>
    Promise.resolve({
      getInfo: mockGetInfo,
      session: { player: {} },
    }),
  );
  return {
    default: { create: mockCreate },
    YTNodes: { TranscriptSegment: MockTranscriptSegment },
  };
});

const {
  extractVideoId,
  fetchYouTubeTranscript,
  isYouTubeTranscriptUnavailableError,
  YoutubeTranscriptUnavailableError,
} = await import("./youtube-transcriber");

const { experimental_transcribe: transcribeMock } = await import("ai");

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

describe("fetchYouTubeTranscript — fast path (InnerTube transcript)", () => {
  it("returns formatted [HH:MM:SS] lines from InnerTube transcript", async () => {
    const makeSegment = (text: string, start_ms: string) =>
      new MockTranscriptSegment({ text }, start_ms);

    mockGetTranscript.mockResolvedValue({
      transcript: {
        content: {
          body: {
            initial_segments: [
              makeSegment("[Music]", "0"),
              makeSegment(" Hello   &amp;  world ", "94000"),
              makeSegment("[Applause] great!", "95000"),
              makeSegment("  ", "96000"),
            ],
          },
        },
      },
    });

    const result = await fetchYouTubeTranscript(
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
    );

    expect(result).toBe("[00:01:34] Hello & world\n[00:01:35] great!");
  });

  it("falls through to Whisper when getTranscript returns no segments", async () => {
    mockGetTranscript.mockResolvedValue({
      transcript: { content: { body: { initial_segments: [] } } },
    });
    mockChooseFormat.mockReturnValue({
      decipher: vi.fn(() => Promise.resolve("https://cdn.googlevideo.com/audio")),
    });

    const { safeFetch } = await import("@/lib/safe-outbound-fetch");
    vi.mocked(safeFetch).mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob([new Uint8Array(100)])),
    } as unknown as Response);

    vi.mocked(transcribeMock as ReturnType<typeof vi.fn>).mockResolvedValue({
      segments: [{ text: "hello world", startSecond: 1, endSecond: 3 }],
      text: "hello world",
    });

    const result = await fetchYouTubeTranscript(
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
    );

    expect(result).toBe("[00:00:01] hello world");
  });

  it("falls through to Whisper when getTranscript throws", async () => {
    mockGetTranscript.mockRejectedValue(new Error("no transcript"));
    mockChooseFormat.mockReturnValue({
      decipher: vi.fn(() => Promise.resolve("https://cdn.googlevideo.com/audio")),
    });

    const { safeFetch } = await import("@/lib/safe-outbound-fetch");
    vi.mocked(safeFetch).mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob([new Uint8Array(100)])),
    } as unknown as Response);

    vi.mocked(transcribeMock as ReturnType<typeof vi.fn>).mockResolvedValue({
      segments: [{ text: "whisper result", startSecond: 0, endSecond: 2 }],
      text: "whisper result",
    });

    const result = await fetchYouTubeTranscript(
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
    );

    expect(result).toBe("[00:00:00] whisper result");
  });
});

describe("fetchYouTubeTranscript — Whisper path", () => {
  it("throws YoutubeTranscriptUnavailableError when no audio format", async () => {
    mockGetTranscript.mockResolvedValue({
      transcript: { content: null },
    });
    mockChooseFormat.mockImplementation(() => {
      throw new Error("No format found");
    });

    await expect(
      fetchYouTubeTranscript("https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ).rejects.toBeInstanceOf(YoutubeTranscriptUnavailableError);
  });

  it("throws YoutubeTranscriptUnavailableError when audio download fails", async () => {
    mockGetTranscript.mockResolvedValue({
      transcript: { content: null },
    });
    mockChooseFormat.mockReturnValue({
      decipher: vi.fn(() => Promise.resolve("https://cdn.googlevideo.com/audio")),
    });

    const { safeFetch } = await import("@/lib/safe-outbound-fetch");
    vi.mocked(safeFetch).mockRejectedValueOnce(new Error("network error"));

    await expect(
      fetchYouTubeTranscript("https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ).rejects.toBeInstanceOf(YoutubeTranscriptUnavailableError);
  });
});

describe("isYouTubeTranscriptUnavailableError", () => {
  it("returns true for YoutubeTranscriptUnavailableError", () => {
    expect(
      isYouTubeTranscriptUnavailableError(
        new YoutubeTranscriptUnavailableError("no transcript"),
      ),
    ).toBe(true);
  });

  it("returns false for generic errors", () => {
    expect(isYouTubeTranscriptUnavailableError(new Error("boom"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isYouTubeTranscriptUnavailableError("string")).toBe(false);
    expect(isYouTubeTranscriptUnavailableError(null)).toBe(false);
  });
});
