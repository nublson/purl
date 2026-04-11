/**
 * SSRF mitigation for server-side fetches to user-supplied URLs.
 * Validates http(s), blocks private/link-local/reserved ranges, follows redirects
 * manually with per-hop host checks.
 *
 * Connections use Undici with a custom `connect` that resolves DNS immediately
 * before `tls.connect` / `net.connect`, rejects answers that include any blocked
 * address (same policy as a pre-check), then pins the socket to one public IP
 * while preserving TLS SNI / hostname for certificate verification. That removes
 * the gap between an earlier DNS check and the actual connect where classic DNS
 * rebinding targets the pre-check vs connect split. A malicious authoritative
 * server can still race two clients between lookups; mitigating that fully needs
 * an egress proxy or non-cooperative resolver.
 *
 * Use {@link safeFetch} for fixed-host outbound calls too (e.g. YouTube oEmbed)
 * so every egress uses the same pinned-connect path; global fetch does not.
 *
 * Optional env (server-only):
 * - `SAFE_OUTBOUND_HTTP_PROXY` — HTTP(S) CONNECT proxy; proxy host uses the same
 *   pinned DNS/connect path via {@link safeOutboundConnect}. Upstream origin is
 *   reached by the proxy (not pinned in-app). Do not set `NO_PROXY` to bypass this;
 *   use explicit env only (not `EnvHttpProxyAgent`).
 * - `SAFE_OUTBOUND_SOCKS_PROXY` — `socks5://` or `socks://` proxy (Undici
 *   experimental). The TCP leg to the SOCKS host uses Undici’s default connector
 *   (no in-app pinning for that hop).
 * - `SAFE_OUTBOUND_DNS_SERVERS` — comma-separated resolvers for `dns.lookup`
 *   (e.g. `1.1.1.1,8.8.8.8`). Does not replace DoH or egress proxy guarantees.
 */

import dns from "node:dns/promises";
import dnsSync from "node:dns";
import net from "node:net";
import {
  Agent,
  Pool,
  ProxyAgent,
  Socks5ProxyAgent,
  buildConnector,
  fetch as undiciFetch,
} from "undici";

const DEFAULT_MAX_REDIRECTS = 8;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Max bytes streamed through the PDF viewer proxy (aligned with reasonable PDF size). */
export const PDF_PROXY_MAX_RESPONSE_BYTES = 40 * 1024 * 1024;

const CONNECT_TIMEOUT_MS = 10_000;

const baseUndiciConnect = buildConnector({ timeout: CONNECT_TIMEOUT_MS });

export class UnsafeOutboundUrlError extends Error {
  readonly name = "UnsafeOutboundUrlError";
}

/** How {@link safeFetch} reaches the network (set at module load from env). */
export type SafeOutboundEgressMode = "direct" | "http_proxy" | "socks5";

function applySafeOutboundDnsServers(): void {
  const raw = process.env.SAFE_OUTBOUND_DNS_SERVERS?.trim();
  if (!raw) return;

  const servers = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (servers.length === 0) return;

  for (const entry of servers) {
    if (!isValidDnsServerEntry(entry)) {
      throw new Error(
        `Invalid SAFE_OUTBOUND_DNS_SERVERS entry: ${JSON.stringify(entry)}`,
      );
    }
  }

  try {
    dnsSync.setServers(servers);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`SAFE_OUTBOUND_DNS_SERVERS could not be applied: ${msg}`);
  }
}

function isValidDnsServerEntry(entry: string): boolean {
  if (entry.length === 0 || entry.length > 253) return false;
  if (net.isIP(entry)) return true;
  return /^[a-zA-Z0-9.-]+$/.test(entry);
}

applySafeOutboundDnsServers();

function createPrivateNetworkBlockList(): net.BlockList {
  const bl = new net.BlockList();
  bl.addSubnet("127.0.0.0", 8, "ipv4");
  bl.addSubnet("10.0.0.0", 8, "ipv4");
  bl.addSubnet("172.16.0.0", 12, "ipv4");
  bl.addSubnet("192.168.0.0", 16, "ipv4");
  bl.addSubnet("169.254.0.0", 16, "ipv4");
  bl.addSubnet("100.64.0.0", 10, "ipv4");
  bl.addSubnet("0.0.0.0", 8, "ipv4");
  bl.addSubnet("224.0.0.0", 4, "ipv4");
  bl.addSubnet("240.0.0.0", 4, "ipv4");
  bl.addSubnet("::1", 128, "ipv6");
  bl.addSubnet("fe80::", 10, "ipv6");
  bl.addSubnet("fc00::", 7, "ipv6");
  bl.addSubnet("ff00::", 8, "ipv6");
  return bl;
}

const privateNetworkBlockList = createPrivateNetworkBlockList();

function isBlockedIp(address: string, family: 4 | 6): boolean {
  const type = family === 6 ? "ipv6" : "ipv4";
  const lower = address.toLowerCase();
  if (family === 6 && lower.startsWith("::ffff:")) {
    const tail = address.slice(7);
    if (net.isIPv4(tail)) {
      return privateNetworkBlockList.check(tail, "ipv4");
    }
  }
  return privateNetworkBlockList.check(address, type);
}

function stripBrackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/**
 * Ensures the host resolves only to non-blocked addresses, then returns one
 * public IP to open the TCP connection to (TLS SNI uses the original hostname).
 */
export async function pickPinnedConnectAddress(hostname: string): Promise<{
  address: string;
  family: 4 | 6;
}> {
  const host = stripBrackets(hostname);

  const kind = net.isIP(host);
  if (kind === 4) {
    if (isBlockedIp(host, 4)) {
      throw new UnsafeOutboundUrlError("Target address is not allowed");
    }
    return { address: host, family: 4 };
  }
  if (kind === 6) {
    const lower = host.toLowerCase();
    const mapped = lower.startsWith("::ffff:") ? host.slice(7) : null;
    if (mapped && net.isIPv4(mapped)) {
      if (isBlockedIp(mapped, 4)) {
        throw new UnsafeOutboundUrlError("Target address is not allowed");
      }
      return { address: host, family: 6 };
    }
    if (isBlockedIp(host, 6)) {
      throw new UnsafeOutboundUrlError("Target address is not allowed");
    }
    return { address: host, family: 6 };
  }

  const records = await dns.lookup(host, { all: true, verbatim: true });
  for (const { address, family } of records) {
    const fam: 4 | 6 = family === 6 ? 6 : 4;
    if (fam === 6 && address.toLowerCase().startsWith("::ffff:")) {
      const v4 = address.slice(7);
      if (net.isIPv4(v4) && isBlockedIp(v4, 4)) {
        throw new UnsafeOutboundUrlError("Target address is not allowed");
      }
      continue;
    }
    if (isBlockedIp(address, fam)) {
      throw new UnsafeOutboundUrlError("Target address is not allowed");
    }
  }

  if (records.length === 0) {
    throw new UnsafeOutboundUrlError("DNS lookup returned no addresses");
  }

  const first = records[0]!;
  const fam: 4 | 6 = first.family === 6 ? 6 : 4;
  return { address: first.address, family: fam };
}

/**
 * Undici connect hook: resolve + validate in the same turn as connect, then dial
 * the chosen IP so the socket target matches the validated address.
 */
function safeOutboundConnect(
  opts: Parameters<typeof baseUndiciConnect>[0],
  callback: Parameters<typeof baseUndiciConnect>[1],
): void {
  const originalHostname = opts.hostname;

  pickPinnedConnectAddress(originalHostname)
    .then(({ address }) => {
      const next: Parameters<typeof baseUndiciConnect>[0] = {
        ...opts,
        hostname: address,
      };
      if (next.protocol === "https:") {
        next.servername = opts.servername ?? originalHostname;
      }
      baseUndiciConnect(next, callback);
    })
    .catch((err: unknown) => {
      const e =
        err instanceof Error ? err : new Error(String(err));
      callback(e, null);
    });
}

const safeOutboundAgent = new Agent({
  connect: safeOutboundConnect,
});

function assertValidHttpProxyUri(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SAFE_OUTBOUND_HTTP_PROXY is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "SAFE_OUTBOUND_HTTP_PROXY must use http:// or https://",
    );
  }
  if (!url.hostname) {
    throw new Error("SAFE_OUTBOUND_HTTP_PROXY must include a hostname");
  }
  return url.href;
}

function assertValidSocksProxyUri(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SAFE_OUTBOUND_SOCKS_PROXY is not a valid URL");
  }
  if (url.protocol !== "socks5:" && url.protocol !== "socks:") {
    throw new Error(
      "SAFE_OUTBOUND_SOCKS_PROXY must use socks5:// or socks://",
    );
  }
  if (!url.hostname) {
    throw new Error("SAFE_OUTBOUND_SOCKS_PROXY must include a hostname");
  }
  return url.href;
}

function createSafeFetchDispatcher(): {
  dispatcher: Agent | ProxyAgent | Socks5ProxyAgent;
  mode: SafeOutboundEgressMode;
} {
  const httpProxyRaw = process.env.SAFE_OUTBOUND_HTTP_PROXY?.trim() ?? "";
  const socksProxyRaw = process.env.SAFE_OUTBOUND_SOCKS_PROXY?.trim() ?? "";

  if (httpProxyRaw && socksProxyRaw) {
    throw new Error(
      "Set only one of SAFE_OUTBOUND_HTTP_PROXY or SAFE_OUTBOUND_SOCKS_PROXY",
    );
  }

  if (httpProxyRaw) {
    const uri = assertValidHttpProxyUri(httpProxyRaw);
    const dispatcher = new ProxyAgent({
      uri,
      clientFactory: (origin, options) =>
        new Pool(origin, {
          ...options,
          connect: safeOutboundConnect,
        }),
    });
    return { dispatcher, mode: "http_proxy" };
  }

  if (socksProxyRaw) {
    const uri = assertValidSocksProxyUri(socksProxyRaw);
    return {
      dispatcher: new Socks5ProxyAgent(uri),
      mode: "socks5",
    };
  }

  return { dispatcher: safeOutboundAgent, mode: "direct" };
}

const { dispatcher: safeFetchDispatcher, mode: safeOutboundEgressMode } =
  createSafeFetchDispatcher();

export { safeOutboundEgressMode };

export function assertSafeHttpUrl(urlInput: string | URL): URL {
  let url: URL;
  try {
    url = typeof urlInput === "string" ? new URL(urlInput) : new URL(urlInput.href);
  } catch {
    throw new UnsafeOutboundUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeOutboundUrlError("Only http(s) URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError("URLs with credentials are not allowed");
  }
  if (!url.hostname) {
    throw new UnsafeOutboundUrlError("Missing hostname");
  }
  return url;
}

/** Fails if the host is a blocked literal IP or DNS returns any blocked record. */
export async function assertResolvableHostIsPublic(
  hostname: string,
): Promise<void> {
  await pickPinnedConnectAddress(hostname);
}

export type SafeFetchInit = RequestInit & {
  maxRedirects?: number;
  /** When set, rejects responses whose Content-Length exceeds this value. */
  maxResponseBytes?: number;
};

/**
 * Fetch with manual redirects; each request uses the configured egress dispatcher
 * (direct pinned connect, HTTP proxy with pinned connect to the proxy, or SOCKS5).
 */
export async function safeFetch(
  input: string | URL,
  init: SafeFetchInit = {},
): Promise<Response> {
  const {
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    maxResponseBytes,
    ...requestInit
  } = init;

  let url = assertSafeHttpUrl(typeof input === "string" ? input : input.href);

  let redirectCount = 0;

  for (;;) {
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(url.href, {
        ...requestInit,
        dispatcher: safeFetchDispatcher,
        redirect: "manual",
      } as Parameters<typeof undiciFetch>[1]);
    } catch (err) {
      if (
        err instanceof TypeError &&
        err.cause instanceof UnsafeOutboundUrlError
      ) {
        throw err.cause;
      }
      throw err;
    }

    if (REDIRECT_STATUSES.has(res.status)) {
      const location = res.headers.get("location");
      if (!location) {
        await res.body?.cancel();
        throw new UnsafeOutboundUrlError("Redirect without Location header");
      }
      if (redirectCount >= maxRedirects) {
        await res.body?.cancel();
        throw new UnsafeOutboundUrlError("Too many redirects");
      }
      redirectCount += 1;
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, url);
      } catch {
        await res.body?.cancel();
        throw new UnsafeOutboundUrlError("Invalid redirect URL");
      }
      url = assertSafeHttpUrl(nextUrl);
      await res.body?.cancel();
      continue;
    }

    if (maxResponseBytes !== undefined) {
      const cl = res.headers.get("content-length");
      if (cl) {
        const n = Number(cl);
        if (Number.isFinite(n) && n > maxResponseBytes) {
          await res.body?.cancel();
          throw new UnsafeOutboundUrlError("Response exceeds maximum size");
        }
      }
    }

    return res as unknown as Response;
  }
}

/**
 * Wraps a byte stream so at most maxBytes are forwarded; errors if exceeded.
 */
export function limitReadableStreamByBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let consumed = 0;
  const reader = stream.getReader();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (consumed + value.byteLength > maxBytes) {
        await reader.cancel();
        controller.error(
          new UnsafeOutboundUrlError("Response exceeds maximum size"),
        );
        return;
      }
      consumed += value.byteLength;
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
