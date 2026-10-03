import "server-only";

import type { ContentType } from "@/generated/prisma/enums";
import { DEFAULT_FOLDER_EMOJI } from "@/lib/folder-display";
import { listLinksForUser } from "@/lib/links";
import prisma from "@/lib/prisma";
import { publicFolderPath } from "@/lib/public-folder-path";

/** Links per page on a shared folder (first render and each "load more"). */
export const PUBLIC_FOLDER_PAGE_SIZE = 50;

/** A link as visitors see it: what the list and its hover preview show. */
export type PublicLink = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  domain: string;
  favicon: string;
  contentType: ContentType;
  createdAt: Date;
};

/** The person sharing: what the page header shows. */
export type PublicOwner = {
  name: string;
  image: string | null;
  username: string;
};

export type PublicFolder = {
  name: string;
  slug: string;
  emoji: string;
  description: string | null;
};

export type PublicFolderPage =
  | {
      kind: "folder";
      owner: PublicOwner;
      folder: PublicFolder;
      links: PublicLink[];
      nextCursor: string | null;
    }
  /** An old username or slug: send visitors to the current URL. */
  | { kind: "redirect"; username: string; slug: string };

export { publicFolderPath };

/**
 * A public folder's page for visitors: its owner, the folder and one page
 * of links (newest first, `cursor` from the previous page). An old
 * username or slug (renamed since it was shared) gives `kind: "redirect"`
 * with the current ones; a live username or slug always wins over an old
 * one. `null` when there's no such folder or it isn't public: a private
 * folder looks exactly like a missing one.
 */
export async function getPublicFolderPage(
  username: string,
  slug: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<PublicFolderPage | null> {
  const wantedUsername = username.toLowerCase();
  const wantedSlug = slug.toLowerCase();
  const limit = Math.min(
    Math.max(Math.trunc(opts.limit ?? PUBLIC_FOLDER_PAGE_SIZE), 1),
    PUBLIC_FOLDER_PAGE_SIZE * 2,
  );

  let redirected = false;
  let user = await prisma.user.findUnique({
    where: { username: wantedUsername },
    select: { id: true, name: true, image: true, username: true },
  });
  if (!user) {
    const old = await prisma.usernameRedirect.findUnique({
      where: { username: wantedUsername },
      select: {
        user: { select: { id: true, name: true, image: true, username: true } },
      },
    });
    if (!old) return null;
    user = old.user;
    redirected = true;
  }

  const folderSelect = {
    id: true,
    name: true,
    slug: true,
    emoji: true,
    description: true,
    isPublic: true,
  } as const;
  let folder = await prisma.folder.findFirst({
    where: { userId: user.id, slug: wantedSlug },
    select: folderSelect,
  });
  if (!folder) {
    const old = await prisma.folderSlugRedirect.findUnique({
      where: { userId_slug: { userId: user.id, slug: wantedSlug } },
      select: { folder: { select: folderSelect } },
    });
    folder = old?.folder ?? null;
    if (folder) redirected = true;
  }
  if (!folder || !folder.isPublic) return null;

  if (redirected) {
    return { kind: "redirect", username: user.username, slug: folder.slug };
  }

  const { links, nextCursor } = await listLinksForUser(user.id, {
    limit,
    cursor: opts.cursor ?? null,
    contentType: null,
    folderId: folder.id,
  });

  return {
    kind: "folder",
    owner: { name: user.name, image: user.image ?? null, username: user.username },
    folder: {
      name: folder.name,
      slug: folder.slug,
      emoji: folder.emoji || DEFAULT_FOLDER_EMOJI,
      description: folder.description || null,
    },
    links: links.map((link) => ({
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
    nextCursor,
  };
}
