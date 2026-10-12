import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const client = {
    $queryRaw: vi.fn(),
    // The array form: every write was already started; settle them together.
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    link: { updateMany: vi.fn() },
  };
  return { default: client, prisma: client };
});

vi.mock("@/lib/links", () => ({ resolveLinkFromUrl: vi.fn() }));
vi.mock("@/lib/realtime-broadcast", () => ({ broadcastLinksChanged: vi.fn() }));

const prisma = (await import("@/lib/prisma")).default;
const { resolveLinkFromUrl } = await import("@/lib/links");
const { broadcastLinksChanged } = await import("@/lib/realtime-broadcast");
const {
  ENRICH_BATCH_SIZE,
  ENRICH_CONCURRENCY,
  ENRICH_LINK_TIMEOUT_MS,
  enrichedTitle,
  enrichFlaggedLinks,
} = await import("./enrich-links");

const queryRaw = vi.mocked(prisma.$queryRaw);
const transaction = vi.mocked(prisma.$transaction);
const updateMany = vi.mocked(prisma.link.updateMany);
const resolve = vi.mocked(resolveLinkFromUrl);
const broadcast = vi.mocked(broadcastLinksChanged);

type Claimed = {
  id: string;
  userId: string;
  url: string;
  title: string;
  domain: string;
};

function claimed(n: number, overrides: Partial<Claimed> = {}): Claimed {
  return {
    id: `link-${n}`,
    userId: "user-1",
    url: `https://example.com/${n}`,
    title: `Title ${n}`,
    domain: "example.com",
    ...overrides,
  };
}

/** A stored link, as the database holds it while the cron runs. */
type Row = {
  title: string;
  description: string | null;
  thumbnail: string | null;
  favicon: string;
  domain: string;
  contentType: string;
  createdAt: Date;
};

const CREATED_AT = new Date("2024-05-01T10:00:00.000Z");

/**
 * An in-memory `links` table behind `updateMany`: applies `data` to the rows
 * matching every field of `where` (a `null` matches only null), so the tests
 * check what ends up stored, not how the writes are phrased.
 */
let rows: Map<string, Row>;

function storeRow(id: string, row: Partial<Row> = {}) {
  rows.set(id, {
    title: "Imported",
    description: null,
    thumbnail: null,
    favicon: "https://example.com/default.ico",
    domain: "example.com",
    contentType: "WEB",
    createdAt: CREATED_AT,
    ...row,
  });
}

async function fakeUpdateMany(args: {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}) {
  const { id, ...guards } = args.where;
  const row = rows.get(id as string);
  if (
    !row ||
    Object.entries(guards).some(
      ([field, value]) => row[field as keyof Row] !== value,
    )
  ) {
    return { count: 0 };
  }
  Object.assign(row, args.data);
  return { count: 1 };
}

/** The ids written to, in order of their first write. */
function writtenIds(): string[] {
  return [
    ...new Set(updateMany.mock.calls.map((c) => c[0]!.where!.id as string)),
  ];
}

function resolved(url: string) {
  return {
    url,
    domain: "example.com",
    contentType: "WEB" as const,
    title: `Resolved ${url}`,
    description: `About ${url}`,
    favicon: "https://example.com/favicon.ico",
    thumbnail: "https://example.com/og.png",
  };
}

describe("enrichedTitle", () => {
  const url = "https://www.example.com/post";

  it("uses the resolved title when the stored one is empty", () => {
    expect(enrichedTitle("", url, "Resolved")).toBe("Resolved");
    expect(enrichedTitle("   ", url, "Resolved")).toBe("Resolved");
  });

  it("uses the resolved title when the stored one is the raw URL", () => {
    expect(enrichedTitle(url, url, "Resolved")).toBe("Resolved");
  });

  it("uses the resolved title when the stored one is the domain", () => {
    expect(enrichedTitle("example.com", url, "Resolved")).toBe("Resolved");
  });

  it("keeps a title the user chose", () => {
    expect(enrichedTitle("My notes", url, "Resolved")).toBe("My notes");
  });
});

describe("enrichFlaggedLinks", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rows = new Map();
    updateMany.mockImplementation(
      fakeUpdateMany as unknown as typeof prisma.link.updateMany,
    );
    resolve.mockImplementation(async (url: string) => resolved(url));
  });

  afterEach(() => {
    vi.useRealTimers();
    warn.mockRestore();
  });

  it("exports the batch constants", () => {
    expect(ENRICH_BATCH_SIZE).toBe(20);
    expect(ENRICH_CONCURRENCY).toBe(5);
    expect(ENRICH_LINK_TIMEOUT_MS).toBe(20_000);
  });

  it("claims with one atomic, skip-locked query, newest first", async () => {
    queryRaw.mockResolvedValue([]);
    await enrichFlaggedLinks();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const text = strings.join("?");
    expect(text).toMatch(/^\s*UPDATE "links" SET "needsMetadata" = false/);
    expect(text).toContain('ORDER BY "createdAt" DESC');
    expect(text).toContain("FOR UPDATE SKIP LOCKED");
    expect(text).toContain('RETURNING "id", "userId", "url", "title", "domain"');
    expect(text).toMatch(/LIMIT \?/);
    expect(values).toEqual([ENRICH_BATCH_SIZE]);
  });

  it("returns zeros with no lookups or broadcasts when nothing is flagged", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(enrichFlaggedLinks()).resolves.toEqual({
      claimed: 0,
      enriched: 0,
      failed: 0,
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("writes the resolved details by id without touching createdAt", async () => {
    queryRaw.mockResolvedValue([claimed(1, { title: "https://example.com/1" })]);
    storeRow("link-1", { title: "https://example.com/1" });

    await expect(enrichFlaggedLinks()).resolves.toEqual({
      claimed: 1,
      enriched: 1,
      failed: 0,
    });

    expect(resolve).toHaveBeenCalledWith("https://example.com/1");
    expect(rows.get("link-1")).toEqual({
      title: "Resolved https://example.com/1",
      description: "About https://example.com/1",
      thumbnail: "https://example.com/og.png",
      favicon: "https://example.com/favicon.ico",
      domain: "example.com",
      contentType: "WEB",
      createdAt: CREATED_AT,
    });
    expect(writtenIds()).toEqual(["link-1"]);
    for (const [arg] of updateMany.mock.calls) {
      expect(arg!.data).not.toHaveProperty("createdAt");
    }
    // One lookup's writes land together.
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("keeps an imported title the user chose", async () => {
    queryRaw.mockResolvedValue([claimed(1, { title: "Saved from my bar" })]);
    storeRow("link-1", { title: "Saved from my bar" });
    await enrichFlaggedLinks();
    expect(rows.get("link-1")!.title).toBe("Saved from my bar");
  });

  it("fills in a missing description and thumbnail", async () => {
    queryRaw.mockResolvedValue([claimed(1)]);
    storeRow("link-1", { title: "Title 1" });
    await enrichFlaggedLinks();
    expect(rows.get("link-1")).toMatchObject({
      description: "About https://example.com/1",
      thumbnail: "https://example.com/og.png",
    });
  });

  it("never overwrites what the user edited after the claim", async () => {
    // Claimed with a fallback title, then edited in the Edit link dialog
    // while the lookup ran.
    queryRaw.mockResolvedValue([claimed(1, { title: "example.com" })]);
    storeRow("link-1", {
      title: "My own title",
      description: "My own notes",
      thumbnail: "https://example.com/mine.png",
    });

    await expect(enrichFlaggedLinks()).resolves.toMatchObject({ enriched: 1 });

    expect(rows.get("link-1")).toEqual({
      title: "My own title",
      description: "My own notes",
      thumbnail: "https://example.com/mine.png",
      favicon: "https://example.com/favicon.ico",
      domain: "example.com",
      contentType: "WEB",
      createdAt: CREATED_AT,
    });
  });

  it("writes nothing for a link deleted while it was looked up", async () => {
    queryRaw.mockResolvedValue([claimed(1)]);
    await expect(enrichFlaggedLinks()).resolves.toMatchObject({
      enriched: 1,
      failed: 0,
    });
    expect(rows.size).toBe(0);
  });

  it("counts a rejected lookup as failed and still finishes the others", async () => {
    queryRaw.mockResolvedValue([claimed(1), claimed(2), claimed(3)]);
    resolve.mockImplementation(async (url: string) => {
      if (url.endsWith("/2")) throw new Error("boom");
      return resolved(url);
    });

    await expect(enrichFlaggedLinks()).resolves.toEqual({
      claimed: 3,
      enriched: 2,
      failed: 1,
    });
    expect(writtenIds()).toEqual(["link-1", "link-3"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("counts a lookup that exceeds the timeout as failed", async () => {
    vi.useFakeTimers();
    queryRaw.mockResolvedValue([claimed(1), claimed(2)]);
    resolve.mockImplementation((url: string) =>
      url.endsWith("/1")
        ? new Promise(() => {})
        : Promise.resolve(resolved(url)),
    );

    const run = enrichFlaggedLinks();
    await vi.advanceTimersByTimeAsync(ENRICH_LINK_TIMEOUT_MS);

    await expect(run).resolves.toEqual({ claimed: 2, enriched: 1, failed: 1 });
    expect(writtenIds()).toEqual(["link-2"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timeout once a lookup settles", async () => {
    vi.useFakeTimers();
    queryRaw.mockResolvedValue([claimed(1), claimed(2)]);
    await enrichFlaggedLinks();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never has more than ENRICH_CONCURRENCY lookups in flight", async () => {
    queryRaw.mockResolvedValue(
      Array.from({ length: ENRICH_BATCH_SIZE }, (_, i) => claimed(i)),
    );
    let inFlight = 0;
    let peak = 0;
    resolve.mockImplementation(async (url: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return resolved(url);
    });

    await expect(enrichFlaggedLinks()).resolves.toEqual({
      claimed: ENRICH_BATCH_SIZE,
      enriched: ENRICH_BATCH_SIZE,
      failed: 0,
    });
    expect(resolve).toHaveBeenCalledTimes(ENRICH_BATCH_SIZE);
    expect(peak).toBe(ENRICH_CONCURRENCY);
  });

  it("broadcasts once per distinct user with an enriched link", async () => {
    queryRaw.mockResolvedValue([
      claimed(1, { userId: "a" }),
      claimed(2, { userId: "a" }),
      claimed(3, { userId: "b" }),
      claimed(4, { userId: "c" }),
    ]);
    resolve.mockImplementation(async (url: string) => {
      if (url.endsWith("/4")) throw new Error("down");
      return resolved(url);
    });

    await enrichFlaggedLinks();

    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(broadcast.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "b"]);
  });
});
