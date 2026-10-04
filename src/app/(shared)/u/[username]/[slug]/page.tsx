import { FolderEmoji } from "@/components/folder-emoji";
import { Logo } from "@/components/logo";
import { SharedFolderList } from "@/components/shared-folder-list";
import {
  SharedFolderViewProvider,
  SharedFolderViewToggle,
} from "@/components/shared-folder-view";
import { Typography } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import { SharedFolderSkeleton } from "@/components/skeletons/shared-folder";
import {
  listPublicFolderLinks,
  publicFolderPath,
  resolvePublicFolder,
  type PublicOwner,
} from "@/lib/public-folders";
import {
  parseSharedFolderView,
  SHARED_FOLDER_VIEW_COOKIE,
} from "@/lib/shared-folder-view";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache, Suspense } from "react";

type Params = { username: string; slug: string };

/** One lookup per request, shared by the metadata and the page. */
const resolveForRequest = cache(resolvePublicFolder);

/**
 * A shared folder: /@username/slug (see the rewrite in next.config.ts).
 * Read-only, never indexed. The app header's frame (logo, then the folder
 * where the switcher would be, view buttons on the right) and the owner's
 * rows in one list, newest first. Old usernames and slugs redirect to the
 * current URL.
 *
 * The folder is resolved before anything streams, so a private or missing
 * folder answers a real 404 and a renamed one a real 308. Only the links
 * load behind a skeleton (no route-level loading.tsx: that would send 200
 * before notFound() runs).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { username, slug } = await params;
  const page = await resolveForRequest(username, slug);
  const robots = { index: false, follow: false };
  if (!page || page.kind !== "folder") return { robots };
  // "🎨 Design by @nublson · Purl": the app's "%s · Purl" template adds
  // the suffix to the tab title; link previews get it spelled out.
  const title = `${page.folder.emoji} ${page.folder.name} by @${page.owner.username}`;
  return {
    title,
    description: page.folder.description ?? undefined,
    robots,
    openGraph: {
      title: `${title} · Purl`,
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
  const page = await resolveForRequest(username, slug);

  if (!page) notFound();
  if (page.kind === "redirect") {
    permanentRedirect(publicFolderPath(page.username, page.slug));
  }

  const { owner, folder } = page;
  const initialView = parseSharedFolderView(
    (await cookies()).get(SHARED_FOLDER_VIEW_COOKIE)?.value,
  );

  return (
    <SharedFolderViewProvider initialView={initialView}>
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
      <Suspense fallback={<SharedFolderSkeleton view={initialView} />}>
        <SharedFolderLinks
          ids={page.ids}
          apiPath={`/api/public/folders/${owner.username}/${folder.slug}`}
          description={folder.description}
          owner={owner}
        />
      </Suspense>
    </SharedFolderViewProvider>
  );
}

/** The first page of links, streamed in behind the skeleton. */
async function SharedFolderLinks({
  ids,
  ...rest
}: {
  ids: { userId: string; folderId: string };
  apiPath: string;
  description: string | null;
  owner: PublicOwner;
}) {
  const { links, nextCursor } = await listPublicFolderLinks(ids);
  return (
    <SharedFolderList
      initialLinks={links}
      initialNextCursor={nextCursor}
      {...rest}
    />
  );
}
