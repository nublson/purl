import { LINKS_CLIENT_ORIGIN } from "@/lib/links-origin";
import { LINKS_ORIGIN_HEADER } from "@/lib/realtime-constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveLink } from "./save-link";

const { errorMock, successMock } = vi.hoisted(() => ({
  errorMock: vi.fn(),
  successMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: errorMock,
    success: successMock,
  },
}));

describe("saveLink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    errorMock.mockReset();
    successMock.mockReset();
  });

  it("returns null and shows validation toast for invalid URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await saveLink("not-a-url");

    expect(result).toBeNull();
    expect(errorMock).toHaveBeenCalledWith("Enter a full URL, like https://example.com.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns error object and shows API error message when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Boom" }), { status: 400 }),
    );

    const result = await saveLink("https://example.com");

    expect(result).toEqual({ error: "Boom" });
    expect(errorMock).toHaveBeenCalledWith("Boom");
  });

  it("returns error with limit flag on 402", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Cap", code: "LIMIT_REACHED" }), {
        status: 402,
      }),
    );

    const result = await saveLink("https://example.com");

    expect(result).toEqual({ error: "Cap", limit: true });
  });

  it("returns error and shows fallback API error when response body is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid-json", { status: 500 }),
    );

    const result = await saveLink("https://example.com");

    expect(result).toEqual({ error: "Unable to save the link. Try again." });
    expect(errorMock).toHaveBeenCalledWith("Unable to save the link. Try again.");
  });

  it("returns error when request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));

    const result = await saveLink("https://example.com");

    expect(result).toEqual({ error: "Network error" });
    expect(errorMock).toHaveBeenCalledWith("Unable to save the link. Check your connection and try again.");
  });

  it("trims URL, posts link, and returns id on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "link-1" }), { status: 201 }),
    );

    const result = await saveLink("  https://example.com  ");

    expect(fetchSpy).toHaveBeenCalledWith("/api/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
      },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(result).toEqual({ id: "link-1" });
    expect(errorMock).not.toHaveBeenCalled();
    expect(successMock).not.toHaveBeenCalled();
  });

  it("sends folderId and toasts 'Saved to {emoji} {name}' when no move happened", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "link-1", moved: false }), {
        status: 201,
      }),
    );

    const result = await saveLink("https://example.com", {
      folder: { id: "folder-1", name: "Books", emoji: "📚" },
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [LINKS_ORIGIN_HEADER]: LINKS_CLIENT_ORIGIN,
      },
      body: JSON.stringify({ url: "https://example.com", folderId: "folder-1" }),
    });
    expect(result).toEqual({ id: "link-1" });
    expect(successMock).toHaveBeenCalledWith("Saved to 📚 Books");
  });

  it("toasts 'Moved to {emoji} {name}' when the save moved an existing link", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "link-1", moved: true }), {
        status: 201,
      }),
    );

    const result = await saveLink("https://example.com", {
      folder: { id: "folder-1", name: "Books", emoji: "📚" },
    });

    expect(result).toEqual({ id: "link-1" });
    expect(successMock).toHaveBeenCalledWith("Moved to 📚 Books");
  });

  it("does not send folderId or toast success when no folder is given", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "link-1" }), { status: 201 }),
    );

    await saveLink("https://example.com");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/links",
      expect.objectContaining({
        body: JSON.stringify({ url: "https://example.com" }),
      }),
    );
    expect(successMock).not.toHaveBeenCalled();
  });
});
