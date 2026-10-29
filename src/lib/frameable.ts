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

/** Whether one `frame-ancestors` source lets `origin` embed the page. */
function sourceAllows(source: string, origin: URL): boolean {
  const s = source.toLowerCase();
  if (s === "*") return true;
  if (s === "'none'" || s === "'self'") return false;
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return origin.protocol === s;
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/:]+)(?::(\d+|\*))?(?:\/.*)?$/.exec(
    s,
  );
  if (!m) return false;
  const [, scheme, host, port] = m;
  if (scheme && `${scheme}:` !== origin.protocol) return false;
  if (!scheme && origin.protocol !== "https:" && origin.protocol !== "http:") {
    return false;
  }
  if (port && port !== "*" && port !== origin.port) return false;
  const originHost = origin.hostname.toLowerCase();
  if (host.startsWith("*.")) return originHost.endsWith(host.slice(1));
  return host === originHost;
}

/**
 * Whether a page's response headers let `origin` show it in an iframe: no
 * `X-Frame-Options`, and every Content-Security-Policy either has no
 * `frame-ancestors` or lists a source matching `origin`.
 */
export function isFrameable(headers: Headers, origin: string): boolean {
  if (headers.get("x-frame-options")) return false;
  const csp = headers.get("content-security-policy");
  if (!csp) return true;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  // Several policies arrive comma-joined; each one must allow framing.
  for (const policy of csp.split(",")) {
    for (const directive of policy.split(";")) {
      const [name, ...sources] = directive.trim().split(/\s+/);
      if (name?.toLowerCase() !== "frame-ancestors") continue;
      if (!sources.some((s) => sourceAllows(s, originUrl))) return false;
      break;
    }
  }
  return true;
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

/** Asks the page itself (HEAD, then GET) whether it allows being framed by Purl. */
export async function checkFrameable(
  url: string,
): Promise<"allowed" | "blocked" | "unreachable"> {
  let res = await probe(url, "HEAD");
  if (!res || res.status === 405 || res.status === 501) {
    res = await probe(url, "GET");
  }
  if (!res || res.status >= 400) return "unreachable";
  return isFrameable(res.headers, purlOrigin()) ? "allowed" : "blocked";
}
