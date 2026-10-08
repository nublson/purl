import "server-only";

import { DEFAULT_FOLDER_EMOJI } from "@/lib/folder-display";
import {
  DEMO_LINKS_PER_FOLDER,
  DEMO_USERNAME,
  type DemoData,
} from "@/lib/demo-links";
import prisma from "@/lib/prisma";
import {
  PUBLIC_FOLDER_SELECT,
  PUBLIC_LINK_SELECT,
  PUBLIC_OWNER_SELECT,
} from "@/lib/public-folders";

/**
 * The demo account's public folders (in its owner's order) with their newest links, for
 * the landing page. Current username only (no redirects). `null` when the
 * account is missing or shares nothing. Only public fields are returned.
 */
export async function getDemoFolders(
  username: string = DEMO_USERNAME,
): Promise<DemoData | null> {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, ...PUBLIC_OWNER_SELECT },
  });
  if (!user) return null;

  const folders = await prisma.folder.findMany({
    where: { userId: user.id, isPublic: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      ...PUBLIC_FOLDER_SELECT,
      links: {
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: DEMO_LINKS_PER_FOLDER,
        select: PUBLIC_LINK_SELECT,
      },
      _count: { select: { links: { where: { userId: user.id } } } },
    },
  });
  if (folders.length === 0) return null;

  return {
    owner: {
      name: user.name,
      image: user.image ?? null,
      username: user.username,
    },
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      slug: folder.slug,
      emoji: folder.emoji || DEFAULT_FOLDER_EMOJI,
      description: folder.description || null,
      linkCount: folder._count.links,
      links: folder.links.map((link) => ({
        id: link.id,
        url: link.url,
        title: link.title,
        description: link.description,
        thumbnail: link.thumbnail,
        domain: link.domain,
        favicon: link.favicon,
        contentType: link.contentType,
        createdAt: link.createdAt,
      })),
    })),
  };
}
