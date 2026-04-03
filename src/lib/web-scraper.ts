import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { STREAMING_MUSIC_DOMAINS } from "@/utils/streaming-music";

/** Thrown for hostnames that need a browser; ingest should mark the link FAILED. */
export class UnsupportedSpaError extends Error {
  readonly name = "UnsupportedSpaError";
}

const UNSUPPORTED_HOST_SUFFIXES = [
  "x.com",
  "twitter.com",
  "instagram.com",
  "facebook.com",
  "threads.net",
  "tiktok.com",
  "linkedin.com",
  "reddit.com",
  ...STREAMING_MUSIC_DOMAINS,
] as const;

function isHostnameOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isSpaHostname(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const stripped = hostname.replace(/^www\./, "");
    return UNSUPPORTED_HOST_SUFFIXES.some((domain) =>
      isHostnameOrSubdomain(stripped, domain),
    );
  } catch {
    return false;
  }
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)";

/** Max response size for web scraping (bytes). */
const WEB_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 30_000;

function parseContentLength(header: string | null): number | null {
  if (!header) return null;
  const n = Number(header);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isHtmlContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return lower.includes("text/html") || lower.includes("application/xhtml+xml");
}

/** Collapse whitespace and strip common HTML-text artifacts. */
function cleanWebText(text: string): string {
  return text
    .replace(/\uFEFF/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetches a URL, parses HTML with jsdom, extracts the main article via Readability,
 * and returns normalized plain text. Throws if the response is not HTML or extraction fails.
 */
export async function scrapeWebContent(url: string): Promise<string> {
  if (isSpaHostname(url)) {
    throw new UnsupportedSpaError(
      "This site requires a browser to render and cannot be scraped server-side.",
    );
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!isHtmlContentType(contentType)) {
    throw new Error("URL did not return an HTML document.");
  }

  const declaredLen = parseContentLength(
    response.headers.get("content-length"),
  );
  if (declaredLen !== null && declaredLen > WEB_MAX_RESPONSE_BYTES) {
    throw new Error(
      `Web page exceeds maximum size of ${WEB_MAX_RESPONSE_BYTES / (1024 * 1024)} MB`,
    );
  }

  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > WEB_MAX_RESPONSE_BYTES) {
    throw new Error(
      `Web page exceeds maximum size of ${WEB_MAX_RESPONSE_BYTES / (1024 * 1024)} MB`,
    );
  }

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Could not extract readable content from this page.");
  }

  const raw = article.textContent?.trim() ?? "";
  return cleanWebText(raw);
}
