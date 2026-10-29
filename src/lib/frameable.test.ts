import { afterEach, describe, expect, it, vi } from "vitest";
import { checkFrameable, isFrameable } from "./frameable";

const ORIGIN = "https://purl.live";

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("isFrameable", () => {
  it("allows a page with no framing headers", () => {
    expect(isFrameable(h({}), ORIGIN)).toBe(true);
  });

  it.each(["DENY", "SAMEORIGIN", "ALLOW-FROM https://purl.live"])(
    "blocks X-Frame-Options: %s",
    (value) => {
      expect(isFrameable(h({ "x-frame-options": value }), ORIGIN)).toBe(false);
    },
  );

  it.each([
    ["frame-ancestors *", true],
    ["frame-ancestors https:", true],
    ["frame-ancestors https://purl.live", true],
    ["frame-ancestors 'self' https://other.example", false],
    ["frame-ancestors 'none'", false],
    ["default-src 'self'", true],
    ["default-src 'self'; FRAME-ANCESTORS 'none'", false],
  ])("CSP %s -> %s", (csp, expected) => {
    expect(
      isFrameable(h({ "content-security-policy": csp }), ORIGIN),
    ).toBe(expected);
  });

  it("requires every CSP value to allow framing", () => {
    const headers = new Headers();
    headers.append("content-security-policy", "default-src 'self'");
    headers.append("content-security-policy", "frame-ancestors 'none'");
    expect(isFrameable(headers, ORIGIN)).toBe(false);
  });

  it("lets X-Frame-Options win over a permissive frame-ancestors", () => {
    expect(
      isFrameable(
        h({
          "x-frame-options": "DENY",
          "content-security-policy": "frame-ancestors *",
        }),
        ORIGIN,
      ),
    ).toBe(false);
  });
});

describe("checkFrameable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stub(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  ) {
    const fn = vi.fn(async (input: unknown, init?: RequestInit) =>
      handler(String(input), init),
    );
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("allows a HEAD 200 with no framing headers", async () => {
    stub(() => new Response(null, { status: 200 }));
    expect(await checkFrameable("https://example.com/")).toBe("allowed");
  });

  it("retries GET after a 405 HEAD", async () => {
    const fn = stub((_url, init) =>
      init?.method === "HEAD"
        ? new Response(null, { status: 405 })
        : new Response("x", {
            status: 200,
            headers: { "x-frame-options": "deny" },
          }),
    );
    expect(await checkFrameable("https://example.com/")).toBe("blocked");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("is unreachable when HEAD and GET answer 404", async () => {
    stub(() => new Response(null, { status: 404 }));
    expect(await checkFrameable("https://example.com/")).toBe("unreachable");
  });

  it("is unreachable when fetch rejects", async () => {
    stub(() => {
      throw new Error("boom");
    });
    expect(await checkFrameable("https://example.com/")).toBe("unreachable");
  });

  it("checks the headers of the page a redirect lands on", async () => {
    stub((url) =>
      url === "https://example.com/"
        ? new Response(null, {
            status: 301,
            headers: { location: "https://example.com/final" },
          })
        : new Response(null, {
            status: 200,
            headers: { "x-frame-options": "deny" },
          }),
    );
    expect(await checkFrameable("https://example.com/")).toBe("blocked");
  });
});
