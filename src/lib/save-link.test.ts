import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveLink } from "./save-link";

const { errorMock } = vi.hoisted(() => ({
  errorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: errorMock,
  },
}));

describe("saveLink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    errorMock.mockReset();
  });

  it("returns null and shows validation toast for invalid URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await saveLink("not-a-url");

    expect(result).toBeNull();
    expect(errorMock).toHaveBeenCalledWith("Not a valid URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null and shows API error message when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Boom" }), { status: 400 }),
    );

    const result = await saveLink("https://example.com");

    expect(result).toBeNull();
    expect(errorMock).toHaveBeenCalledWith("Boom");
  });

  it("returns null and shows fallback API error when response body is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid-json", { status: 500 }),
    );

    const result = await saveLink("https://example.com");

    expect(result).toBeNull();
    expect(errorMock).toHaveBeenCalledWith("Failed to save link");
  });

  it("returns null and shows error toast when request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));

    const result = await saveLink("https://example.com");

    expect(result).toBeNull();
    expect(errorMock).toHaveBeenCalledWith("Failed to save link");
  });

  it("trims URL, posts link, and returns id on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "link-1" }), { status: 201 }),
    );

    const result = await saveLink("  https://example.com  ");

    expect(fetchSpy).toHaveBeenCalledWith("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(result).toEqual({ id: "link-1" });
    expect(errorMock).not.toHaveBeenCalled();
  });
});
