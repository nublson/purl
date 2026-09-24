import type { ContentType } from "@/generated/prisma/enums";
import { assertCanSaveLink } from "@/lib/entitlements";
import {
  OG_HTML_READ_MAX_BYTES,
  readHtmlForOpenGraph,
} from "@/lib/og-html";
import { validateOgThumbnailUrl } from "@/lib/og-thumbnail-probe";
import prisma from "@/lib/prisma";
import { safeFetch } from "@/lib/safe-outbound-fetch";
import { getSessionUser } from "@/lib/session";
import { detectContentType } from "@/lib/server-detect-content-type";
import { getDefaultFaviconUrl } from "@/utils/default-favicon";
import { getUrlDomain } from "@/utils/formatter";
import type { Link } from "@/utils/links";
import { isPdfUrl } from "@/utils/pdf";
import { derivePdfTitleFromUrl } from "@/utils/pdf-title";
import { isYouTubeUrl } from "@/utils/youtube";
import ogs from "open-graph-scraper";
import { cache } from "react";

/** Metadata HTML fetch budget (head-only read; allow slower proxy egress). */
const OGS_FETCH_TIMEOUT_MS = 15_000;

/**
 * Normalizes a URL so we can tell if og:image mistakenly points at the HTML
 * document (same as the page or og:url) instead of a real image asset.
 */
function normalizeOpenGraphResourceUrl(href: string): string {
  const u = new URL(href);
  u.hash = "";
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return `${u.protocol}//${u.host}${path}${u.search}`;
}

function collectOpenGraphPageIdentityUrls(
  requestUrl: string,
  responseUrl: string,
  ogUrl: string | undefined,
): Set<string> {
  const set = new Set<string>();
  const candidates = [requestUrl, ogUrl].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  if (responseUrl) {
    candidates.push(responseUrl);
  }
  for (const raw of candidates) {
    try {
      const absolute = new URL(raw, requestUrl).href;
      set.add(normalizeOpenGraphResourceUrl(absolute));
    } catch {
      // ignore invalid URLs from metadata
    }
  }
  return set;
}

/** Returns null when og:image is the page URL / og:url (common misconfiguration). */
function resolveWebOgThumbnail(
  rawImageUrl: string | null | undefined,
  requestUrl: string,
  responseUrl: string,
  ogUrl: string | undefined,
): string | null {
  const trimmed = rawImageUrl?.trim();
  if (!trimmed) return null;
  try {
    const absoluteThumb = new URL(trimmed, requestUrl).href;
    const normalizedThumb = normalizeOpenGraphResourceUrl(absoluteThumb);
    const pageIds = collectOpenGraphPageIdentityUrls(
      requestUrl,
      responseUrl,
      ogUrl,
    );
    if (pageIds.has(normalizedThumb)) return null;
    return absoluteThumb;
  } catch {
    return null;
  }
}

/** oEmbed JSON is small; cap avoids unbounded reads. */
const YOUTUBE_OEMBED_MAX_BYTES = 256 * 1024;

/** Thrown when link helpers are called without an authenticated user. */
export class UnauthorizedError extends Error {
  readonly name = "UnauthorizedError";
  constructor() {
    super("Unauthorized");
  }
}

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

async function scrapePdfMetadata(
  url: string,
  domain: string,
): Promise<{
  title: string;
  description: string | null;
  thumbnail: string | null;
}> {
  let contentLengthBytes: number | null = null;
  let contentDisposition: string | null = null;

  try {
    const headResponse = await safeFetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
      },
      signal: AbortSignal.timeout(8000),
    });
    await headResponse.body?.cancel();
    contentLengthBytes = Number(
      headResponse.headers.get("content-length") ?? "",
    );
    if (!Number.isFinite(contentLengthBytes) || contentLengthBytes <= 0) {
      contentLengthBytes = null;
    }
    contentDisposition = headResponse.headers.get("content-disposition");
  } catch {}

  const dispositionTitle =
    contentDisposition
      ?.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i)?.[1]
      ?.replace(/"/g, "") ?? null;

  const title = (
    dispositionTitle
      ? decodeURIComponent(dispositionTitle).replace(/\.pdf$/i, "")
      : derivePdfTitleFromUrl(url, domain)
  ).slice(0, 500);
  const formattedSize = formatFileSize(contentLengthBytes);
  const description = formattedSize
    ? `PDF Document - ${formattedSize}`
    : "PDF Document";
  const thumbnail = null;

  return { title, description, thumbnail };
}

async function scrapeYouTubeMetadata(
  url: string,
  defaultFavicon: string,
): Promise<{
  title: string;
  description: string | null;
  favicon: string;
  thumbnail: string | null;
} | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await safeFetch(oembedUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
      },
      signal: AbortSignal.timeout(8000),
      maxRedirects: 4,
      maxResponseBytes: YOUTUBE_OEMBED_MAX_BYTES,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    const title = (data.title ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (!title) return null;
    const description = data.author_name?.replace(/\s+/g, " ").trim() || null;
    const thumbnail = data.thumbnail_url?.trim() || null;
    return { title, description, favicon: defaultFavicon, thumbnail };
  } catch {
    return null;
  }
}

type LinkRow = {
  id: string;
  url: string;
  title: string;
  favicon: string;
  domain: string;
  contentType: ContentType;
  description: string | null;
  thumbnail: string | null;
  createdAt: Date;
};

function mapRowToLink(row: LinkRow): Link {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    favicon: row.favicon,
    description: row.description,
    thumbnail: row.thumbnail,
    domain: row.domain,
    contentType: row.contentType,
    createdAt: row.createdAt,
  };
}

export async function scrapeLinkMetadata(url: string): Promise<{
  title: string;
  description: string | null;
  favicon: string;
  thumbnail: string | null;
}> {
  const domain = getUrlDomain(url);
  const defaultFavicon = getDefaultFaviconUrl(domain);
  if (isPdfUrl(url)) {
    const pdfMetadata = await scrapePdfMetadata(url, domain);
    return {
      title: pdfMetadata.title,
      description: pdfMetadata.description,
      favicon: defaultFavicon,
      thumbnail: pdfMetadata.thumbnail,
    };
  }

  if (isYouTubeUrl(url)) {
    const yt = await scrapeYouTubeMetadata(url, defaultFavicon);
    if (yt) return yt;
  }

  try {
    const pageResponse = await safeFetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
      },
      signal: AbortSignal.timeout(OGS_FETCH_TIMEOUT_MS),
      // Cap declared size; body is streamed only until </head> (see readHtmlForOpenGraph).
      maxResponseBytes: OG_HTML_READ_MAX_BYTES * 8,
    });

    const html = await readHtmlForOpenGraph(pageResponse);

    const { error, result } = await ogs({
      html,
      timeout: 8,
    });

    if (error || !result) {
      return {
        title: domain,
        description: null,
        favicon: defaultFavicon,
        thumbnail: null,
      };
    }

    const title =
      (result.ogTitle ?? result.twitterTitle ?? domain)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500) || domain;
    const description =
      result.ogDescription ?? result.twitterDescription ?? null;
    const rawImageUrl =
      result.ogImage?.[0]?.url ?? result.twitterImage?.[0]?.url;
    let thumbnail = resolveWebOgThumbnail(
      rawImageUrl,
      url,
      pageResponse.url,
      result.ogUrl,
    );
    if (thumbnail && !(await validateOgThumbnailUrl(thumbnail))) {
      thumbnail = null;
    }
    const favicon = result.favicon
      ? new URL(result.favicon, url).href
      : defaultFavicon;

    return {
      title,
      description,
      favicon,
      thumbnail,
    };
  } catch {
    return {
      title: domain,
      description: null,
      favicon: defaultFavicon,
      thumbnail: null,
    };
  }
}

export type ResolvedLinkFields = {
  url: string;
  domain: string;
  contentType: ContentType;
  title: string;
  description: string | null;
  favicon: string;
  thumbnail: string | null;
};

/** Resolves domain, content type, and scraped metadata for a URL (shared by create/update and preview API). */
export async function resolveLinkFromUrl(
  url: string,
): Promise<ResolvedLinkFields> {
  const domain = getUrlDomain(url);
  // Independent network work: run the HEAD/sniff and the page scrape in parallel.
  const [detected, { title, description, favicon, thumbnail }] =
    await Promise.all([detectContentType(url), scrapeLinkMetadata(url)]);
  const contentType = detected as ContentType;
  return {
    url,
    domain,
    contentType,
    title,
    description,
    favicon,
    thumbnail,
  };
}

/** Resolves the current user id from request context. Throws UnauthorizedError if not authenticated. */
async function getCurrentUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

export type LinksPage = {
  links: Link[];
  nextCursor: string | null;
  /** The user's total saved links; only set when `withTotal` is true. */
  total?: number;
};

/** One page of the current user's links, newest first. `cursor` is the ISO `createdAt` of the last link already loaded. */
export const getLinksPageForCurrentUser = cache(
  async (
    limit: number,
    cursor: string | null = null,
    withTotal = false,
  ): Promise<LinksPage> => {
    const userId = await getCurrentUserId();
    const [{ links, nextCursor }, total] = await Promise.all([
      listLinksForUser(userId, { limit, cursor, contentType: null }),
      withTotal ? prisma.link.count({ where: { userId } }) : undefined,
    ]);
    return { links: links.map(mapRowToLink), nextCursor, total };
  },
);

/** Case-insensitive search over the current user's links (title, URL, domain, description), newest first. An empty query returns the most recent links. */
export async function searchLinksForCurrentUser(
  query: string,
  limit: number,
): Promise<Link[]> {
  const userId = await getCurrentUserId();
  const q = query.trim();
  const rows = await prisma.link.findMany({
    where: q
      ? {
          userId,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { url: { contains: q, mode: "insensitive" } },
            { domain: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapRowToLink);
}

export type CreateLinkResult = Awaited<ReturnType<typeof prisma.link.create>>;
export type RefreshLinkResult = Awaited<ReturnType<typeof prisma.link.update>>;

/** Re-scrapes link metadata for the current user and bumps it to the top of the list. */
export async function refreshLink(
  id: string,
): Promise<RefreshLinkResult | null> {
  const userId = await getCurrentUserId();
  const existing = await prisma.link.findFirst({
    where: { id, userId },
  });
  if (!existing) return null;

  const resolved = await resolveLinkFromUrl(existing.url);
  const refreshed = await prisma.link.update({
    where: { id },
    data: {
      title: resolved.title,
      description: resolved.description,
      favicon: resolved.favicon,
      thumbnail: resolved.thumbnail,
      domain: resolved.domain,
      contentType: resolved.contentType,
      createdAt: new Date(),
    },
  });

  return refreshed;
}

/** Creates a link for the current user after scraping metadata. If a link with the same URL already exists, updates its createdAt and returns it. Throws UnauthorizedError if not authenticated. */
export async function createLink(url: string): Promise<CreateLinkResult> {
  const userId = await getCurrentUserId();
  return createLinkForUser(userId, url);
}

/** Creates a link for an explicit user id. Used where the caller has already resolved the user (e.g. the MCP server via bearer token). */
export async function createLinkForUser(
  userId: string,
  url: string,
): Promise<CreateLinkResult> {
  const existing = await prisma.link.findFirst({
    where: { userId, url },
  });
  if (existing) {
    return (await refreshLink(existing.id)) ?? existing;
  }

  await assertCanSaveLink(userId);

  const resolved = await resolveLinkFromUrl(url);

  const link = await prisma.link.create({
    data: {
      url: resolved.url,
      title: resolved.title,
      description: resolved.description,
      favicon: resolved.favicon,
      thumbnail: resolved.thumbnail,
      domain: resolved.domain,
      contentType: resolved.contentType,
      userId,
    },
  });
  return link;
}

/** Fetches a single link if it belongs to the current user; otherwise null. Throws UnauthorizedError if not authenticated. */
export async function readLink(id: string): Promise<Link | null> {
  const userId = await getCurrentUserId();
  return readLinkForUser(userId, id);
}

/** Fetches a single link for an explicit user id; otherwise null. */
export async function readLinkForUser(
  userId: string,
  id: string,
): Promise<Link | null> {
  const row = await prisma.link.findFirst({
    where: { id, userId },
  });
  return row ? mapRowToLink(row) : null;
}

export type UpdateLinkData = {
  url?: string;
  title?: string;
  description?: string | null;
};

export type UpdateLinkResult = Awaited<ReturnType<typeof prisma.link.update>>;

/** Updates a link if it belongs to the current user. Re-scrapes metadata if url changes. Returns null if not found or not owned. Throws UnauthorizedError if not authenticated. */
export async function updateLink(
  id: string,
  data: UpdateLinkData,
): Promise<UpdateLinkResult | null> {
  const userId = await getCurrentUserId();
  const existing = await prisma.link.findFirst({
    where: { id, userId },
  });
  if (!existing) return null;

  const nextUrl = data.url?.trim();
  const urlChanged =
    typeof nextUrl === "string" &&
    nextUrl.length > 0 &&
    nextUrl !== existing.url;

  let updatePayload: Parameters<typeof prisma.link.update>[0]["data"] = {};

  if (urlChanged && nextUrl) {
    const resolved = await resolveLinkFromUrl(nextUrl);
    updatePayload = {
      url: resolved.url,
      domain: resolved.domain,
      title: resolved.title,
      description: resolved.description,
      favicon: resolved.favicon,
      thumbnail: resolved.thumbnail,
      contentType: resolved.contentType,
    };
  } else {
    if (typeof data.title === "string") updatePayload.title = data.title;
    if (data.description !== undefined)
      updatePayload.description = data.description;
  }

  if (Object.keys(updatePayload).length === 0) return existing;

  return prisma.link.update({
    where: { id },
    data: updatePayload,
  });
}

/** Deletes a link if it belongs to the current user. Returns true if deleted, false if not found or not owned. Throws UnauthorizedError if not authenticated. */
export async function deleteLink(id: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  const existing = await prisma.link.findFirst({
    where: { id, userId },
  });
  if (!existing) return false;
  await prisma.link.delete({ where: { id } });
  return true;
}

export type ListLinksOptions = {
  limit: number;
  cursor: string | null;
  contentType: string | null;
};

export type ListLinksResult = {
  links: Awaited<ReturnType<typeof prisma.link.findMany>>;
  nextCursor: string | null;
};

export async function listLinks(opts: ListLinksOptions): Promise<ListLinksResult> {
  const userId = await getCurrentUserId();
  return listLinksForUser(userId, opts);
}

/**
 * Pagination cursors are `<ISO createdAt>_<id>`: the id breaks ties between
 * links saved in the same millisecond. A bare ISO date (the previous format)
 * is still accepted.
 */
function formatLinksCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}_${id}`;
}

function parseLinksCursor(
  cursor: string | null,
): { createdAt: Date; id: string | null } | null {
  if (!cursor) return null;
  const sep = cursor.indexOf("_");
  const datePart = sep === -1 ? cursor : cursor.slice(0, sep);
  const id = sep === -1 ? null : cursor.slice(sep + 1) || null;
  const createdAt = new Date(datePart);
  if (isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

/** Lists links for an explicit user id. Used where the caller has already resolved the user (e.g. the MCP server via bearer token). */
export async function listLinksForUser(
  userId: string,
  opts: ListLinksOptions,
): Promise<ListLinksResult> {
  const { limit, cursor, contentType } = opts;

  type WhereInput = {
    userId: string;
    contentType?: ContentType;
    createdAt?: { lt: Date };
    OR?: ({ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } })[];
  };

  const where: WhereInput = { userId };

  if (contentType) {
    where.contentType = contentType as ContentType;
  }

  const position = parseLinksCursor(cursor);
  if (position?.id) {
    // Keyset on (createdAt, id): links sharing the boundary timestamp are
    // continued by id instead of being skipped.
    where.OR = [
      { createdAt: { lt: position.createdAt } },
      { createdAt: position.createdAt, id: { lt: position.id } },
    ];
  } else if (position) {
    // Legacy date-only cursor from older clients.
    where.createdAt = { lt: position.createdAt };
  }

  const rows = await prisma.link.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const links = hasMore ? rows.slice(0, limit) : rows;
  const last = links[links.length - 1];
  const nextCursor = hasMore ? formatLinksCursor(last.createdAt, last.id) : null;

  return { links, nextCursor };
}
