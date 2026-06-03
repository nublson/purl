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

const auth = await import("@/lib/auth");

function createRequest(pathname: string, method = "GET"): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.mocked(auth.auth.api.getSession).mockReset();
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

  it("redirects to /home for public redirect route (e.g. /login) when session exists", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({ user: {}, session: {} } as never);
    const req = createRequest("/login");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/home");
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

  describe("API v1 routes", () => {
    it("passes through /api/v1/keys without a session", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const request = new NextRequest("http://localhost/api/v1/keys", {
        method: "GET",
      });
      const response = await proxy(request);
      expect(response.status).not.toBe(307);
    });

    it("passes through /api/v1/links without a session", async () => {
      vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
      const request = new NextRequest("http://localhost/api/v1/links", {
        method: "GET",
      });
      const response = await proxy(request);
      expect(response.status).not.toBe(307);
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
      expect(response.status).not.toBe(307);
    });
  });
});
