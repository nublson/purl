import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const limitMock = vi.fn();

vi.mock("@/lib/upstash-rate-limit", () => ({
  getAuthRateLimiter: vi.fn(),
  getChatPostRateLimiter: vi.fn(),
  getFeedbackPostRateLimiter: vi.fn(),
  getLinksPostRateLimiter: vi.fn(),
  getUploadPostRateLimiter: vi.fn(),
  getV1RateLimiter: vi.fn().mockReturnValue({ limit: limitMock }),
  getV1PostRateLimiter: vi.fn(),
}));

const {
  getAuthRateLimiter,
  getChatPostRateLimiter,
  getFeedbackPostRateLimiter,
  getLinksPostRateLimiter,
  getUploadPostRateLimiter,
  getV1RateLimiter,
  getV1PostRateLimiter,
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

  describe("v1 api rate limiting", () => {
    beforeEach(() => {
      limitMock.mockReset();
      vi.mocked(getV1RateLimiter).mockReset();
      vi.mocked(getV1PostRateLimiter).mockReset();
    });

    it("uses getV1RateLimiter for GET /api/v1/links and returns 429 when exceeded", async () => {
      vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
      });
      const result = await rateLimitApiRequest(request);
      expect(result?.status).toBe(429);
      expect(getV1RateLimiter).toHaveBeenCalled();
      expect(getV1PostRateLimiter).not.toHaveBeenCalled();
    });

    it("returns null for GET /api/v1/links when under the limit", async () => {
      vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: 0 });
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
      });
      const result = await rateLimitApiRequest(request);
      expect(result).toBeNull();
    });

    it("uses getV1PostRateLimiter for POST /api/v1/links and returns 429 when exceeded", async () => {
      vi.mocked(getV1PostRateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
      });
      const result = await rateLimitApiRequest(request);
      expect(result?.status).toBe(429);
      expect(getV1PostRateLimiter).toHaveBeenCalled();
      expect(getV1RateLimiter).not.toHaveBeenCalled();
    });

    it("returns null for POST /api/v1/links when under the limit", async () => {
      vi.mocked(getV1PostRateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: 0 });
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "POST",
      });
      const result = await rateLimitApiRequest(request);
      expect(result).toBeNull();
    });

    it("uses Bearer token as rate limit key when Authorization header is present", async () => {
      vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: 0 });
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
        headers: { authorization: "Bearer purl_abc123" },
      });
      await rateLimitApiRequest(request);
      expect(limitMock).toHaveBeenCalledWith("purl_abc123");
    });

    it("falls back to IP when no Authorization header is present", async () => {
      vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: 0 });
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
        headers: { "x-forwarded-for": "5.5.5.5" },
      });
      await rateLimitApiRequest(request);
      expect(limitMock).toHaveBeenCalledWith("5.5.5.5");
    });

    it("falls back to IP when Authorization header is malformed", async () => {
      vi.mocked(getV1RateLimiter).mockReturnValue(mockLimiter() as never);
      limitMock.mockResolvedValue({ success: true, reset: 0 });
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
        headers: {
          authorization: "Basic dXNlcjpwYXNz",
          "x-forwarded-for": "7.7.7.7",
        },
      });
      await rateLimitApiRequest(request);
      expect(limitMock).toHaveBeenCalledWith("7.7.7.7");
    });

    it("returns null (no limiter configured) without error for GET /api/v1/links", async () => {
      vi.mocked(getV1RateLimiter).mockReturnValue(null);
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
      });
      const result = await rateLimitApiRequest(request);
      expect(result).toBeNull();
    });
  });
});
