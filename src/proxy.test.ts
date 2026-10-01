import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRateLimitApiRequest = vi.fn();

vi.mock("@/lib/proxy-rate-limit", () => ({
  rateLimitApiRequest: mockRateLimitApiRequest,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const { proxy, config } = await import("./proxy");
const auth = await import("@/lib/auth");

function createRequest(pathname: string, method = "GET"): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.mocked(auth.auth.api.getSession).mockReset();
    mockRateLimitApiRequest.mockReset();
    mockRateLimitApiRequest.mockResolvedValue(null);
  });

  it("returns 429 immediately when rateLimitApiRequest blocks the request", async () => {
    mockRateLimitApiRequest.mockResolvedValue(
      new NextResponse(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: {},
      session: {},
    } as never);

    const res = await proxy(createRequest("/home"));

    expect(res.status).toBe(429);
    expect(auth.auth.api.getSession).not.toHaveBeenCalled();
  });

  it("passes OPTIONS through without session lookup (CORS preflight)", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/api/links", "OPTIONS");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(auth.auth.api.getSession).not.toHaveBeenCalled();
  });

  it("returns next for a signed-out request to /", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns next for a signed-out request to / with MCP login query params", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/?client_id=x&response_type=code");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects a signed-in request to / to /home", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: {},
      session: {},
    } as never);
    const req = createRequest("/");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/home");
  });

  it.each(["/privacy", "/terms", "/docs", "/docs/mcp", "/docs/api"])(
    "redirects removed public page %s to / when no session",
    async (path) => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const res = await proxy(createRequest(path));
      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).not.toBeNull();
      expect(new URL(location as string).pathname).toBe("/");
    },
  );

  it.each(["/", "/.well-known/oauth-authorization-server"])(
    "skips the session lookup on public page %s (same response either way)",
    async (path) => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const res = await proxy(createRequest(path));
      expect(res.status).toBe(200);
      if (path === "/.well-known/oauth-authorization-server") {
        expect(auth.auth.api.getSession).not.toHaveBeenCalled();
      }
    },
  );

  it("skips the session lookup on .well-known routes", async () => {
    const res = await proxy(
      createRequest("/.well-known/oauth-authorization-server"),
    );
    expect(res.status).toBe(200);
    expect(auth.auth.api.getSession).not.toHaveBeenCalled();
  });

  it("looks up the session on / to redirect signed-in users", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    await proxy(createRequest("/"));
    expect(auth.auth.api.getSession).toHaveBeenCalledTimes(1);
  });

  it("returns next for /api/auth without session lookup (Better Auth handles its own cookies)", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: {},
      session: {},
    } as never);
    const req = createRequest("/api/auth/session");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(auth.auth.api.getSession).not.toHaveBeenCalled();
  });

  it("returns next for /api/auth/callback/google without session lookup", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: {},
      session: {},
    } as never);
    const req = createRequest("/api/auth/callback/google");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(auth.auth.api.getSession).not.toHaveBeenCalled();
  });

  it("redirects to / for private route when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/home");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(new URL(location as string).pathname).toBe("/");
  });

  it("redirects to / for /oauth/consent when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const res = await proxy(createRequest("/oauth/consent"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(new URL(location as string).pathname).toBe("/");
  });

  it("returns next for /oauth/consent when a session exists", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: {},
      session: {},
    } as never);
    const res = await proxy(createRequest("/oauth/consent"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns next for private route when session exists", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: {},
      session: {},
    } as never);
    const req = createRequest("/home");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  describe("/folders/[slug] route", () => {
    it("redirects to / for a signed-out request", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const req = createRequest("/folders/books");
      const res = await proxy(req);
      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).not.toBeNull();
      expect(new URL(location as string).pathname).toBe("/");
    });

    it("returns next for a signed-in request", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue({
        user: {},
        session: {},
      } as never);
      const req = createRequest("/folders/books");
      const res = await proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("MCP route", () => {
    it("passes through /api/mcp without redirecting to landing (bearer auth at handler)", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const request = new NextRequest("http://localhost/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer oauth-access-token" },
      });
      const response = await proxy(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("passes through /api/mcp subpaths without redirecting to landing", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const request = new NextRequest("http://localhost/api/mcp/messages", {
        method: "POST",
      });
      const response = await proxy(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  describe("API v1 routes", () => {
    it("passes through /api/v1/keys without a session", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const request = new NextRequest("http://localhost/api/v1/keys", {
        method: "GET",
      });
      const response = await proxy(request);
      expect(response.status).toBe(200);
    });

    it("passes through /api/v1/links without a session", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
      });
      const response = await proxy(request);
      expect(response.status).toBe(200);
    });

    it("passes through /api/v1/links with a valid session", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue({
        user: { id: "u1" },
        session: {},
      } as never);
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
      });
      const response = await proxy(request);
      expect(response.status).toBe(200);
    });
  });

  describe(".well-known OAuth discovery routes", () => {
    it("returns next for oauth-protected-resource without a session lookup", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const req = createRequest("/.well-known/oauth-protected-resource");
      const res = await proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(auth.auth.api.getSession).not.toHaveBeenCalled();
    });

    it("returns next for oauth-authorization-server without a session lookup", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const req = createRequest("/.well-known/oauth-authorization-server");
      const res = await proxy(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(auth.auth.api.getSession).not.toHaveBeenCalled();
    });
  });

  describe("/oauth/consent route", () => {
    it("redirects to / when no session", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const res = await proxy(createRequest("/oauth/consent"));
      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).not.toBeNull();
      expect(new URL(location as string).pathname).toBe("/");
    });

    it("returns next when session exists", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue({
        user: {},
        session: {},
      } as never);
      const res = await proxy(createRequest("/oauth/consent"));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("malformed Authorization header on a private route", () => {
    it("redirects to / instead of crashing when getSession throws (e.g. an invalid API key)", async () => {
      vi.mocked(auth.auth.api.getSession).mockRejectedValue(
        new Error("Invalid API key."),
      );
      const req = createRequest("/home", "GET");
      req.headers.set("authorization", "Bearer purl_some_garbage_value");

      const res = await proxy(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).not.toBeNull();
      expect(new URL(location as string).pathname).toBe("/");
    });

    it("returns next on / (public route) instead of crashing when getSession throws", async () => {
      vi.mocked(auth.auth.api.getSession).mockRejectedValue(
        new Error("Invalid API key."),
      );
      const req = createRequest("/", "GET");
      req.headers.set("authorization", "Bearer purl_some_garbage_value");

      const res = await proxy(req);

      // "/" needs the session lookup (redirect-when-authenticated), but a
      // thrown lookup is treated as unauthenticated, so it should pass
      // through rather than crash.
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });
});

describe("proxy matcher", () => {
  // Next.js anchors matcher sources; mirror that to check which paths run the proxy.
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each([
    "/",
    "/home",
    "/api/links",
    "/api/auth/get-session",
    "/.well-known/oauth-authorization-server",
    "/oauth/consent",
  ])("runs on %s", (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/_vercel/insights/view",
    "/sw.js",
    "/manifest.json",
    "/robots.txt",
    "/sitemap.xml",
    "/logo.svg",
    "/icon.png",
    "/favicon.ico",
    "/fonts/inter.woff2",
  ])("skips %s", (path) => {
    expect(matcher.test(path)).toBe(false);
  });
});
