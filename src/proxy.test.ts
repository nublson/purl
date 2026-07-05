import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/user-preferences", () => ({
  getPreferences: vi.fn().mockResolvedValue({ defaultPage: "home" }),
}));

const auth = await import("@/lib/auth");
const { getPreferences } = await import("@/lib/user-preferences");

function createRequest(pathname: string, method = "GET"): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.mocked(auth.auth.api.getSession).mockReset();
    vi.mocked(getPreferences).mockResolvedValue({ defaultPage: "home" });
  });

  it("passes OPTIONS through without session lookup (CORS preflight)", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/api/links", "OPTIONS");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(auth.auth.api.getSession).not.toHaveBeenCalled();
  });

  it("returns next for public route when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns next for /docs routes when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/docs/api");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns next for /docs index when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/docs");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to /login for /docsomething (not a docs prefix match)", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/docsomething");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects to /home for public redirect route (e.g. /login) when session exists", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({ user: {}, session: {} } as never);
    const req = createRequest("/login");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/home");
  });

  it("redirects to /ai for /login when session exists and defaultPage preference is ai", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: { id: "user-1" },
      session: {},
    } as never);
    vi.mocked(getPreferences).mockResolvedValue({ defaultPage: "ai" });
    const req = createRequest("/login");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/ai");
    expect(getPreferences).toHaveBeenCalledWith("user-1");
  });

  it("returns next for /privacy when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const res = await proxy(createRequest("/privacy"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns next for /terms when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const res = await proxy(createRequest("/terms"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns next for public next route (e.g. /) when session exists", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({ user: {}, session: {} } as never);
    const req = createRequest("/");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns next for /api/auth without session lookup (Better Auth handles its own cookies)", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({ user: {}, session: {} } as never);
    const req = createRequest("/api/auth/session");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(auth.auth.api.getSession).not.toHaveBeenCalled();
  });

  it("redirects to /login for private route when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/home");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects to /verify-email for private route when session exists but user is not verified", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: { emailVerified: false },
      session: {},
    } as never);
    const req = createRequest("/home");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/verify-email");
  });

  it("returns next for private route when session exists and user is verified", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: { emailVerified: true },
      session: {},
    } as never);
    const req = createRequest("/home");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to /login for /verify-email when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/verify-email");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("returns next for /verify-email when session exists (unverified)", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: { emailVerified: false },
      session: {},
    } as never);
    const req = createRequest("/verify-email");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to /home for /verify-email when session exists (verified)", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: { emailVerified: true },
      session: {},
    } as never);
    const req = createRequest("/verify-email");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/home");
  });

  it("redirects to /ai for /verify-email when verified and defaultPage preference is ai", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({
      user: { id: "user-1", emailVerified: true },
      session: {},
    } as never);
    vi.mocked(getPreferences).mockResolvedValue({ defaultPage: "ai" });
    const res = await proxy(createRequest("/verify-email"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/ai");
    expect(getPreferences).toHaveBeenCalledWith("user-1");
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
        user: { id: "u1", emailVerified: true },
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

  describe("malformed Authorization header on a private route", () => {
    it("redirects to /login instead of crashing when getSession throws (e.g. an invalid API key)", async () => {
      vi.mocked(auth.auth.api.getSession).mockRejectedValue(
        new Error("Invalid API key."),
      );
      const req = createRequest("/home", "GET");
      req.headers.set("authorization", "Bearer purl_some_garbage_value");

      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects to /login instead of crashing on a public redirect route (e.g. /login itself)", async () => {
      vi.mocked(auth.auth.api.getSession).mockRejectedValue(
        new Error("Invalid API key."),
      );
      const req = createRequest("/", "GET");
      req.headers.set("authorization", "Bearer purl_some_garbage_value");

      const res = await proxy(req);

      // "/" is public and treated as unauthenticated (same as a thrown
      // session lookup), so it should pass through rather than crash.
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });
});
