import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockListChildren = vi.fn();
const mockRetrieveBlock = vi.fn();

vi.mock("@notionhq/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@notionhq/client")>();
  return {
    ...actual,
    Client: vi.fn(function Client() {
      return {
        dataSources: { query: mockQuery },
        blocks: {
          children: { list: mockListChildren },
          retrieve: mockRetrieveBlock,
        },
      };
    }),
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
}));

const { getPageBySlug, getPublishedFile, getPublishedPages, isNotionConfigured } = await import(
  "./notion"
);

function richText(text: string) {
  return [{ type: "text", plain_text: text, text: { content: text } }];
}

function page(id: string, name: string, slug: string, description = "") {
  return {
    object: "page",
    id,
    url: `https://notion.so/${id}`,
    last_edited_time: "2026-10-01T12:00:00.000Z",
    properties: {
      Name: { type: "title", title: richText(name) },
      slug: { type: "rich_text", rich_text: richText(slug) },
      description: { type: "rich_text", rich_text: richText(description) },
    },
  };
}

function block(id: string, type: string, hasChildren = false) {
  return { object: "block", id, type, has_children: hasChildren, [type]: {} };
}

function list(results: unknown[]) {
  return { results, has_more: false, next_cursor: null };
}

describe("notion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NOTION_ACCESS_TOKEN", "secret_token");
    vi.stubEnv("NOTION_PAGES_DATA_SOURCE_ID", "ds_1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads nothing when Notion isn't configured", async () => {
    vi.stubEnv("NOTION_ACCESS_TOKEN", "");

    expect(isNotionConfigured()).toBe(false);
    expect(await getPublishedPages()).toEqual([]);
    expect(await getPageBySlug("privacy")).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("lists published pages with a slug", async () => {
    mockQuery.mockResolvedValue(
      list([
        page("p1", "Privacy Policy", "privacy", "How Purl handles your data"),
        page("p2", "Draft without slug", " "),
      ]),
    );

    expect(await getPublishedPages()).toEqual([
      {
        id: "p1",
        slug: "privacy",
        title: "Privacy Policy",
        description: "How Purl handles your data",
        lastEditedAt: "2026-10-01T12:00:00.000Z",
      },
    ]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        data_source_id: "ds_1",
        filter: { property: "state", select: { equals: "published" } },
      }),
    );
  });

  it("finds a published page by slug with its nested blocks", async () => {
    mockQuery.mockResolvedValue(
      list([page("p0", "Privacy", "privacy"), page("p1", "Terms", "Terms")]),
    );
    mockListChildren.mockImplementation(({ block_id }: { block_id: string }) =>
      Promise.resolve(
        list(
          block_id === "p1"
            ? [
                block("b1", "paragraph"),
                block("b2", "toggle", true),
                block("b3", "child_page", true),
              ]
            : [block("b2a", "paragraph")],
        ),
      ),
    );

    const result = await getPageBySlug(" Terms ");

    // Slugs match case-insensitively: the row's "Terms" serves "terms".
    expect(result?.title).toBe("Terms");
    expect(result?.slug).toBe("terms");
    expect(result?.blocks.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
    expect(result?.blocks[1]?.children?.map((b) => b.id)).toEqual(["b2a"]);
    // Child pages are their own documents: never fetched into this one.
    expect(result?.blocks[2]?.children).toBeUndefined();
    expect(mockListChildren).toHaveBeenCalledTimes(2);
  });

  it("returns null for a missing or unpublished page", async () => {
    mockQuery.mockResolvedValue(list([]));

    expect(await getPageBySlug("nope")).toBeNull();
    expect(mockListChildren).not.toHaveBeenCalled();
  });

  describe("getPublishedFile", () => {
    const IMAGE_ID = "aaaaaaaabbbbccccddddeeeeeeeeeeee";

    function imageBlock(url: string) {
      return {
        ...block(IMAGE_ID, "image"),
        image: {
          type: "file",
          file: { url, expiry_time: "2026-10-29T18:00:00.000Z" },
          caption: [],
        },
      };
    }

    beforeEach(() => {
      mockQuery.mockResolvedValue(list([page("p1", "Privacy", "privacy")]));
      // Nested in a toggle, as files often are.
      mockListChildren.mockImplementation(({ block_id }: { block_id: string }) =>
        Promise.resolve(
          list(
            block_id === "p1"
              ? [block("t1", "toggle", true)]
              : [imageBlock("https://old.example/x.png")],
          ),
        ),
      );
      mockRetrieveBlock.mockResolvedValue(imageBlock("https://fresh.example/x.png"));
    });

    it("returns a fresh URL for a file on a published page", async () => {
      expect(await getPublishedFile(IMAGE_ID)).toEqual({
        url: "https://fresh.example/x.png",
        expiresAt: new Date("2026-10-29T18:00:00.000Z"),
      });
      expect(mockRetrieveBlock).toHaveBeenCalledWith({ block_id: IMAGE_ID });
    });

    it("refuses blocks that aren't on a published page, without asking Notion for them", async () => {
      expect(await getPublishedFile("b".repeat(32))).toBeNull();
      expect(await getPublishedFile("../not-an-id")).toBeNull();
      expect(mockRetrieveBlock).not.toHaveBeenCalled();
    });

    it("returns null for a block with no uploaded file", async () => {
      mockRetrieveBlock.mockResolvedValue({
        ...block(IMAGE_ID, "image"),
        image: { type: "external", external: { url: "https://a.example/x.png" }, caption: [] },
      });
      expect(await getPublishedFile(IMAGE_ID)).toBeNull();
    });
  });
});
