import { FolderEmoji } from "@/components/folder-emoji";
import { Logo } from "@/components/logo";
import { SharedFolderList } from "@/components/shared-folder-list";
import {
  SharedFolderViewProvider,
  SharedFolderViewToggle,
} from "@/components/shared-folder-view";
import { Typography } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import {
  getPublicFolderPage,
  publicFolderPath,
} from "@/lib/public-folders";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

type Params = { username: string; slug: string };

/**
 * A shared folder: /@username/slug (see the rewrite in next.config.ts).
 * Read-only, never indexed. The app header's frame (logo, then the folder
 * where the switcher would be, view buttons on the right) and the owner's
 * rows in one list, newest first. Old usernames and slugs redirect to the
 * current URL.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { username, slug } = await params;
  const page = await getPublicFolderPage(username, slug, { limit: 1 });
  const robots = { index: false, follow: false };
  if (!page || page.kind !== "folder") return { robots };
  const title = `${page.folder.emoji} ${page.folder.name} · @${page.owner.username}`;
  return {
    title,
    description: page.folder.description ?? undefined,
    robots,
    openGraph: {
      title,
      description: page.folder.description ?? undefined,
      url: publicFolderPath(page.owner.username, page.folder.slug),
    },
  };
}

export default async function SharedFolderPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username, slug } = await params;
  const page = await getPublicFolderPage(username, slug);

  if (!page) notFound();
  if (page.kind === "redirect") {
    permanentRedirect(publicFolderPath(page.username, page.slug));
  }

  const { owner, folder } = page;

  return (
    <SharedFolderViewProvider>
      {/* The app header's frame (header.tsx), with the folder as a label
          where the switcher would be. */}
      <header className="fixed inset-x-0 top-0 z-50 transform-none">
        <div className="flex w-full items-center justify-between gap-2 bg-linear-to-b from-background to-transparent p-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="shrink-0">
              <Logo size={32} pathname="/" />
            </div>
            <Separator
              orientation="vertical"
              className="data-vertical:h-5 data-vertical:self-center"
            />
            {/* The switcher button's box (ghost, sm, ps-2), so the emoji and
                name sit where they do in the app. */}
            <div className="flex h-8 min-w-0 items-center gap-2 ps-2">
              <FolderEmoji emoji={folder.emoji} />
              <Typography
                component="h1"
                size="small"
                className="min-w-0 truncate text-foreground"
              >
                {folder.name}
              </Typography>
            </div>
          </div>
          <SharedFolderViewToggle />
        </div>
      </header>
      <SharedFolderList
        initialLinks={page.links}
        initialNextCursor={page.nextCursor}
        apiPath={`/api/public/folders/${owner.username}/${folder.slug}`}
      />
    </SharedFolderViewProvider>
  );
}
