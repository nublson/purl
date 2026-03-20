import { describe, expect, it } from "vitest";
import { isAudioUrl } from "./audio";

describe("isAudioUrl", () => {
  it("returns true for supported direct audio file extensions", () => {
    expect(isAudioUrl("https://example.com/a.mp3")).toBe(true);
    expect(isAudioUrl("https://example.com/a.wav")).toBe(true);
    expect(isAudioUrl("https://example.com/a.ogg")).toBe(true);
    expect(isAudioUrl("https://example.com/a.flac")).toBe(true);
    expect(isAudioUrl("https://example.com/a.aac")).toBe(true);
    expect(isAudioUrl("https://example.com/a.m4a")).toBe(true);
    expect(isAudioUrl("https://example.com/a.opus")).toBe(true);
    expect(isAudioUrl("https://example.com/a.wma")).toBe(true);
  });

  it("is case-insensitive for file extensions", () => {
    expect(isAudioUrl("https://example.com/track.MP3")).toBe(true);
    expect(isAudioUrl("https://example.com/track.FlAc")).toBe(true);
  });

  it("returns true for supported streaming platform URLs", () => {
    expect(isAudioUrl("https://open.spotify.com/track/abc123")).toBe(true);
    expect(isAudioUrl("https://open.spotify.com/album/abc123")).toBe(true);
    expect(isAudioUrl("https://open.spotify.com/playlist/abc123")).toBe(true);
    expect(isAudioUrl("https://open.spotify.com/artist/abc123")).toBe(true);
    expect(isAudioUrl("https://open.spotify.com/episode/abc123")).toBe(true);
    expect(isAudioUrl("https://music.apple.com/us/album/id123")).toBe(true);
    expect(isAudioUrl("https://music.youtube.com/watch?v=abc123")).toBe(true);
  });

  it("returns false for unsupported spotify paths and non-audio URLs", () => {
    expect(isAudioUrl("https://open.spotify.com/show/abc123")).toBe(false);
    expect(isAudioUrl("https://example.com/docs/file.pdf")).toBe(false);
    expect(isAudioUrl("https://example.com/page")).toBe(false);
    expect(isAudioUrl("not a url")).toBe(false);
    expect(isAudioUrl("")).toBe(false);
  });
});
