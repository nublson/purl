import "server-only";

import {
  type BlockObjectResponse,
  Client,
  collectPaginatedAPI,
  isFullBlock,
  isFullPage,
  type PageObjectResponse,
} from "@notionhq/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";

/**
 * Notion as the CMS for Purl's static pages (Privacy, Terms, API, MCP…).
 *
 * Each page is a row of one Notion database, `NOTION_PAGES_DATA_SOURCE_ID`:
 * - `Name` (title): the page's title
 * - `slug` (text): its URL segment, e.g. `privacy`
 * - `description` (text, optional): the meta description
 * - `state` (select: planned, writing, published): only `published` rows show
 * The row's body is the page's content.
 *
 * Reads are cached under {@link NOTION_CACHE_TAG} for an hour, and
 * `POST /api/notion/revalidate` (a Notion automation) expires them on edit.
 * Without `NOTION_ACCESS_TOKEN` / `NOTION_PAGES_DATA_SOURCE_ID` (local dev,
 * PR previews) every read returns nothing, so pages 404 instead of failing.
 */

export const NOTION_CACHE_TAG = "notion";

/** Seconds a cached read lives without a webhook (fallback for missed ones). */
const NOTION_REVALIDATE_SECONDS = 3600;

export const PUBLISHED_STATE = "published";

/** Max nesting depth when resolving block children (avoids huge trees). */
const MAX_BLOCK_DEPTH = 5;

/** Max concurrent child-block fetches per level (Notion allows ~3 req/s on average). */
const BLOCK_FETCH_CONCURRENCY = 5;

export type NotionBlock = BlockObjectResponse & { children?: NotionBlock[] };

export type NotionPageSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** ISO timestamp of the row's last edit (sitemaps, "Last updated"). */
  lastEditedAt: string;
};

export type NotionPage = NotionPageSummary & { blocks: NotionBlock[] };

type NotionConfig = { token: string; dataSourceId: string };

function getNotionConfig(): NotionConfig | null {
  const token = process.env.NOTION_ACCESS_TOKEN?.trim();
  const dataSourceId = process.env.NOTION_PAGES_DATA_SOURCE_ID?.trim();
  if (!token || !dataSourceId) return null;
  return { token, dataSourceId };
}

export function isNotionConfigured(): boolean {
  return getNotionConfig() !== null;
}

let client: { token: string; api: Client } | null = null;

function getClient(token: string): Client {
  if (client?.token !== token) {
    client = { token, api: new Client({ auth: token }) };
  }
  return client.api;
}

function plainText(
  property: PageObjectResponse["properties"][string] | undefined,
): string {
  if (property?.type === "title") {
    return property.title.map((t) => t.plain_text).join("");
  }
  if (property?.type === "rich_text") {
    return property.rich_text.map((t) => t.plain_text).join("");
  }
  return "";
}

export function toPageSummary(page: PageObjectResponse): NotionPageSummary {
  return {
    id: page.id,
    slug: plainText(page.properties.slug).trim(),
    title: plainText(page.properties.Name).trim(),
    description: plainText(page.properties.description).trim(),
    lastEditedAt: page.last_edited_time,
  };
}

async function queryPublishedPages(
  config: NotionConfig,
  slug?: string,
): Promise<PageObjectResponse[]> {
  const published = {
    property: "state",
    select: { equals: PUBLISHED_STATE },
  };
  const rows = await collectPaginatedAPI(
    getClient(config.token).dataSources.query,
    {
      data_source_id: config.dataSourceId,
      filter: slug
        ? {
            and: [published, { property: "slug", rich_text: { equals: slug } }],
          }
        : published,
      sorts: [{ property: "Name", direction: "ascending" }],
    },
  );
  return rows.filter(isFullPage);
}

/** Maps items with at most `limit` mapper calls in flight. */
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await mapper(items[i]!);
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

export async function fetchBlocks(
  api: Client,
  blockId: string,
  depth = MAX_BLOCK_DEPTH,
): Promise<NotionBlock[]> {
  const blocks = (
    await collectPaginatedAPI(api.blocks.children.list, { block_id: blockId })
  ).filter(isFullBlock);

  return mapPool(blocks, BLOCK_FETCH_CONCURRENCY, async (block) => {
    // Child pages and databases are separate documents, not this page's body.
    if (
      !block.has_children ||
      depth <= 0 ||
      block.type === "child_page" ||
      block.type === "child_database"
    ) {
      return block;
    }
    return { ...block, children: await fetchBlocks(api, block.id, depth - 1) };
  });
}

const getPublishedPagesCached = unstable_cache(
  async (): Promise<NotionPageSummary[]> => {
    const config = getNotionConfig();
    if (!config) return [];
    const pages = await queryPublishedPages(config);
    return pages.map(toPageSummary).filter((page) => page.slug);
  },
  ["notion-published-pages"],
  { tags: [NOTION_CACHE_TAG], revalidate: NOTION_REVALIDATE_SECONDS },
);

const getPageBySlugCached = unstable_cache(
  async (slug: string): Promise<NotionPage | null> => {
    const config = getNotionConfig();
    if (!config) return null;
    const [page] = await queryPublishedPages(config, slug);
    if (!page) return null;
    return {
      ...toPageSummary(page),
      blocks: await fetchBlocks(getClient(config.token), page.id),
    };
  },
  ["notion-page-by-slug"],
  { tags: [NOTION_CACHE_TAG], revalidate: NOTION_REVALIDATE_SECONDS },
);

/** Every published page (title, slug…; no content), A–Z by title. */
export const getPublishedPages = cache(getPublishedPagesCached);

/** One published page with its content, or null when missing or unpublished. */
export const getPageBySlug = cache(
  async (slug: string): Promise<NotionPage | null> => {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return null;
    return getPageBySlugCached(normalized);
  },
);
