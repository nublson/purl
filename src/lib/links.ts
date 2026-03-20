import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Link } from "@/utils/links";
import { getUrlDomain } from "@/utils/formatter";
import { isYouTubeUrl } from "@/utils/youtube";
import { headers } from "next/headers";
import ogs from "open-graph-scraper";

/** Thrown when link helpers are called without an authenticated user. */
export class UnauthorizedError extends Error {
  readonly name = "UnauthorizedError";
}

const FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";
const FAVICON_SIZE = "64";

type LinkRow = {
  id: string;
  url: string;
  title: string;
  favicon: string;
  domain: string;
  contentType: "WEB" | "YOUTUBE";
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
  const defaultFavicon = `${FAVICON_BASE}${encodeURIComponent(domain)}&sz=${FAVICON_SIZE}`;

  try {
    const { error, result } = await ogs({
      url,
      fetchOptions: {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
        },
      },
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
  } catch {
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

  const contentType = isYouTubeUrl(url) ? "YOUTUBE" : "WEB";
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
    const contentType = isYouTubeUrl(nextUrl) ? "YOUTUBE" : "WEB";
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
