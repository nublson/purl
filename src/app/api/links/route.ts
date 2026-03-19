import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getUrlDomain } from "@/utils/formatter";
import { isValidUrl } from "@/utils/url";
import { NextRequest, NextResponse } from "next/server";

const FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";
const FAVICON_SIZE = "64";

async function scrapeTitleAndFavicon(url: string): Promise<{
  title: string;
  favicon: string;
}> {
  const domain = getUrlDomain(url);
  const faviconUrl = `${FAVICON_BASE}${encodeURIComponent(domain)}&sz=${FAVICON_SIZE}`;

  let title = domain;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Purl/1.0; +https://github.com/nublson/purl)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { title: domain, favicon: faviconUrl };
    const html = await res.text();
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (match?.[1]) {
      title = match[1].replace(/\s+/g, " ").trim().slice(0, 500) || domain;
    }
  } catch {
    // keep defaults
  }
  return { title, favicon: faviconUrl };
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
  const { title, favicon } = await scrapeTitleAndFavicon(url);

  const link = await prisma.link.create({
    data: {
      url,
      title,
      favicon,
      domain,
      userId: session.user.id,
    },
  });

  return NextResponse.json(
    {
      id: link.id,
      url: link.url,
      title: link.title,
      favicon: link.favicon,
      domain: link.domain,
      createdAt: link.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
