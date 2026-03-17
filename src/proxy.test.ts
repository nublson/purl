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

function createRequest(pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`);
}

describe("proxy", () => {
  beforeEach(() => {
    vi.mocked(auth.auth.api.getSession).mockReset();
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

  it("returns next for /api/auth when session exists", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue({ user: {}, session: {} } as never);
    const req = createRequest("/api/auth/session");
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to /login for private route when no session", async () => {
    vi.mocked(auth.auth.api.getSession).mockResolvedValue(null);
    const req = createRequest("/home");
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
