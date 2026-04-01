import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  experimental_transcribe: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getTranscriptionModel: vi.fn(() => ({})),
}));

const { experimental_transcribe: transcribeMock } = await import("ai");
const { transcribeAudio } = await import("./audio-transcriber");

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.mocked(transcribeMock).mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-length": "10" }),
        blob: async () => new Blob([new Uint8Array(10)], { type: "audio/mpeg" }),
      }),
    );
  });

  it("throws when Content-Length exceeds limit", async () => {
    const sixMb = 6 * 1024 * 1024;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-length": String(sixMb) }),
        blob: async () => new Blob(),
      }),
    );

    await expect(transcribeAudio("https://example.com/a.mp3")).rejects.toThrow(
      "Audio files must be under 5 MB",
    );
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("throws when downloaded blob exceeds limit", async () => {
    const { AUDIO_MAX_UPLOAD_BYTES } = await import("@/utils/upload-limits");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        blob: async () =>
          new Blob([new Uint8Array(AUDIO_MAX_UPLOAD_BYTES + 1)], {
            type: "audio/mpeg",
          }),
      }),
    );

    await expect(transcribeAudio("https://example.com/a.mp3")).rejects.toThrow(
      "Audio files must be under 5 MB",
    );
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("formats segments with timestamps", async () => {
    vi.mocked(transcribeMock).mockResolvedValue({
      text: "full",
      segments: [
        { text: " Hello", startSecond: 94, endSecond: 95 },
        { text: " world", startSecond: 95, endSecond: 96 },
      ],
    } as never);

    const out = await transcribeAudio("https://example.com/a.mp3");

    expect(out).toBe(
      "[00:01:34] Hello\n[00:01:35] world",
    );
  });
});
