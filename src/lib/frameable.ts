import { safeFetch } from "@/lib/safe-outbound-fetch";
import { timeoutSignal } from "@/utils/abort-signal";

const CHECK_TIMEOUT_MS = 5000;

/** Purl's own origin (`BASE_URL`, else purl.live), the one that would frame a page. */
function purlOrigin(): string {
  try {
    return new URL(process.env.BASE_URL as string).origin;
  } catch {
    return "https://purl.live";
  }
}

/** A scheme in a CSP source matches the origin's, and `http` matches `https` too (CSP3). */
function schemeAllows(scheme: string, origin: URL): boolean {
  return (
    `${scheme}:` === origin.protocol ||
    (scheme === "http" && origin.protocol === "https:")
  );
}

/** The origin's port as a number, the scheme's default when it has none. */
function effectivePort(origin: URL): string {
  if (origin.port) return origin.port;
  return origin.protocol === "https:" ? "443" : "80";
}

/** Whether one `frame-ancestors` source lets `origin` embed the page. */
function sourceAllows(source: string, origin: URL): boolean {
  const s = source.toLowerCase();
  if (s === "*") return true;
  if (s === "'none'" || s === "'self'") return false;
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return schemeAllows(s.slice(0, -1), origin);
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/:]+)(?::(\d+|\*))?(?:\/.*)?$/.exec(
    s,
  );
  if (!m) return false;
  const [, scheme, host, port] = m;
  if (scheme && !schemeAllows(scheme, origin)) return false;
  if (!scheme && origin.protocol !== "https:" && origin.protocol !== "http:") {
    return false;
  }
  // `https://purl.live:443` names the default port, which the origin leaves empty.
  if (port && port !== "*" && port !== effectivePort(origin)) return false;
  const originHost = origin.hostname.toLowerCase();
  if (host.startsWith("*.")) return originHost.endsWith(host.slice(1));
  return host === originHost;
}

/**
 * Whether a page's response headers let `origin` show it in an iframe, the
 * way browsers read them: a Content-Security-Policy with `frame-ancestors`
 * decides on its own (every policy that has one must list a source matching
 * `origin`, and `X-Frame-Options` is ignored beside it, as CSP3 says);
 * without one, `X-Frame-Options` blocks only as `DENY` or `SAMEORIGIN` (any
 * other value, `ALLOWALL` or the obsolete `ALLOW-FROM`, is ignored by
 * browsers).
 */
export function isFrameable(headers: Headers, origin: string): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const csp = headers.get("content-security-policy") ?? "";
  let decided = false;
  // Several policies arrive comma-joined; each one must allow framing.
  for (const policy of csp.split(",")) {
    for (const directive of policy.split(";")) {
      const [name, ...sources] = directive.trim().split(/\s+/);
      if (name?.toLowerCase() !== "frame-ancestors") continue;
      decided = true;
      if (!sources.some((s) => sourceAllows(s, originUrl))) return false;
      break;
    }
  }
  if (decided) return true;
  const xfo = headers.get("x-frame-options") ?? "";
  return !xfo
    .split(",")
    .some((value) => /^(deny|sameorigin)$/i.test(value.trim()));
}

async function probe(
  url: string,
  method: "HEAD" | "GET",
): Promise<Response | null> {
  try {
    const res = await safeFetch(url, {
      method,
      signal: timeoutSignal(CHECK_TIMEOUT_MS),
    });
    if (method === "GET") await res.body?.cancel().catch(() => {});
    return res;
  } catch {
    return null;
  }
}

/**
 * Asks the page itself whether it allows being framed by Purl: HEAD, then
 * GET when HEAD failed in any way (405 and 501, but also a bot wall's 403
 * or a CDN that refuses HEAD). A page that answers GET with 401 or 403 is
 * judged by its headers all the same: the visitor's browser carries its own
 * session, and what it frames is that answer.
 */
export async function checkFrameable(
  url: string,
): Promise<"allowed" | "blocked" | "unreachable"> {
  let res = await probe(url, "HEAD");
  if (!res || res.status >= 400) {
    res = await probe(url, "GET");
  }
  if (!res || (res.status >= 400 && res.status !== 401 && res.status !== 403)) {
    return "unreachable";
  }
  return isFrameable(res.headers, purlOrigin()) ? "allowed" : "blocked";
}
