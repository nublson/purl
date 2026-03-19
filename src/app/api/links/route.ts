import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getUrlDomain } from "@/utils/formatter";
import { isValidUrl } from "@/utils/url";
import { NextRequest, NextResponse } from "next/server";
import ogs from "open-graph-scraper";

const FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";
const FAVICON_SIZE = "64";

async function scrapeLinkMetadata(url: string): Promise<{
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

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || !isValidUrl(url)) {
    return NextResponse.json(
      { error: "Invalid or missing URL" },
      { status: 400 },
    );
  }

  const domain = getUrlDomain(url);
  const { title, description, favicon, thumbnail } =
    await scrapeLinkMetadata(url);

  const link = await prisma.link.create({
    data: {
      url,
      title,
      description,
      favicon,
      thumbnail,
      domain,
      userId: session.user.id,
    },
  });

  return NextResponse.json(
    {
      id: link.id,
      url: link.url,
      title: link.title,
      description: link.description,
      favicon: link.favicon,
      thumbnail: link.thumbnail,
      domain: link.domain,
      createdAt: link.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
