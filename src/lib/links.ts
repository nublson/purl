import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { ContentType } from "@/generated/prisma/enums";
import { isAudioUrl } from "@/utils/audio";
import { getUrlDomain } from "@/utils/formatter";
import type { Link } from "@/utils/links";
import { isPdfUrl } from "@/utils/pdf";
import { isYouTubeUrl } from "@/utils/youtube";
import { headers } from "next/headers";
import ogs from "open-graph-scraper";

/** Thrown when link helpers are called without an authenticated user. */
export class UnauthorizedError extends Error {
  readonly name = "UnauthorizedError";
}

const FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";
const FAVICON_SIZE = "64";

/** Debug session 357177: local ingest + console for Vercel/runtime logs. */
function agentDebugLog357177(payload: {
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}) {
  const body = JSON.stringify({
    sessionId: "357177",
    timestamp: Date.now(),
    ...payload,
  });
  console.warn("[purl-debug-session-357177]", body);
  fetch("http://127.0.0.1:7934/ingest/3b140c39-9f39-4fe6-bb46-7844bf138e61", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "357177",
    },
    body,
  }).catch(() => {});
}

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function derivePdfTitleFromUrl(url: string, domain: string): string {
  try {
    const parsed = new URL(url);
    const fileName = parsed.pathname.split("/").pop() ?? "";
    const withoutPdf = decodeURIComponent(fileName).replace(/\.pdf$/i, "");
    const normalized = withoutPdf.replace(/[-_]+/g, " ").trim();
    return normalized || domain;
  } catch {
    return domain;
  }
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
    const headResponse = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
      },
      signal: AbortSignal.timeout(8000),
    });
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

function detectContentType(url: string): ContentType {
  if (isYouTubeUrl(url)) return "YOUTUBE";
  if (isPdfUrl(url)) return "PDF";
  if (isAudioUrl(url)) return "AUDIO";
  return "WEB";
}

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
  const defaultFavicon = `${FAVICON_BASE}${encodeURIComponent(domain)}&sz=${FAVICON_SIZE}`;
  if (isPdfUrl(url)) {
    const pdfMetadata = await scrapePdfMetadata(url, domain);
    return {
      title: pdfMetadata.title,
      description: pdfMetadata.description,
      favicon: defaultFavicon,
      thumbnail: pdfMetadata.thumbnail,
    };
  }

  try {
    // #region agent log
    agentDebugLog357177({
      runId: "pre-fix",
      hypothesisId: "H_env",
      location: "links.ts:scrapeLinkMetadata:pre-ogs",
      message: "OG scrape start",
      data: {
        urlHost: (() => {
          try {
            return new URL(url).hostname;
          } catch {
            return null;
          }
        })(),
        vercel: Boolean(process.env.VERCEL),
        nodeEnv: process.env.NODE_ENV ?? null,
      },
    });
    // #endregion

    const ogsOut = await ogs({
      url,
      fetchOptions: {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
        },
      },
    });

    const { error, result } = ogsOut;
    const responseObj = ogsOut.response as { status?: number } | undefined;
    const htmlPreview =
      typeof ogsOut.html === "string"
        ? ogsOut.html.slice(0, 120).replace(/\s+/g, " ")
        : null;

    // #region agent log
    agentDebugLog357177({
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "links.ts:scrapeLinkMetadata:ogs-resolved",
      message: "OGS returned",
      data: {
        ogsErrorFlag: error,
        hasResult: Boolean(result),
        responseStatus: responseObj?.status ?? null,
        htmlLength:
          typeof ogsOut.html === "string" ? ogsOut.html.length : null,
        htmlPreview,
        ogTitle: result?.ogTitle ?? null,
        successField: (result as { success?: boolean } | undefined)?.success,
      },
    });
    // #endregion

    if (error || !result) {
      // #region agent log
      agentDebugLog357177({
        runId: "pre-fix",
        hypothesisId: "H3",
        location: "links.ts:scrapeLinkMetadata:fallback-branch",
        message: "Using fallback (error or no result)",
        data: { ogsErrorFlag: error },
      });
      // #endregion
      return {
        title: domain,
        description: null,
        favicon: defaultFavicon,
        thumbnail: null,
      };
    }

    const title =
      (result.ogTitle ?? domain).replace(/\s+/g, " ").trim().slice(0, 500) ||
      domain;
    const description = result.ogDescription ?? null;
    const thumbnail = result.ogImage?.[0]?.url ?? null;
    const favicon = result.favicon
      ? new URL(result.favicon, url).href
      : defaultFavicon;

    return {
      title,
      description,
      favicon,
      thumbnail,
    };
  } catch (caught) {
    // #region agent log
    const fromOgs =
      caught &&
      typeof caught === "object" &&
      "result" in caught &&
      caught.result &&
      typeof caught.result === "object" &&
      "error" in caught.result;
    const ogsErrMsg = fromOgs
      ? String(
          (caught as { result: { error?: unknown } }).result.error ?? "",
        )
      : null;
    agentDebugLog357177({
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "links.ts:scrapeLinkMetadata:ogs-threw",
      message: "OGS threw or fetch failed",
      data: {
        fromOgsThrowShape: fromOgs,
        ogsLibraryError: ogsErrMsg,
        exceptionMessage:
          caught instanceof Error ? caught.message : String(caught),
        exceptionName: caught instanceof Error ? caught.name : typeof caught,
      },
    });
    // #endregion
    return {
      title: domain,
      description: null,
      favicon: defaultFavicon,
      thumbnail: null,
    };
  }
}

/** Resolves the current user id from request context. Throws UnauthorizedError if not authenticated. */
async function getCurrentUserId(): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

/** Fetches links for the currently authenticated user (server-only). */
export async function getLinksForCurrentUser(): Promise<Link[]> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const rows = await prisma.link.findMany({
    where: { userId: session?.user.id },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(mapRowToLink);
}

export type CreateLinkResult = Awaited<ReturnType<typeof prisma.link.create>>;

/** Creates a link for the current user after scraping metadata. If a link with the same URL already exists, updates its createdAt and returns it. Throws UnauthorizedError if not authenticated. */
export async function createLink(url: string): Promise<CreateLinkResult> {
  const userId = await getCurrentUserId();
  const existing = await prisma.link.findFirst({
    where: { userId, url },
  });
  if (existing) {
    return prisma.link.update({
      where: { id: existing.id },
      data: { createdAt: new Date() },
    });
  }

  const contentType = detectContentType(url);
  const domain = getUrlDomain(url);
  const { title, description, favicon, thumbnail } =
    await scrapeLinkMetadata(url);

  return prisma.link.create({
    data: {
      url,
      title,
      description,
      favicon,
      thumbnail,
      domain,
      contentType,
      userId,
    },
  });
}

/** Fetches a single link if it belongs to the current user; otherwise null. Throws UnauthorizedError if not authenticated. */
export async function readLink(id: string): Promise<Link | null> {
  const userId = await getCurrentUserId();
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
    const contentType = detectContentType(nextUrl);
    const domain = getUrlDomain(nextUrl);
    const { title, description, favicon, thumbnail } =
      await scrapeLinkMetadata(nextUrl);
    updatePayload = {
      url: nextUrl,
      domain,
      title,
      description,
      favicon,
      thumbnail,
      contentType,
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
