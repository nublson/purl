import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The bulk endpoints behind the selection bar, against the real database:
// one request moves or deletes many links, and never touches another
// user's (unknown) ids.

async function folderLinkTitles(page: Page, folderId: string) {
  const response = await page.request.get(`/api/links?folderId=${folderId}`);
  expect(response.status()).toBe(200);
  const { groups } = (await response.json()) as {
    groups: { links: { title: string }[] }[];
  };
  return groups.flatMap((group) => group.links.map((link) => link.title)).sort();
}

test.describe("Bulk link actions", () => {
  test("moves links into a folder and back out, reporting where they came from", async ({
    page,
    seed,
  }) => {
    const reading = await seed.folder({ name: "Reading", slug: "reading" });
    const work = await seed.folder({ name: "Work", slug: "work" });
    const a = await seed.link({ url: "https://a.example", title: "A" });
    const b = await seed.link({ url: "https://b.example", title: "B", folderId: work });
    await seed.link({ url: "https://c.example", title: "C" });

    const move = await page.request.patch("/api/links/bulk", {
      data: { ids: [a, b, "not-a-link"], folderId: reading },
    });
    expect(move.status()).toBe(200);
    expect(await move.json()).toEqual({
      moved: expect.arrayContaining([
        { id: a, previousFolderId: null },
        { id: b, previousFolderId: work },
      ]),
      notFound: ["not-a-link"],
    });
    expect(await folderLinkTitles(page, reading)).toEqual(["A", "B"]);
    expect(await folderLinkTitles(page, work)).toEqual([]);

    const out = await page.request.patch("/api/links/bulk", {
      data: { ids: [a, b], folderId: null },
    });
    expect(out.status()).toBe(200);
    expect(await folderLinkTitles(page, reading)).toEqual([]);
  });

  test("deletes many links in one request", async ({ page, seed }) => {
    const a = await seed.link({ url: "https://a.example", title: "A" });
    const b = await seed.link({ url: "https://b.example", title: "B" });
    await seed.link({ url: "https://c.example", title: "C" });

    const response = await page.request.delete("/api/links/bulk", {
      data: { ids: [a, b] },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ deleted: 2 });

    const list = await page.request.get("/api/links");
    const { total } = (await list.json()) as { total: number };
    expect(total).toBe(1);
  });

  test("rejects an unknown folder without moving anything", async ({ page, seed }) => {
    const a = await seed.link({ url: "https://a.example", title: "A" });
    const response = await page.request.patch("/api/links/bulk", {
      data: { ids: [a], folderId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(response.status()).toBe(404);
  });
});
