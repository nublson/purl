import { describe, expect, it } from "vitest";
import {
  guardSaveAuthorize,
  oauthCorsOrigin,
  tokenPreflight,
  withTokenCors,
} from "@/lib/oauth-route";

const ALLOWED = "https://nublson.com,http://localhost:3000";
const BASE = "https://purl.live/api/auth/mcp/authorize";

describe("oauthCorsOrigin", () => {
  it("returns an allowed origin", () => {
    expect(oauthCorsOrigin("https://nublson.com", ALLOWED)).toBe(
      "https://nublson.com",
    );
    expect(oauthCorsOrigin("http://localhost:3000", ` ${ALLOWED} `)).toBe(
      "http://localhost:3000",
    );
  });
  it("rejects unknown, missing and unconfigured", () => {
    expect(oauthCorsOrigin("https://evil.com", ALLOWED)).toBeNull();
    expect(oauthCorsOrigin(null, ALLOWED)).toBeNull();
    expect(oauthCorsOrigin("https://nublson.com", "")).toBeNull();
    expect(oauthCorsOrigin("https://nublson.com", undefined)).toBeNull();
  });
  it("allows browser extensions, configured or not", () => {
    for (const origin of [
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      "safari-web-extension://8BE7D49B-29C3-403E-AB76-93CDB49CBB2A",
    ]) {
      expect(oauthCorsOrigin(origin, undefined)).toBe(origin);
      expect(oauthCorsOrigin(origin, ALLOWED)).toBe(origin);
    }
  });
  it("rejects look-alike extension origins", () => {
    expect(oauthCorsOrigin("chrome-extension://abc.evil.com", undefined)).toBeNull();
    expect(oauthCorsOrigin("chrome-extension://abc/path", undefined)).toBeNull();
    expect(oauthCorsOrigin("moz-extension://abc", undefined)).toBeNull();
    expect(oauthCorsOrigin("https://chrome-extension.evil.com", undefined)).toBeNull();
  });
  it("treats * literally", () => {
    expect(oauthCorsOrigin("https://evil.com", "*")).toBeNull();
    expect(oauthCorsOrigin("*", "*")).toBe("*");
  });
});

describe("tokenPreflight", () => {
  const req = (origin: string) =>
    new Request("https://purl.live/api/auth/mcp/token", {
      method: "OPTIONS",
      headers: { origin },
    });
  it("allows a listed origin", () => {
    const res = tokenPreflight(req("https://nublson.com"), ALLOWED);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://nublson.com",
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type",
    );
    expect(res.headers.get("Vary")).toContain("Origin");
    expect(res.headers.has("Access-Control-Allow-Credentials")).toBe(false);
  });
  it("gives an unknown origin no Allow-Origin", () => {
    const res = tokenPreflight(req("https://evil.com"), ALLOWED);
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(res.headers.has("Access-Control-Allow-Credentials")).toBe(false);
  });
});

describe("withTokenCors", () => {
  const req = (origin: string) =>
    new Request("https://purl.live/api/auth/mcp/token", {
      method: "POST",
      headers: { origin },
    });
  it("echoes only allowed origins, even on immutable responses", () => {
    const ok = withTokenCors(
      req("https://nublson.com"),
      Response.redirect("https://purl.live/", 302),
      ALLOWED,
    );
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://nublson.com",
    );
    expect(ok.headers.get("Vary")).toContain("Origin");
    expect(ok.headers.has("Access-Control-Allow-Credentials")).toBe(false);
    const no = withTokenCors(
      req("https://evil.com"),
      Response.json({ a: 1 }),
      ALLOWED,
    );
    expect(no.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(no.headers.get("Vary")).toContain("Origin");
  });
});

describe("guardSaveAuthorize", () => {
  const get = (qs: string) =>
    new Request(`${BASE}?${qs}`, { headers: { cookie: "a=b" } });

  it("rejects the save scope without a challenge", async () => {
    const res = guardSaveAuthorize(get("scope=links:save&client_id=x"));
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error).toBe("invalid_request");
    expect(typeof body.error_description).toBe("string");
  });
  it("rejects plain", () => {
    const res = guardSaveAuthorize(
      get("scope=openid%20links:save&code_challenge=abc&code_challenge_method=plain"),
    );
    expect((res as Response).status).toBe(400);
  });
  it("rejects a challenge without a method", () => {
    const res = guardSaveAuthorize(get("scope=links:save&code_challenge=abc"));
    expect((res as Response).status).toBe(400);
  });
  it("forces consent with S256, overriding prompt", () => {
    const res = guardSaveAuthorize(
      get("scope=links:save&code_challenge=abc&code_challenge_method=s256&prompt=none"),
    ) as Request;
    expect(res).toBeInstanceOf(Request);
    const url = new URL(res.url);
    expect(url.searchParams.getAll("prompt")).toEqual(["consent"]);
    expect(url.searchParams.get("code_challenge")).toBe("abc");
    expect(res.method).toBe("GET");
    expect(res.headers.get("cookie")).toBe("a=b");
  });
  describe("save-only client", () => {
    const S256 = "code_challenge=abc&code_challenge_method=S256";
    it("rejects scope=openid", () => {
      const res = guardSaveAuthorize(get(`client_id=nublson-com&scope=openid&${S256}`));
      expect((res as Response).status).toBe(400);
    });
    it("rejects a missing scope", () => {
      const res = guardSaveAuthorize(get(`client_id=nublson-com&${S256}`));
      expect((res as Response).status).toBe(400);
    });
    it("rejects links:save mixed with openid", () => {
      const res = guardSaveAuthorize(
        get(`client_id=nublson-com&scope=links:save%20openid&${S256}`),
      );
      expect((res as Response).status).toBe(400);
    });
    it("accepts links:save offline_access with S256, forcing consent", () => {
      const res = guardSaveAuthorize(
        get(`client_id=nublson-com&scope=links:save%20offline_access&${S256}`),
      ) as Request;
      expect(res).toBeInstanceOf(Request);
      expect(new URL(res.url).searchParams.get("prompt")).toBe("consent");
    });
    it.each(["purl-extension-chrome", "purl-extension-safari"])(
      "holds the extension's client %s to the same rules",
      (clientId) => {
        const rejected = guardSaveAuthorize(
          get(`client_id=${clientId}&scope=openid&${S256}`),
        );
        expect((rejected as Response).status).toBe(400);
        const accepted = guardSaveAuthorize(
          get(`client_id=${clientId}&scope=links:save%20offline_access&${S256}`),
        ) as Request;
        expect(new URL(accepted.url).searchParams.get("prompt")).toBe("consent");
      },
    );
    it("leaves another client's non-save scopes untouched", () => {
      const a = get("client_id=other&scope=openid");
      expect(guardSaveAuthorize(a)).toBe(a);
    });
  });

  it("leaves other requests untouched", () => {
    const a = get("scope=openid%20profile&prompt=none");
    expect(guardSaveAuthorize(a)).toBe(a);
    const b = new Request("https://purl.live/api/auth/get-session");
    expect(guardSaveAuthorize(b)).toBe(b);
    const c = new Request(`${BASE}?scope=links:save`, { method: "POST" });
    expect(guardSaveAuthorize(c)).toBe(c);
  });
});
