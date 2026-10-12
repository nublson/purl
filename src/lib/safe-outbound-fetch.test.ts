import dns from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UnsafeOutboundUrlError,
  assertResolvableHostIsPublic,
  assertSafeHttpUrl,
  describeHttpProxyHopFailure,
  isHttpProxyTunnelFailure,
  safeFetch,
} from "./safe-outbound-fetch";

const DEFAULT_DNS_ANSWER = { address: "198.51.100.10", family: 4 as const };

function restoreDefaultDnsMock() {
  vi.mocked(dns.lookup).mockImplementation(
    ((_hostname: string, options?: { all?: boolean }) => {
      if (options?.all) {
        return Promise.resolve([DEFAULT_DNS_ANSWER]);
      }
      return Promise.resolve(DEFAULT_DNS_ANSWER);
    }) as typeof dns.lookup,
  );
}

/** Undici's shape when the TCP connection to the proxy host times out. */
function proxyConnectTimeoutError(): TypeError {
  const connect = new Error(
    "Connect Timeout Error (attempted address: 198.51.100.10:80, timeout: 10000ms)",
  ) as Error & { code: string };
  connect.code = "UND_ERR_CONNECT_TIMEOUT";
  const top = new TypeError("fetch failed");
  (top as TypeError & { cause: unknown }).cause = connect;
  return top;
}

function proxy407Error(): TypeError {
  const tunnel = new Error(
    "Proxy response (407) !== 200 when HTTP Tunneling",
  ) as Error & { code: string };
  tunnel.code = "UND_ERR_ABORTED";
  const cancelled = new Error("Request was cancelled.");
  (cancelled as Error & { cause: unknown }).cause = tunnel;
  const top = new TypeError("fetch failed");
  (top as TypeError & { cause: unknown }).cause = cancelled;
  return top;
}

describe("assertSafeHttpUrl", () => {
  it("rejects non-http(s) protocols", () => {
    expect(() => assertSafeHttpUrl("ftp://example.com")).toThrow(
      UnsafeOutboundUrlError,
    );
  });

  it("rejects URLs with embedded credentials", () => {
    expect(() => assertSafeHttpUrl("https://user:pass@example.com/")).toThrow(
      UnsafeOutboundUrlError,
    );
  });

  it("returns a URL for valid https", () => {
    const u = assertSafeHttpUrl("https://example.com/path");
    expect(u.hostname).toBe("example.com");
  });
});

describe("isHttpProxyTunnelFailure", () => {
  it("detects nested Undici 407 CONNECT failures", () => {
    expect(isHttpProxyTunnelFailure(proxy407Error())).toBe(true);
  });

  it("returns false for unrelated network errors", () => {
    expect(isHttpProxyTunnelFailure(new TypeError("fetch failed"))).toBe(
      false,
    );
    expect(isHttpProxyTunnelFailure(new Error("ECONNRESET"))).toBe(false);
  });
});

describe("assertResolvableHostIsPublic", () => {
  afterEach(() => {
    restoreDefaultDnsMock();
  });

  it("rejects literal loopback IPv4", async () => {
    await expect(assertResolvableHostIsPublic("127.0.0.1")).rejects.toThrow(
      UnsafeOutboundUrlError,
    );
  });

  it("rejects literal metadata-style IPv4", async () => {
    await expect(assertResolvableHostIsPublic("169.254.169.254")).rejects.toThrow(
      UnsafeOutboundUrlError,
    );
  });

  it("rejects when DNS returns a private IPv4", async () => {
    vi.mocked(dns.lookup).mockImplementationOnce(
      ((_hostname, options) => {
        const all =
          options &&
          typeof options === "object" &&
          "all" in options &&
          Boolean(options.all);
        if (all) {
          return Promise.resolve([{ address: "10.0.0.1", family: 4 }]);
        }
        return Promise.resolve({ address: "10.0.0.1", family: 4 });
      }) as typeof dns.lookup,
    );
    await expect(
      assertResolvableHostIsPublic("internal.example.com"),
    ).rejects.toThrow(UnsafeOutboundUrlError);
  });
});

describe("safeFetch", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    restoreDefaultDnsMock();
  });

  it("blocks redirect target that resolves to a private address", async () => {
    vi.mocked(dns.lookup).mockImplementation(
      ((hostname: string, options?: unknown) => {
        const all =
          options &&
          typeof options === "object" &&
          options !== null &&
          "all" in options &&
          Boolean((options as { all?: boolean }).all);
        if (hostname === "public.test") {
          return Promise.resolve(
            all ? [DEFAULT_DNS_ANSWER] : DEFAULT_DNS_ANSWER,
          );
        }
        if (hostname === "private.test") {
          return Promise.resolve(
            all
              ? [{ address: "192.168.1.1", family: 4 as const }]
              : { address: "192.168.1.1", family: 4 as const },
          );
        }
        return Promise.resolve(all ? [DEFAULT_DNS_ANSWER] : DEFAULT_DNS_ANSWER);
      }) as typeof dns.lookup,
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "http://private.test/secret" },
      }),
    );

    await expect(
      safeFetch("http://public.test/start"),
    ).rejects.toThrow(UnsafeOutboundUrlError);
  });

  it("returns the final response when no redirect", async () => {
    const final = new Response("ok", { status: 200 });
    fetchSpy.mockResolvedValueOnce(final);

    const res = await safeFetch("https://example.com/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("rejects when Content-Length exceeds maxResponseBytes", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-length": "999999999" },
      }),
    );

    await expect(
      safeFetch("https://example.com/huge", { maxResponseBytes: 1000 }),
    ).rejects.toThrow(UnsafeOutboundUrlError);
  });
});

describe("safeFetch HTTP proxy 407 fallback", () => {
  const PREV_PROXY = process.env.SAFE_OUTBOUND_HTTP_PROXY;

  afterEach(() => {
    if (PREV_PROXY === undefined) {
      delete process.env.SAFE_OUTBOUND_HTTP_PROXY;
    } else {
      process.env.SAFE_OUTBOUND_HTTP_PROXY = PREV_PROXY;
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("retries with direct egress after a proxy CONNECT 407", async () => {
    process.env.SAFE_OUTBOUND_HTTP_PROXY =
      "http://user:pass@127.0.0.1:65535";
    vi.resetModules();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockRejectedValueOnce(proxy407Error())
      .mockResolvedValueOnce(new Response("recovered", { status: 200 }));

    const { safeFetch: proxiedSafeFetch, safeOutboundEgressMode } =
      await import("./safe-outbound-fetch");
    expect(safeOutboundEgressMode).toBe("http_proxy");

    const res = await proxiedSafeFetch("https://example.com/article");
    expect(await res.text()).toBe("recovered");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries with direct egress when the proxy itself can't be reached", async () => {
    process.env.SAFE_OUTBOUND_HTTP_PROXY =
      "http://user:pass@127.0.0.1:65535";
    vi.resetModules();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockRejectedValueOnce(proxyConnectTimeoutError())
      .mockResolvedValueOnce(new Response("recovered", { status: 200 }));

    const { safeFetch: proxiedSafeFetch } = await import(
      "./safe-outbound-fetch"
    );

    const res = await proxiedSafeFetch("https://example.com/article");
    expect(await res.text()).toBe("recovered");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("UND_ERR_CONNECT_TIMEOUT"),
    );
  });

  it("does not retry an origin-side failure through the proxy", async () => {
    process.env.SAFE_OUTBOUND_HTTP_PROXY =
      "http://user:pass@127.0.0.1:65535";
    vi.resetModules();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const reset = new TypeError("fetch failed");
    (reset as TypeError & { cause: unknown }).cause = Object.assign(
      new Error("read ECONNRESET"),
      { code: "ECONNRESET" },
    );
    fetchSpy.mockRejectedValueOnce(reset);

    const { safeFetch: proxiedSafeFetch } = await import(
      "./safe-outbound-fetch"
    );

    await expect(
      proxiedSafeFetch("https://example.com/article"),
    ).rejects.toBe(reset);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("describeHttpProxyHopFailure", () => {
  it("names a refused CONNECT tunnel by its status", () => {
    expect(describeHttpProxyHopFailure(proxy407Error())).toBe("CONNECT 407");
    const bad = new TypeError("fetch failed");
    (bad as TypeError & { cause: unknown }).cause = new Error(
      "Proxy response (502) !== 200 when HTTP Tunneling",
    );
    expect(describeHttpProxyHopFailure(bad)).toBe("CONNECT 502");
  });

  it("names an unreachable proxy by the connection error code", () => {
    expect(describeHttpProxyHopFailure(proxyConnectTimeoutError())).toBe(
      "UND_ERR_CONNECT_TIMEOUT",
    );
    const refused = new TypeError("fetch failed");
    (refused as TypeError & { cause: unknown }).cause = Object.assign(
      new Error("connect ECONNREFUSED 127.0.0.1:65535"),
      { code: "ECONNREFUSED" },
    );
    expect(describeHttpProxyHopFailure(refused)).toBe("ECONNREFUSED");
  });

  it("returns null for aborts and origin-side errors", () => {
    expect(
      describeHttpProxyHopFailure(
        new DOMException("The operation was aborted.", "AbortError"),
      ),
    ).toBeNull();
    expect(
      describeHttpProxyHopFailure(
        Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      ),
    ).toBeNull();
    expect(describeHttpProxyHopFailure(new TypeError("fetch failed"))).toBeNull();
  });
});
