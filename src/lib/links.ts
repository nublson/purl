import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Link } from "@/utils/links";
import { getUrlDomain } from "@/utils/formatter";
import { headers } from "next/headers";
import ogs from "open-graph-scraper";

const FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";
const FAVICON_SIZE = "64";

type LinkRow = {
  id: string;
  url: string;
  title: string;
  favicon: string;
  domain: string;
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

/** Creates a link for the user after scraping metadata. If a link with the same URL already exists for the user, updates its createdAt and returns it. */
export async function createLink(
  userId: string,
  url: string,
): Promise<CreateLinkResult> {
  const existing = await prisma.link.findFirst({
    where: { userId, url },
  });
  if (existing) {
    return prisma.link.update({
      where: { id: existing.id },
      data: { createdAt: new Date() },
    });
  }

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
      userId,
    },
  });
}

/** Fetches a single link if it belongs to the user; otherwise null. */
export async function readLink(
  id: string,
  userId: string,
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

/** Updates a link if it belongs to the user. Re-scrapes metadata if url changes. Returns null if not found or not owned. */
export async function updateLink(
  id: string,
  userId: string,
  data: UpdateLinkData,
): Promise<UpdateLinkResult | null> {
  const existing = await prisma.link.findFirst({
    where: { id, userId },
  });
  if (!existing) return null;

  const nextUrl = data.url?.trim();
  const urlChanged =
    typeof nextUrl === "string" && nextUrl.length > 0 && nextUrl !== existing.url;

  let updatePayload: Parameters<typeof prisma.link.update>[0]["data"] = {};

  if (urlChanged && nextUrl) {
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
    };
  } else {
    if (typeof data.title === "string") updatePayload.title = data.title;
    if (data.description !== undefined) updatePayload.description = data.description;
  }

  if (Object.keys(updatePayload).length === 0) return existing;

  return prisma.link.update({
    where: { id },
    data: updatePayload,
  });
}

/** Deletes a link if it belongs to the user. Returns true if deleted, false if not found or not owned. */
export async function deleteLink(
  id: string,
  userId: string,
): Promise<boolean> {
  const existing = await prisma.link.findFirst({
    where: { id, userId },
  });
  if (!existing) return false;
  await prisma.link.delete({ where: { id } });
  return true;
}
