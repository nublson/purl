import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Link } from "@/utils/links";
import { headers } from "next/headers";

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
