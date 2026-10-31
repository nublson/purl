import { buildBookmarksHtml, exportFileName } from "@/lib/export-links";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { NextResponse } from "next/server";

/**
 * Every link the user has, as a Netscape bookmarks file to download (what
 * browsers, Raindrop and Settings → Import read): folders in the user's
 * order, links newest first, uploads by their file URL. One query each
 * under the 1,000-link cap, so no paging. Rate-limited per IP in the proxy
 * (`links_export`).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [folders, links] = await Promise.all([
    prisma.folder.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, createdAt: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    prisma.link.findMany({
      where: { userId: user.id },
      select: {
        url: true,
        title: true,
        description: true,
        folderId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  return new NextResponse(buildBookmarksHtml({ folders, links }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName()}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
