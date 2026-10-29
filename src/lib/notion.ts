import "server-only";

import {
  Client,
  collectPaginatedAPI,
  isFullBlock,
  isFullPage,
  type PageObjectResponse,
} from "@notionhq/client";
import { unstable_cache } from "next/cache";
import type { NotionBlock } from "notionic";
import { fetchBlocks } from "notionic/fetch";
import { cache } from "react";

/**
 * Notion as the CMS for Purl's static pages (Privacy, Terms, API, MCP…).
 *
 * Each page is a row of one Notion database, `NOTION_PAGES_DATA_SOURCE_ID`:
 * - `Name` (title): the page's title
 * - `slug` (text): its URL segment, e.g. `privacy`
 * - `description` (text, optional): the meta description
 * - `state` (select: planned, writing, published): only `published` rows show
 * The row's body is the page's content, fetched and rendered by notionic.
 *
 * Reads are cached under {@link NOTION_CACHE_TAG} for an hour, and
 * `POST /api/notion/revalidate` (the integration's webhook subscription)
 * expires them on edit.
 * Without `NOTION_ACCESS_TOKEN` / `NOTION_PAGES_DATA_SOURCE_ID` (local dev,
 * PR previews) every read returns nothing, so pages 404 instead of failing.
 */

export const NOTION_CACHE_TAG = "notion";

/** Seconds a cached read lives without a webhook (fallback for missed ones). */
const NOTION_REVALIDATE_SECONDS = 3600;

export const PUBLISHED_STATE = "published";

export type { NotionBlock };

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
    // Lowercased like the lookup, so a row typed `Privacy` still serves /privacy.
    slug: plainText(page.properties.slug).trim().toLowerCase(),
    title: plainText(page.properties.Name).trim(),
    description: plainText(page.properties.description).trim(),
    lastEditedAt: page.last_edited_time,
  };
}

async function queryPublishedPages(
  config: NotionConfig,
): Promise<PageObjectResponse[]> {
  const rows = await collectPaginatedAPI(
    getClient(config.token).dataSources.query,
    {
      data_source_id: config.dataSourceId,
      filter: { property: "state", select: { equals: PUBLISHED_STATE } },
      sorts: [{ property: "Name", direction: "ascending" }],
    },
  );
  return rows.filter(isFullPage);
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
    // Matched here rather than with a Notion `rich_text equals` filter, which
    // is case-sensitive; there are only a handful of pages.
    const page = (await queryPublishedPages(config)).find(
      (row) => toPageSummary(row).slug === slug,
    );
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

function findBlock(
  blocks: readonly NotionBlock[] | undefined,
  id: string,
): NotionBlock | null {
  for (const block of blocks ?? []) {
    if (block.id.replace(/-/g, "") === id) return block;
    const nested = findBlock(block.children, id);
    if (nested) return nested;
  }
  return null;
}

type HostedFileObject = { url: string; expiry_time: string };

/** The file uploaded to a block: an image, video, file, PDF or audio, or a callout's icon. */
function hostedFile(block: unknown): HostedFileObject | null {
  const { type } = block as { type: string };
  const data = (block as Record<string, unknown>)[type] as
    | { type?: string; file?: HostedFileObject; icon?: { type?: string; file?: HostedFileObject } }
    | undefined;
  if (data?.type === "file" && data.file) return data.file;
  if (data?.icon?.type === "file" && data.icon.file) return data.icon.file;
  return null;
}

/**
 * A fresh signed URL for a file uploaded to Notion (they expire after an hour),
 * with its expiry, for `/api/notion/file/[blockId]`. Only blocks on published
 * pages answer, so drafts' files stay private; null otherwise.
 */
export async function getPublishedFile(
  blockId: string,
): Promise<{ url: string; expiresAt: Date } | null> {
  const config = getNotionConfig();
  const id = blockId.replace(/-/g, "").toLowerCase();
  if (!config || !/^[0-9a-f]{32}$/.test(id)) return null;

  const pages = await getPublishedPages();
  let published = false;
  for (const summary of pages) {
    const page = await getPageBySlug(summary.slug);
    if (findBlock(page?.blocks, id)) {
      published = true;
      break;
    }
  }
  if (!published) return null;

  const block = await getClient(config.token).blocks.retrieve({ block_id: id });
  const file = isFullBlock(block) ? hostedFile(block) : null;
  return file ? { url: file.url, expiresAt: new Date(file.expiry_time) } : null;
}
