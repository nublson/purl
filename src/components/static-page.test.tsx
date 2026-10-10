import { beforeEach, describe, expect, it, vi } from "vitest";
import { block, renderToHtml, richText } from "@/components/notion-blocks/test-utils";

const getPageBySlug = vi.fn();
const getPublishedPages = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/notion", () => ({
  getPageBySlug: (...a: unknown[]) => getPageBySlug(...a),
  getPublishedPages: (...a: unknown[]) => getPublishedPages(...a),
}));
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import { StaticPage, staticPageMetadata } from "./static-page";

const PRIVACY_ID = "244b1726-8ab3-83c3-9388-87a7a5748b73";

function page(over: Record<string, unknown> = {}) {
  return {
    id: PRIVACY_ID,
    slug: "privacy",
    title: "Privacy Policy",
    description: "How we treat your data.",
    lastEditedAt: "2026-10-03T23:30:00.000Z",
    blocks: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPublishedPages.mockResolvedValue([
    { id: PRIVACY_ID, slug: "privacy" },
  ]);
});

describe("StaticPage", () => {
  it("renders the mark link, title, description, updated line and footer", async () => {
    getPageBySlug.mockResolvedValue(page());
    const html = await renderToHtml(await StaticPage({ slug: "privacy" }));
    expect(html).toContain("<header");
    expect(html).toMatch(/<a [^>]*href="\/" aria-label="Purl, home"/);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("How we treat your data.");
    expect(html).toContain('<time dateTime="2026-10-03T23:30:00.000Z"');
    expect(html).toContain("Updated ");
    expect(html).toContain("October 3, 2026");
    expect(html).toContain('aria-label="Footer"');
  });

  it("renders no body container for an empty page", async () => {
    getPageBySlug.mockResolvedValue(page());
    const html = await renderToHtml(await StaticPage({ slug: "privacy" }));
    expect(html).not.toContain("flex flex-col gap-4");
  });

  it("omits the description paragraph when missing", async () => {
    getPageBySlug.mockResolvedValue(page({ description: "" }));
    const html = await renderToHtml(await StaticPage({ slug: "privacy" }));
    expect(html).not.toContain("max-w-[60ch]");
  });

  it("resolves links to published static pages", async () => {
    getPageBySlug.mockResolvedValue(
      page({
        blocks: [
          block("paragraph", {
            rich_text: [
              richText("policy", {
                href: `https://www.notion.so/Privacy-${PRIVACY_ID.replace(/-/g, "")}`,
              }),
            ],
          }),
        ],
      }),
    );
    const html = await renderToHtml(await StaticPage({ slug: "privacy" }));
    expect(html).toContain('href="/privacy"');
  });

  it("calls notFound when the page is missing", async () => {
    getPageBySlug.mockResolvedValue(null);
    await expect(StaticPage({ slug: "privacy" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});

describe("staticPageMetadata", () => {
  it("returns title, description, canonical, openGraph and twitter", async () => {
    getPageBySlug.mockResolvedValue(page());
    expect(await staticPageMetadata("privacy")).toEqual({
      title: "Privacy Policy",
      description: "How we treat your data.",
      alternates: { canonical: "/privacy" },
      openGraph: { title: "Privacy Policy", description: "How we treat your data.", url: "/privacy" },
      twitter: { title: "Privacy Policy", description: "How we treat your data." },
    });
  });

  it("omits description keys when empty", async () => {
    getPageBySlug.mockResolvedValue(page({ description: "" }));
    expect(await staticPageMetadata("privacy")).toEqual({
      title: "Privacy Policy",
      alternates: { canonical: "/privacy" },
      openGraph: { title: "Privacy Policy", url: "/privacy" },
      twitter: { title: "Privacy Policy" },
    });
  });

  it("returns {} for a missing page", async () => {
    getPageBySlug.mockResolvedValue(null);
    expect(await staticPageMetadata("privacy")).toEqual({});
  });
});
