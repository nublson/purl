import dnsSync from "node:dns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dynamic-import only: `safe-outbound-fetch` reads env at module load; isolate from
 * the main test file that static-imports it with default env.
 */
describe("safe-outbound-fetch egress env", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SAFE_OUTBOUND_HTTP_PROXY;
    delete process.env.SAFE_OUTBOUND_SOCKS_PROXY;
    delete process.env.SAFE_OUTBOUND_DNS_SERVERS;
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("defaults to direct egress", async () => {
    const { safeOutboundEgressMode } = await import("./safe-outbound-fetch");
    expect(safeOutboundEgressMode).toBe("direct");
  });

  it("uses http_proxy when SAFE_OUTBOUND_HTTP_PROXY is set", async () => {
    process.env.SAFE_OUTBOUND_HTTP_PROXY = "http://198.51.100.2:3128";
    const undici = await import("undici");
    const proxyAgentSpy = vi.spyOn(undici, "ProxyAgent");
    const { safeOutboundEgressMode } = await import("./safe-outbound-fetch");
    expect(safeOutboundEgressMode).toBe("http_proxy");
    expect(proxyAgentSpy).toHaveBeenCalled();
    const call = proxyAgentSpy.mock.calls[0]![0] as { uri: string; clientFactory?: unknown };
    expect(call.uri).toBe("http://198.51.100.2:3128/");
    expect(typeof call.clientFactory).toBe("function");
  });

  it("uses socks5 when SAFE_OUTBOUND_SOCKS_PROXY is set", async () => {
    process.env.SAFE_OUTBOUND_SOCKS_PROXY = "socks5://198.51.100.3:1080";
    const undici = await import("undici");
    const socksSpy = vi.spyOn(undici, "Socks5ProxyAgent");
    const { safeOutboundEgressMode } = await import("./safe-outbound-fetch");
    expect(safeOutboundEgressMode).toBe("socks5");
    expect(socksSpy).toHaveBeenCalledTimes(1);
    expect(socksSpy.mock.calls[0]![0]).toBe("socks5://198.51.100.3:1080");
  });

  it("throws when both HTTP and SOCKS proxy env vars are set", async () => {
    process.env.SAFE_OUTBOUND_HTTP_PROXY = "http://127.0.0.1:8080";
    process.env.SAFE_OUTBOUND_SOCKS_PROXY = "socks5://127.0.0.1:1080";
    await expect(import("./safe-outbound-fetch")).rejects.toThrow(
      /only one of SAFE_OUTBOUND_HTTP_PROXY/,
    );
  });

  it("applies SAFE_OUTBOUND_DNS_SERVERS via dns.setServers", async () => {
    const setServersSpy = vi
      .spyOn(dnsSync, "setServers")
      .mockImplementation(() => undefined);
    process.env.SAFE_OUTBOUND_DNS_SERVERS = "1.1.1.1, 8.8.8.8";
    await import("./safe-outbound-fetch");
    expect(setServersSpy).toHaveBeenCalledWith(["1.1.1.1", "8.8.8.8"]);
  });

  it("throws on invalid SAFE_OUTBOUND_DNS_SERVERS entry", async () => {
    process.env.SAFE_OUTBOUND_DNS_SERVERS = "not!!!invalid";
    await expect(import("./safe-outbound-fetch")).rejects.toThrow(
      /Invalid SAFE_OUTBOUND_DNS_SERVERS/,
    );
  });

  it("throws on invalid SAFE_OUTBOUND_HTTP_PROXY protocol", async () => {
    process.env.SAFE_OUTBOUND_HTTP_PROXY = "ftp://proxy.example:21";
    await expect(import("./safe-outbound-fetch")).rejects.toThrow(
      /must use http:\/\/ or https:\/\//,
    );
  });
});
