import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedFile = vi.fn();
vi.mock("@/lib/notion", () => ({
  getPublishedFile: (...a: unknown[]) => getPublishedFile(...a),
}));

import { GET } from "./route";

const NOW = new Date("2026-10-29T17:00:00.000Z");
const BLOCK_ID = "aaaaaaaabbbbccccddddeeeeeeeeeeee";
const FILE_URL = "https://prod-files-secure.s3.us-west-2.amazonaws.com/x.png";

function get(blockId = BLOCK_ID) {
  return GET(new Request(`http://localhost/api/notion/file/${blockId}`), {
    params: Promise.resolve({ blockId }),
  });
}

/** A file whose signed URL expires this many minutes from now. */
function expiringIn(minutes: number) {
  return { url: FILE_URL, expiresAt: new Date(NOW.getTime() + minutes * 60_000) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/notion/file/[blockId]", () => {
  it("redirects to the fresh URL, cached by the CDN for at most 30 minutes", async () => {
    getPublishedFile.mockResolvedValue(expiringIn(60));
    const response = await get();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(FILE_URL);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=1800");
    expect(getPublishedFile).toHaveBeenCalledWith(BLOCK_ID);
  });

  it("stops the CDN's copy 10 minutes before the URL expires", async () => {
    getPublishedFile.mockResolvedValue(expiringIn(25));
    const response = await get();
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=900");
  });

  it("doesn't cache a redirect to a URL about to expire", async () => {
    getPublishedFile.mockResolvedValue(expiringIn(5));
    const response = await get();
    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 404 for a block that isn't on a published page", async () => {
    getPublishedFile.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers an uncached 502 when Notion fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getPublishedFile.mockRejectedValue(new Error("Notion is down"));
    const response = await get();
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
