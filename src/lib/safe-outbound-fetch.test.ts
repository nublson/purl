import dns from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UnsafeOutboundUrlError,
  assertResolvableHostIsPublic,
  assertSafeHttpUrl,
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
