import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { LandingFooter } from "@/components/landing/landing-footer";
import { NotionBlocks, createRenderContext } from "@/components/notion-blocks";
import { Typography } from "@/components/typography";
import { getPageBySlug, getPublishedPages } from "@/lib/notion";
import { buildPageIdToPath } from "@/lib/notion-links";
import { STATIC_PAGES, type StaticPageSlug } from "@/lib/static-pages";
import { formatUpdatedDate } from "@/utils/formatter";

/**
 * Runs a Notion read. At build time (CI has no Notion env, and a failed read
 * shouldn't fail the build) it falls back; at runtime a failure throws, so a
 * failed revalidation keeps serving the last good page.
 */
async function readAtBuild<T>(
  read: () => Promise<T>,
  fallback: T,
  label: string,
): Promise<T> {
  return read().catch((error: unknown) => {
    if (process.env.NEXT_PHASE !== "phase-production-build") throw error;
    console.error(`${label}: could not read it from Notion`, error);
    return fallback;
  });
}

const readStaticPage = (slug: StaticPageSlug) =>
  readAtBuild(() => getPageBySlug(slug), null, `Static page "${slug}"`);

const MARK_LINK =
  "inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11";

export async function staticPageMetadata(
  slug: StaticPageSlug,
): Promise<Metadata> {
  const page = await readStaticPage(slug);
  if (!page) return {};
  const path = STATIC_PAGES.find((p) => p.slug === slug)!.path;
  const { title, description } = page;
  const text = description ? { description } : {};
  return {
    title,
    ...text,
    alternates: { canonical: path },
    openGraph: { title, ...text, url: path },
    twitter: { title, ...text },
  };
}

/** A Notion-backed page: Purl mark, title, description, Updated line, its Notion content and the footer. */
export async function StaticPage({ slug }: { slug: StaticPageSlug }) {
  const [page, published] = await Promise.all([
    readStaticPage(slug),
    readAtBuild(
      () => getPublishedPages(),
      [],
      `Static page "${slug}": published pages`,
    ),
  ]);
  // Missing, unpublished (state isn't "published"), or Notion not configured.
  if (!page) notFound();

  const context = createRenderContext(slug, buildPageIdToPath(published));

  return (
    <div className="wrapper-public flex w-full flex-1 flex-col px-4 md:px-6 lg:px-12">
      <header className="pt-12 sm:pt-16 md:px-[6%] md:pt-20">
        <Typography
          component="a"
          href="/"
          aria-label="Purl, home"
          className={MARK_LINK}
        >
          <BrandMark />
        </Typography>
      </header>
      <main className="flex w-full flex-1 flex-col md:px-[6%]">
        {/* The content is one centered 68ch column (on the landing demo's
            axis); text inside stays left-aligned. The mark and footer keep
            the landing layout. */}
        <div className="mx-auto w-full max-w-[68ch]">
          <Typography variant="h2" component="h1" className="mt-8 md:mt-10">
            {page.title}
          </Typography>
          {page.description ? (
            <Typography className="mt-3.5 text-lg text-pretty">
              {page.description}
            </Typography>
          ) : null}
          <Typography size="small" className="mt-4">
            <time dateTime={page.lastEditedAt}>
              Updated {formatUpdatedDate(page.lastEditedAt)}
            </time>
          </Typography>
          {page.blocks.length > 0 ? (
            <div className="mt-10">
              <NotionBlocks blocks={page.blocks} context={context} />
            </div>
          ) : null}
        </div>
      </main>
      <LandingFooter currentPath={STATIC_PAGES.find((p) => p.slug === slug)?.path} />
    </div>
  );
}
