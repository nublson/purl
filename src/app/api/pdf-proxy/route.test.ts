import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSafeFetch } = vi.hoisted(() => ({
  mockSafeFetch: vi.fn(),
}));

vi.mock("@/lib/safe-outbound-fetch", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/safe-outbound-fetch")>();
  return {
    ...mod,
    safeFetch: mockSafeFetch,
    limitReadableStreamByBytes: vi.fn((body: ReadableStream) => body),
  };
});

const { UnsafeOutboundUrlError } = await import("@/lib/safe-outbound-fetch");

function getRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/pdf-proxy", () => {
  beforeEach(() => {
    mockSafeFetch.mockReset();
  });

  it("returns 400 when url query param is missing", async () => {
    const { GET } = await import("./route");
    const res = await GET(getRequest("http://localhost/api/pdf-proxy"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing url query param" });
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when url query param is invalid", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      getRequest("http://localhost/api/pdf-proxy?url=not-a-url"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid url query param" });
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("returns 400 for non-http(s) protocols", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      getRequest(
        "http://localhost/api/pdf-proxy?url=" +
          encodeURIComponent("file:///etc/passwd"),
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unsupported URL protocol" });
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when safeFetch rejects the URL as unsafe", async () => {
    mockSafeFetch.mockRejectedValue(new UnsafeOutboundUrlError("blocked"));
    const { GET } = await import("./route");
    const res = await GET(
      getRequest(
        "http://localhost/api/pdf-proxy?url=" +
          encodeURIComponent("https://example.com/doc.pdf"),
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "URL is not allowed" });
  });

  it("returns 502 when upstream fetch fails", async () => {
    mockSafeFetch.mockResolvedValue({
      ok: false,
      body: null,
      headers: new Headers(),
    });
    const { GET } = await import("./route");
    const res = await GET(
      getRequest(
        "http://localhost/api/pdf-proxy?url=" +
          encodeURIComponent("https://example.com/doc.pdf"),
      ),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Failed to fetch PDF from source",
    });
  });

  it("proxies a successful PDF response", async () => {
    const body = new ReadableStream();
    mockSafeFetch.mockResolvedValue({
      ok: true,
      body,
      headers: new Headers({
        "content-type": "application/pdf",
        "content-length": "1234",
      }),
    });

    const { GET } = await import("./route");
    const res = await GET(
      getRequest(
        "http://localhost/api/pdf-proxy?url=" +
          encodeURIComponent("https://example.com/doc.pdf"),
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Length")).toBe("1234");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(mockSafeFetch).toHaveBeenCalledWith(
      "https://example.com/doc.pdf",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
