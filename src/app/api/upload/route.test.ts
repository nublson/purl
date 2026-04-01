import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => void | Promise<void>) => callback()),
  };
});

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/upload-file", () => {
  class InvalidUploadTypeError extends Error {
    readonly name = "InvalidUploadTypeError";
  }
  class UploadStorageError extends Error {
    readonly name = "UploadStorageError";
  }
  return {
    createLinkFromFile: vi.fn(),
    InvalidUploadTypeError,
    UploadStorageError,
  };
});

vi.mock("@/lib/ingest-pdf", () => ({
  ingestPdf: vi.fn().mockResolvedValue(undefined),
}));

const { auth } = await import("@/lib/auth");
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const {
  createLinkFromFile,
  InvalidUploadTypeError,
  UploadStorageError,
} = await import("@/lib/upload-file");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };
const CREATED_AT = new Date("2026-03-31T10:00:00Z");
const MOCK_LINK = {
  id: "link-upload-1",
  url: "https://example.com/uploaded.pdf",
  title: "uploaded",
  description: "PDF Document - 200 KB",
  favicon: "https://www.google.com/s2/favicons?domain=upload&sz=64",
  thumbnail: null,
  domain: ".pdf",
  contentType: "PDF" as const,
  createdAt: CREATED_AT,
  userId: "user-123",
};

function postRequest({
  file,
  durationSeconds,
}: {
  file?: File;
  durationSeconds?: string;
}): NextRequest {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (durationSeconds !== undefined) {
    formData.append("durationSeconds", durationSeconds);
  }
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(createLinkFromFile).mockReset();
    vi.mocked(broadcastLinksChanged).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await POST(
      postRequest({
        file: new File(["abc"], "doc.pdf", { type: "application/pdf" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(createLinkFromFile).not.toHaveBeenCalled();
    expect(broadcastLinksChanged).not.toHaveBeenCalled();
  });

  it("returns 400 when file is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    const res = await POST(postRequest({}));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing file upload." });
    expect(createLinkFromFile).not.toHaveBeenCalled();
  });

  it("returns 400 when upload helper throws InvalidUploadTypeError", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(createLinkFromFile).mockRejectedValue(
      new InvalidUploadTypeError("Only PDF and audio files are supported."),
    );

    const res = await POST(
      postRequest({
        file: new File(["abc"], "doc.png", { type: "image/png" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Only PDF and audio files are supported.",
    });
  });

  it("returns 500 when upload helper throws UploadStorageError", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(createLinkFromFile).mockRejectedValue(
      new UploadStorageError("Storage failed"),
    );

    const res = await POST(
      postRequest({
        file: new File(["abc"], "doc.pdf", { type: "application/pdf" }),
      }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Storage failed" });
  });

  it("returns 201 and broadcasts changes on success", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(createLinkFromFile).mockResolvedValue(MOCK_LINK as never);

    const res = await POST(
      postRequest({
        file: new File(["pdf"], "resume.pdf", { type: "application/pdf" }),
      }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: "link-upload-1",
      url: "https://example.com/uploaded.pdf",
      title: "uploaded",
      description: "PDF Document - 200 KB",
      favicon: "https://www.google.com/s2/favicons?domain=upload&sz=64",
      thumbnail: null,
      domain: ".pdf",
      contentType: "PDF",
      createdAt: CREATED_AT.toISOString(),
    });
    expect(broadcastLinksChanged).toHaveBeenCalledWith("user-123");
  });

  it("passes finite durationSeconds to createLinkFromFile for audio", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(createLinkFromFile).mockResolvedValue(MOCK_LINK as never);

    await POST(
      postRequest({
        file: new File(["audio"], "track.wav", { type: "audio/wav" }),
        durationSeconds: "200",
      }),
    );

    expect(createLinkFromFile).toHaveBeenCalledWith(
      expect.any(File),
      "user-123",
      200,
    );
  });

  it("passes undefined duration when durationSeconds is invalid", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(createLinkFromFile).mockResolvedValue(MOCK_LINK as never);

    await POST(
      postRequest({
        file: new File(["audio"], "track.wav", { type: "audio/wav" }),
        durationSeconds: "not-a-number",
      }),
    );

    expect(createLinkFromFile).toHaveBeenCalledWith(
      expect.any(File),
      "user-123",
      undefined,
    );
  });
});
