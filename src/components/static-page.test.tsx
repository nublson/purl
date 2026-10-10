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

import { LandingFooter } from "@/components/landing/landing-footer";
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

  it("marks only the current page's footer link", async () => {
    getPageBySlug.mockResolvedValue(page());
    const html = await renderToHtml(await StaticPage({ slug: "privacy" }));
    const links = html.match(/<a [^>]*href="[^"]*"[^>]*>(Privacy|Terms|API|MCP|GitHub)<\/a>/g)!;
    expect(links.length).toBeGreaterThanOrEqual(4);
    const current = links.filter((l) => l.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/privacy"');
    expect(current[0]).toContain("text-foreground");
    expect(current[0]).toContain("font-medium");
    const others = links.filter((l) => !l.includes("aria-current"));
    for (const l of others) expect(l).not.toMatch(/ text-foreground| font-medium/);
  });

  it("marks no footer link on the landing page", async () => {
    const html = await renderToHtml(<LandingFooter />);
    expect(html).toContain('aria-label="Footer"');
    expect(html).not.toContain("aria-current");
  });

  it("renders no body container for an empty page", async () => {
    getPageBySlug.mockResolvedValue(page());
    const html = await renderToHtml(await StaticPage({ slug: "privacy" }));
    expect(html).not.toContain("flex flex-col gap-4");
  });

  it("renders an intro between the Updated line and the Notion content", async () => {
    getPageBySlug.mockResolvedValue(
      page({
        blocks: [
          block("paragraph", { rich_text: [richText("Body from Notion")] }),
        ],
      }),
    );
    const html = await renderToHtml(
      await StaticPage({ slug: "privacy", intro: <p>Intro from the page</p> }),
    );
    const updated = html.indexOf("Updated ");
    const intro = html.indexOf("Intro from the page");
    const body = html.indexOf("Body from Notion");
    expect(updated).toBeGreaterThan(-1);
    expect(intro).toBeGreaterThan(updated);
    expect(body).toBeGreaterThan(intro);
  });

  it("renders the Notion content with no intro by default", async () => {
    getPageBySlug.mockResolvedValue(
      page({
        blocks: [
          block("paragraph", { rich_text: [richText("Body from Notion")] }),
        ],
      }),
    );
    const html = await renderToHtml(await StaticPage({ slug: "privacy" }));
    expect(html).toContain("Body from Notion");
    expect(html).not.toContain("Intro from the page");
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
