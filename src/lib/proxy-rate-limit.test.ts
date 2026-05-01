import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const limitMock = vi.fn();

vi.mock("@/lib/upstash-rate-limit", () => ({
  getAuthRateLimiter: vi.fn(),
  getChatPostRateLimiter: vi.fn(),
  getFeedbackPostRateLimiter: vi.fn(),
  getLinksPostRateLimiter: vi.fn(),
  getUploadPostRateLimiter: vi.fn(),
}));

const {
  getAuthRateLimiter,
  getChatPostRateLimiter,
  getFeedbackPostRateLimiter,
  getLinksPostRateLimiter,
  getUploadPostRateLimiter,
} = await import("@/lib/upstash-rate-limit");

const { rateLimitApiRequest } = await import("./proxy-rate-limit");

function makeRequest(
  path: string,
  method = "GET",
  headersInit?: Record<string, string>,
): NextRequest {
  const req = new NextRequest(`http://localhost${path}`, { method });
  if (headersInit) {
    for (const [k, v] of Object.entries(headersInit)) {
      req.headers.set(k, v);
    }
  }
  return req;
}

/** Returns a limiter stub whose `limit` is the shared `limitMock`. */
function mockLimiter() {
  return { limit: limitMock };
}

describe("rateLimitApiRequest", () => {
  beforeEach(() => {
    limitMock.mockReset();
    vi.mocked(getAuthRateLimiter).mockReset();
    vi.mocked(getChatPostRateLimiter).mockReset();
    vi.mocked(getLinksPostRateLimiter).mockReset();
    vi.mocked(getUploadPostRateLimiter).mockReset();
    vi.mocked(getFeedbackPostRateLimiter).mockReset();
  });

  describe("unmatched routes", () => {
    it("returns null for unrecognised paths", async () => {
      const result = await rateLimitApiRequest(
        makeRequest("/api/unknown", "GET"),
      );
      expect(result).toBeNull();
      expect(limitMock).not.toHaveBeenCalled();
    });
  });

  describe("/api/auth routes", () => {
    it("returns NextResponse.next() when no limiter is configured", async () => {
      vi.mocked(getAuthRateLimiter).mockReturnValue(null);

      const result = await rateLimitApiRequest(
        makeRequest("/api/auth/signin", "POST"),
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe(200);
    });

    it("returns NextResponse.next() when under the limit", async () => {
      vi.mocked(getAuthRateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });

      const result = await rateLimitApiRequest(
        makeRequest("/api/auth/signin", "POST"),
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe(200);
    });

    it("returns 429 when the auth rate limit is exceeded", async () => {
      vi.mocked(getAuthRateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({
        success: false,
        reset: Date.now() + 30_000,
      });

      const result = await rateLimitApiRequest(
        makeRequest("/api/auth/signin", "POST"),
      );

      expect(result!.status).toBe(429);
      expect(result!.headers.get("Retry-After")).toBeTruthy();
    });

    it("passes the x-forwarded-for IP to the limiter", async () => {
      vi.mocked(getAuthRateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });

      await rateLimitApiRequest(
        makeRequest("/api/auth/session", "GET", {
          "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        }),
      );

      expect(limitMock).toHaveBeenCalledWith("1.2.3.4");
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
      vi.mocked(getAuthRateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });

      await rateLimitApiRequest(
        makeRequest("/api/auth/session", "GET", { "x-real-ip": "9.9.9.9" }),
      );

      expect(limitMock).toHaveBeenCalledWith("9.9.9.9");
    });

    it("falls back to 127.0.0.1 when no IP headers are present", async () => {
      vi.mocked(getAuthRateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });

      await rateLimitApiRequest(makeRequest("/api/auth/session", "GET"));

      expect(limitMock).toHaveBeenCalledWith("127.0.0.1");
    });
  });

  describe("POST /api/chat", () => {
    it("returns null when no limiter is configured", async () => {
      vi.mocked(getChatPostRateLimiter).mockReturnValue(null);

      const result = await rateLimitApiRequest(
        makeRequest("/api/chat", "POST"),
      );
      expect(result).toBeNull();
    });

    it("returns null when under the limit", async () => {
      vi.mocked(getChatPostRateLimiter).mockReturnValue(
        mockLimiter() as never,
      );
      limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });

      const result = await rateLimitApiRequest(
        makeRequest("/api/chat", "POST"),
      );
      expect(result).toBeNull();
    });

    it("returns 429 when the chat POST limit is exceeded", async () => {
      vi.mocked(getChatPostRateLimiter).mockReturnValue(
        mockLimiter() as never,
      );
      limitMock.mockResolvedValue({
        success: false,
        reset: Date.now() + 60_000,
      });

      const result = await rateLimitApiRequest(
        makeRequest("/api/chat", "POST"),
      );

      expect(result!.status).toBe(429);
    });

    it("does not limit GET /api/chat", async () => {
      const result = await rateLimitApiRequest(
        makeRequest("/api/chat", "GET"),
      );
      expect(result).toBeNull();
      expect(getChatPostRateLimiter).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/links", () => {
    it("returns 429 when the links POST limit is exceeded", async () => {
      vi.mocked(getLinksPostRateLimiter).mockReturnValue(
        mockLimiter() as never,
      );
      limitMock.mockResolvedValue({
        success: false,
        reset: Date.now() + 60_000,
      });

      const result = await rateLimitApiRequest(
        makeRequest("/api/links", "POST"),
      );

      expect(result!.status).toBe(429);
    });

    it("does not limit GET /api/links", async () => {
      const result = await rateLimitApiRequest(
        makeRequest("/api/links", "GET"),
      );
      expect(result).toBeNull();
      expect(getLinksPostRateLimiter).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/upload", () => {
    it("returns 429 when the upload POST limit is exceeded", async () => {
      vi.mocked(getUploadPostRateLimiter).mockReturnValue(
        mockLimiter() as never,
      );
      limitMock.mockResolvedValue({
        success: false,
        reset: Date.now() + 60_000,
      });

      const result = await rateLimitApiRequest(
        makeRequest("/api/upload", "POST"),
      );

      expect(result!.status).toBe(429);
    });
  });

  describe("POST /api/feedback", () => {
    it("returns null when under the feedback limit", async () => {
      vi.mocked(getFeedbackPostRateLimiter).mockReturnValue(
        mockLimiter() as never,
      );
      limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });

      const result = await rateLimitApiRequest(
        makeRequest("/api/feedback", "POST"),
      );
      expect(result).toBeNull();
    });

    it("returns 429 with Retry-After header when the feedback limit is exceeded", async () => {
      vi.mocked(getFeedbackPostRateLimiter).mockReturnValue(
        mockLimiter() as never,
      );
      limitMock.mockResolvedValue({
        success: false,
        reset: Date.now() + 30_000,
      });

      const result = await rateLimitApiRequest(
        makeRequest("/api/feedback", "POST"),
      );

      expect(result!.status).toBe(429);
      const retryAfter = Number(result!.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
    });
  });
});
