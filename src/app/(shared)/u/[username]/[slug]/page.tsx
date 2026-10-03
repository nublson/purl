import { FolderEmoji } from "@/components/folder-emoji";
import { Logo } from "@/components/logo";
import { SharedFolderList } from "@/components/shared-folder-list";
import { Typography } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import {
  getPublicFolderPage,
  publicFolderPath,
} from "@/lib/public-folders";
import { getRequestTimeZone } from "@/lib/time-zone";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

type Params = { username: string; slug: string };

/**
 * A shared folder: /@username/slug (see the rewrite in next.config.ts).
 * Read-only, never indexed. Looks exactly like the owner's folder page: the
 * app header (logo, then the folder where the switcher would be) and the
 * same list. Old usernames and slugs redirect to the current URL.
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

  const timeZone = await getRequestTimeZone();
  const { owner, folder } = page;

  return (
    <>
      {/* The app header's frame (header.tsx), with the folder as a label
          where the switcher would be. */}
      <header className="fixed inset-x-0 top-0 z-50 transform-none">
        <div className="flex w-full items-center gap-2 bg-linear-to-b from-background to-transparent p-4">
          <div className="shrink-0">
            <Logo size={32} pathname="/" />
          </div>
          <Separator
            orientation="vertical"
            className="data-vertical:h-5 data-vertical:self-center"
          />
          {/* Where the app's folder switcher sits (its ghost button's ps-2),
              so the emoji lines up with the app. The name and description
              stack in two lines that fill the logo's 32px: the name leads,
              the description reads as its subtitle. */}
          <div className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2 ps-2">
            <FolderEmoji emoji={folder.emoji} />
            <Typography
              component="h1"
              size="small"
              className="truncate leading-[18px] font-medium text-foreground"
            >
              {folder.name}
            </Typography>
            {folder.description ? (
              <Typography
                component="p"
                size="mini"
                className="col-start-2 truncate leading-[14px]"
              >
                {folder.description}
              </Typography>
            ) : null}
          </div>
        </div>
      </header>
      <div className="wrapper-private flex flex-1 flex-col gap-8 pt-24 pb-12">
        <SharedFolderList
          initialLinks={page.links}
          initialNextCursor={page.nextCursor}
          timeZone={timeZone}
          apiPath={`/api/public/folders/${owner.username}/${folder.slug}`}
        />
      </div>
    </>
  );
}
