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

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/upload-file", () => {
  class UploadStorageError extends Error {
    readonly name = "UploadStorageError";
  }
  return {
    createSignedFileUrlForLink: vi.fn(),
    UploadStorageError,
  };
});

const { UnsafeOutboundUrlError } = await import("@/lib/safe-outbound-fetch");
const { auth } = await import("@/lib/auth");
const { createSignedFileUrlForLink, UploadStorageError } = await import(
  "@/lib/upload-file"
);

function getRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

// Authentication is enforced by src/proxy.ts (Next.js middleware), which
// redirects unauthenticated requests before they reach this handler — this
// route is not publicly exempted there, so the handler itself intentionally
// has no in-handler session check for these tests to cover.
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

describe("GET /api/pdf-proxy?linkId= (uploaded PDFs)", () => {
  const SIGNED_URL =
    "https://project.supabase.co/storage/v1/object/sign/user-uploads/u/doc.pdf?token=t";

  beforeEach(() => {
    mockSafeFetch.mockReset();
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(createSignedFileUrlForLink).mockReset();
  });

  function linkRequest(linkId = "link-1") {
    return getRequest(`http://localhost/api/pdf-proxy?linkId=${linkId}`);
  }

  it("returns 401 without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const { GET } = await import("./route");

    const res = await GET(linkRequest());

    expect(res.status).toBe(401);
    expect(createSignedFileUrlForLink).not.toHaveBeenCalled();
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("returns 404 when the upload is not owned by the user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    vi.mocked(createSignedFileUrlForLink).mockResolvedValue(null);
    const { GET } = await import("./route");

    const res = await GET(linkRequest("someone-elses"));

    expect(res.status).toBe(404);
    expect(createSignedFileUrlForLink).toHaveBeenCalledWith(
      "user-1",
      "someone-elses",
    );
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("returns 502 when storage cannot sign the file", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    vi.mocked(createSignedFileUrlForLink).mockRejectedValue(
      new UploadStorageError("down"),
    );
    const { GET } = await import("./route");

    const res = await GET(linkRequest());

    expect(res.status).toBe(502);
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("fetches the freshly signed URL through safeFetch", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    vi.mocked(createSignedFileUrlForLink).mockResolvedValue(SIGNED_URL);
    mockSafeFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      headers: new Headers({ "content-type": "application/pdf" }),
    });
    const { GET } = await import("./route");

    const res = await GET(linkRequest());

    expect(res.status).toBe(200);
    expect(mockSafeFetch).toHaveBeenCalledWith(
      SIGNED_URL,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("ignores a caller-supplied url when linkId is present", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    vi.mocked(createSignedFileUrlForLink).mockResolvedValue(SIGNED_URL);
    mockSafeFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      headers: new Headers(),
    });
    const { GET } = await import("./route");

    await GET(
      getRequest(
        "http://localhost/api/pdf-proxy?linkId=link-1&url=" +
          encodeURIComponent("https://evil.example/x.pdf"),
      ),
    );

    expect(mockSafeFetch).toHaveBeenCalledWith(SIGNED_URL, expect.anything());
  });
});
