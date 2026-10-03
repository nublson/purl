import { Typography } from "@/components/typography";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getPublicFolderPage,
  publicFolderPath,
} from "@/lib/public-folders";
import { getRequestTimeZone } from "@/lib/time-zone";
import { formatDomain } from "@/utils/formatter";
import { groupLinksByDate } from "@/utils/links";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

type Params = { username: string; slug: string };

/**
 * A shared folder: /@username/slug (see the rewrite in next.config.ts).
 * Read-only, never indexed. A placeholder layout until the design lands:
 * header (owner), the folder, its links grouped by day, and a "Made with
 * Purl" footer. Old usernames and slugs redirect to the current URL.
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
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { username, slug } = await params;
  const { cursor } = await searchParams;
  const page = await getPublicFolderPage(username, slug, { cursor });

  if (!page) notFound();
  if (page.kind === "redirect") {
    permanentRedirect(publicFolderPath(page.username, page.slug));
  }

  const timeZone = await getRequestTimeZone();
  const groups = groupLinksByDate(
    page.links.map((link) => ({
      ...link,
      description: null,
      thumbnail: null,
      folderId: null,
    })),
    { timeZone },
  );
  const { owner, folder } = page;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-10">
      <header className="flex items-center gap-3">
        <Avatar className="size-8">
          {owner.image ? <AvatarImage src={owner.image} alt="" /> : null}
          <AvatarFallback>{owner.name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <Typography component="span" className="flex flex-col">
          <Typography component="span" size="small" className="font-medium text-foreground">
            {owner.name}
          </Typography>
          <Typography component="span" size="mini">
            @{owner.username}
          </Typography>
        </Typography>
      </header>

      <section className="flex flex-col gap-2">
        <Typography component="h1" variant="h1" className="flex items-center gap-2 text-2xl">
          <Typography component="span" aria-hidden className="text-2xl">
            {folder.emoji}
          </Typography>
          {folder.name}
        </Typography>
        {folder.description ? (
          <Typography component="p" size="small">
            {folder.description}
          </Typography>
        ) : null}
      </section>

      {groups.length === 0 ? (
        <Typography component="p" size="small">
          No links here yet.
        </Typography>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2">
              <Typography component="h2" size="mini" className="ms-2 font-medium">
                {group.label}
              </Typography>
              <ul className="flex flex-col">
                {group.links.map((link) => (
                  <Typography component="li" key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid h-12 grid-cols-[20px_1fr] items-center gap-4 rounded-md p-2 outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={link.favicon} alt="" className="size-5 rounded" />
                      <Typography component="span" className="flex min-w-0 items-baseline gap-2">
                        <Typography
                          component="span"
                          size="small"
                          className="min-w-0 truncate font-medium text-accent-foreground"
                        >
                          {link.title}
                        </Typography>
                        <Typography component="span" size="small" className="hidden shrink-0 md:block">
                          {formatDomain(link.domain)}
                        </Typography>
                      </Typography>
                    </a>
                  </Typography>
                ))}
              </ul>
            </section>
          ))}
          {page.nextCursor ? (
            <Link
              href={`${publicFolderPath(owner.username, folder.slug)}?cursor=${encodeURIComponent(page.nextCursor)}`}
              className="self-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Older links
            </Link>
          ) : null}
        </div>
      )}

      <footer className="border-t pt-6">
        <Typography component="p" size="mini">
          Made with{" "}
          <Link
            href="/"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Purl
          </Link>
        </Typography>
      </footer>
    </div>
  );
}
