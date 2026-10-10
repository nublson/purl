import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Typography } from "@/components/typography";
import { getPageBySlug, type NotionPage } from "@/lib/notion";
import type { StaticPageSlug } from "@/lib/static-pages";

/**
 * Reads a static page from Notion. At build time (CI has no Notion env, and a
 * failed read shouldn't fail the build) it's treated as missing; at runtime a
 * failure throws, so a failed revalidation keeps serving the last good page.
 */
async function readStaticPage(slug: StaticPageSlug): Promise<NotionPage | null> {
  return getPageBySlug(slug).catch((error: unknown) => {
    if (process.env.NEXT_PHASE !== "phase-production-build") throw error;
    console.error(`Static page "${slug}": could not read it from Notion`, error);
    return null;
  });
}

export async function staticPageMetadata(
  slug: StaticPageSlug,
): Promise<Metadata> {
  const page = await readStaticPage(slug);
  if (!page) return {};
  return {
    title: page.title,
    ...(page.description ? { description: page.description } : {}),
  };
}

/** A Notion-backed page: its title for now; the body comes next. */
export async function StaticPage({ slug }: { slug: StaticPageSlug }) {
  const page = await readStaticPage(slug);
  // Missing, unpublished (state isn't "published"), or Notion not configured.
  if (!page) notFound();

  return (
    <div className="wrapper-public flex w-full flex-1 flex-col px-4 md:px-6 lg:px-12">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col py-16 md:py-24">
        <Typography variant="h2" component="h1">
          {page.title}
        </Typography>
      </main>
    </div>
  );
}
