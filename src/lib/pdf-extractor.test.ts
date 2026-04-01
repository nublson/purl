import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("unpdf", () => ({
  extractText: vi.fn(),
}));

const { extractText } = await import("unpdf");
const { extractPdfTextByPage } = await import("./pdf-extractor");

describe("extractPdfTextByPage", () => {
  beforeEach(() => {
    vi.mocked(extractText).mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("throws when PDF fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    } as never);

    await expect(
      extractPdfTextByPage("https://example.com/doc.pdf"),
    ).rejects.toThrow("Failed to fetch PDF (404)");
  });

  it("throws when response is not a PDF content type", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
    } as never);

    await expect(
      extractPdfTextByPage("https://example.com/doc"),
    ).rejects.toThrow("URL did not return a PDF document.");
  });

  it("extracts and normalizes non-empty page text", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    } as never);
    vi.mocked(extractText).mockResolvedValue({
      text: ["  First   page  ", "   ", "\nSecond\tpage\n"],
      totalPages: 3,
    } as never);

    const result = await extractPdfTextByPage("https://example.com/doc.pdf");

    expect(extractText).toHaveBeenCalledTimes(1);
    expect(result).toEqual(["First page", "Second page"]);
  });
});
