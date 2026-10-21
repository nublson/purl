import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
  GET: vi.fn(async (_r: Request) => new Response("get")),
  POST: vi.fn(async (_r: Request) => new Response("post")),
  PATCH: vi.fn(),
  PUT: vi.fn(),
  DELETE: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => handlers }));

import { GET, OPTIONS, POST } from "./route";

const BASE = "https://purl.live/api/auth";
const S256 = "code_challenge=abc&code_challenge_method=S256";

beforeEach(() => {
  vi.stubEnv("OAUTH_CORS_ORIGINS", "https://nublson.com");
  handlers.GET.mockClear();
  handlers.POST.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("auth route wiring", () => {
  it("rejects a save authorize without a challenge", async () => {
    const res = await GET(new Request(`${BASE}/mcp/authorize?scope=links:save`));
    expect(res.status).toBe(400);
    expect(handlers.GET).not.toHaveBeenCalled();
  });

  it("forces consent on a valid save authorize", async () => {
    await GET(
      new Request(
        `${BASE}/mcp/authorize?client_id=nublson-com&scope=links:save&${S256}`,
      ),
    );
    expect(handlers.GET).toHaveBeenCalledOnce();
    const passed = handlers.GET.mock.calls[0][0];
    expect(new URL(passed.url).searchParams.get("prompt")).toBe("consent");
  });

  it("passes unrelated GETs through unchanged", async () => {
    const req = new Request(`${BASE}/get-session`);
    await GET(req);
    expect(handlers.GET).toHaveBeenCalledWith(req);
  });

  it("adds CORS to token responses for an allowed origin only", async () => {
    const post = (origin: string) =>
      POST(
        new Request(`${BASE}/mcp/token`, { method: "POST", headers: { origin } }),
      );
    const ok = await post("https://nublson.com");
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://nublson.com",
    );
    const no = await post("https://evil.com");
    expect(no.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("adds no CORS headers to other auth POSTs", async () => {
    const res = await POST(
      new Request(`${BASE}/sign-out`, {
        method: "POST",
        headers: { origin: "https://nublson.com" },
      }),
    );
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("answers the token preflight with 204 and CORS", () => {
    const res = OPTIONS(
      new Request(`${BASE}/mcp/token`, {
        method: "OPTIONS",
        headers: { origin: "https://nublson.com" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://nublson.com",
    );
  });
});
