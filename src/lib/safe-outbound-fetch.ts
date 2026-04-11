/**
 * SSRF mitigation for server-side fetches to user-supplied URLs.
 * Validates http(s), resolves DNS, blocks private/link-local/reserved ranges,
 * follows redirects manually with per-hop host checks.
 *
 * Pre-fetch DNS checks reduce SSRF risk but do not remove DNS rebinding (TOCTOU);
 * stricter setups would pin addresses or use an isolated egress proxy.
 */

import dns from "node:dns/promises";
import net from "node:net";

const DEFAULT_MAX_REDIRECTS = 8;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Max bytes streamed through the PDF viewer proxy (aligned with reasonable PDF size). */
export const PDF_PROXY_MAX_RESPONSE_BYTES = 40 * 1024 * 1024;

export class UnsafeOutboundUrlError extends Error {
  readonly name = "UnsafeOutboundUrlError";
}

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

export async function assertResolvableHostIsPublic(hostname: string): Promise<void> {
  const host =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  const kind = net.isIP(host);
  if (kind === 4) {
    if (isBlockedIp(host, 4)) {
      throw new UnsafeOutboundUrlError("Target address is not allowed");
    }
    return;
  }
  if (kind === 6) {
    const lower = host.toLowerCase();
    const mapped = lower.startsWith("::ffff:") ? host.slice(7) : null;
    if (mapped && net.isIPv4(mapped)) {
      if (isBlockedIp(mapped, 4)) {
        throw new UnsafeOutboundUrlError("Target address is not allowed");
      }
      return;
    }
    if (isBlockedIp(host, 6)) {
      throw new UnsafeOutboundUrlError("Target address is not allowed");
    }
    return;
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
}

export type SafeFetchInit = RequestInit & {
  maxRedirects?: number;
  /** When set, rejects responses whose Content-Length exceeds this value. */
  maxResponseBytes?: number;
};

/**
 * Fetch with manual redirects; re-validates each redirect target host.
 * Does not read the body; callers can enforce streaming limits separately.
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
  await assertResolvableHostIsPublic(url.hostname);

  let redirectCount = 0;

  for (;;) {
    const res = await fetch(url.href, {
      ...requestInit,
      redirect: "manual",
    });

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
      await assertResolvableHostIsPublic(url.hostname);
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

    return res;
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
