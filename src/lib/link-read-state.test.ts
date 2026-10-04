import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { isLinkRead, setLinksRead, settleLinkReadOverrides } = await import(
  "./link-read-state"
);

const unread = { id: "a", readAt: null };

describe("setLinksRead", () => {
  let calls: { body: { read: boolean } }[];

  beforeEach(() => {
    calls = [];
    settleLinkReadOverrides(Number.MAX_SAFE_INTEGER);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    settleLinkReadOverrides(Number.MAX_SAFE_INTEGER);
  });

  function stubFetch(respond: (read: boolean) => Response | Promise<Response>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push({ body });
        return respond(body.read);
      }),
    );
  }

  it("shows the change at once and keeps it once confirmed", async () => {
    stubFetch(() => new Response("{}", { status: 200 }));
    const done = setLinksRead(["a"], true);
    expect(isLinkRead(unread)).toBe(true);
    expect(await done).toBe(true);
    expect(isLinkRead(unread)).toBe(true);
  });

  it("sends requests one at a time, in the order they were made", async () => {
    let releaseFirst = () => {};
    stubFetch((read) =>
      read
        ? new Promise((resolve) => {
            releaseFirst = () => resolve(new Response("{}", { status: 200 }));
          })
        : new Response("{}", { status: 200 }),
    );
    const first = setLinksRead(["a"], true);
    const second = setLinksRead(["a"], false);
    await Promise.resolve();
    // The unread request waits for the read one to finish.
    expect(calls.map((call) => call.body.read)).toEqual([true]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(calls.map((call) => call.body.read)).toEqual([true, false]);
    expect(isLinkRead(unread)).toBe(false);
  });

  it("falls back to the list's state when every request fails", async () => {
    stubFetch(() => new Response("{}", { status: 500 }));
    await Promise.all([setLinksRead(["a"], true), setLinksRead(["a"], false)]);
    // Not stuck on the first request's unconfirmed "read".
    expect(isLinkRead(unread)).toBe(false);
    expect(isLinkRead({ id: "a", readAt: new Date() })).toBe(true);
  });

  it("falls back to what the server last confirmed when a later request fails", async () => {
    stubFetch((read) => new Response("{}", { status: read ? 200 : 500 }));
    await Promise.all([setLinksRead(["a"], true), setLinksRead(["a"], false)]);
    expect(isLinkRead(unread)).toBe(true);
  });

  it("drops confirmed changes once a reload that started later has them", async () => {
    stubFetch(() => new Response("{}", { status: 200 }));
    await setLinksRead(["a"], true);
    settleLinkReadOverrides(Date.now());
    // The reloaded list is the source again.
    expect(isLinkRead(unread)).toBe(false);
  });
});
