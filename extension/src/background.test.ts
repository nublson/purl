import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Tab = { id?: number; url?: string };

let click: (tab: Tab) => Promise<void>;
const executeScript = vi.fn();
const setBadgeText = vi.fn();
const setBadgeBackgroundColor = vi.fn();
const setTitle = vi.fn();

beforeAll(async () => {
  Object.assign(globalThis, {
    __PURL_URL__: "https://purl.live",
    chrome: {
      action: {
        onClicked: {
          addListener: (listener: typeof click) => {
            click = listener;
          },
        },
        setBadgeText,
        setBadgeBackgroundColor,
        setTitle,
      },
      scripting: { executeScript },
    },
  });
  await import("./background");
});

const PAGE: Tab = { id: 7, url: "https://example.com/article" };

/** [state, message] of every toast the extension tried to show, in order. */
const toasts = () =>
  executeScript.mock.calls.map(
    ([options]) => (options as { args: [string, string | null] }).args,
  );

const lastToast = () => toasts()[toasts().length - 1];

function respond(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  executeScript.mockReset().mockResolvedValue(undefined);
  setBadgeText.mockReset().mockResolvedValue(undefined);
  setBadgeBackgroundColor.mockReset().mockResolvedValue(undefined);
  setTitle.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("saving a page", () => {
  it("posts the tab's address with the session, and shows Saving then Saved", async () => {
    const fetchMock = respond(201);
    await click(PAGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://purl.live/api/links");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ url: PAGE.url });
    expect(toasts()).toEqual([
      ["saving", null],
      ["saved", null],
    ]);
    // The toast was shown, so the toolbar icon stays quiet.
    expect(setBadgeText).not.toHaveBeenCalled();
  });

  it.each([
    [401, {}, "Log in to Purl first"],
    [403, { code: "LIMIT_REACHED", feature: "SAVE_LIMIT" }, "Link limit reached"],
    [403, { error: "Forbidden" }, "Something went wrong"],
    [403, "not json", "Something went wrong"],
    [429, { error: "Too many requests" }, "Too many saves, try again in a minute"],
    [500, {}, "Something went wrong"],
    [400, { error: "Invalid or missing URL" }, "Something went wrong"],
  ])("shows the right error for %i %j", async (status, body, message) => {
    respond(status, body);
    await click(PAGE);
    expect(lastToast()).toEqual(["error", message]);
  });

  it("says so when Purl can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await click(PAGE);
    expect(lastToast()).toEqual(["error", "Could not reach Purl"]);
  });

  it("gives up after 15 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      ),
    );
    const done = click(PAGE);
    await vi.advanceTimersByTimeAsync(15_000);
    await done;
    expect(lastToast()).toEqual(["error", "Request timed out"]);
  });
});

describe("pages that can't be saved", () => {
  it.each([
    "chrome://extensions",
    "chrome-extension://abc/page.html",
    "about:blank",
    "file:///Users/me/notes.html",
    "view-source:https://example.com",
  ])("%s: no request, and the icon says it can't be saved", async (url) => {
    const fetchMock = respond(201);
    // Chrome won't run our toast on these pages either.
    executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    await click({ id: 7, url });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "!" });
    expect(setTitle).toHaveBeenCalledWith({
      tabId: 7,
      title: "Can't save this page",
    });
  });

  it("does the same when Chrome withholds the address", async () => {
    const fetchMock = respond(201);
    executeScript.mockRejectedValue(new Error("no access"));
    await click({ id: 7 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "!" });
  });

  it("shows the message as a toast where a toast can run", async () => {
    respond(201);
    await click({ id: 7, url: "about:blank" });
    expect(toasts()).toEqual([["error", "Can't save this page"]]);
    expect(setBadgeText).not.toHaveBeenCalled();
  });

  it("does nothing without a tab", async () => {
    const fetchMock = respond(201);
    await click({ url: PAGE.url });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
    expect(setBadgeText).not.toHaveBeenCalled();
  });
});

describe("when the toast can't be shown", () => {
  beforeEach(() => {
    // Chrome refuses to script some pages, such as the Chrome Web Store.
    executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));
  });

  it("still saves, and the icon shows a check, then clears", async () => {
    vi.useFakeTimers();
    const fetchMock = respond(201);
    await click(PAGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 7,
      color: "#16a34a",
    });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "✓" });
    expect(setTitle).toHaveBeenCalledWith({ tabId: 7, title: "Saved with Purl" });

    await vi.advanceTimersByTimeAsync(3_000);
    expect(setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: "" });
    expect(setTitle).toHaveBeenLastCalledWith({ tabId: 7, title: "Save to Purl" });
  });

  it("shows failures on the icon, with the reason as its title", async () => {
    respond(401);
    await click(PAGE);
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 7,
      color: "#dc2626",
    });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "!" });
    expect(setTitle).toHaveBeenCalledWith({
      tabId: 7,
      title: "Log in to Purl first",
    });
  });

  it("doesn't flash the icon for Saving", async () => {
    vi.useFakeTimers();
    respond(201);
    await click(PAGE);
    // One badge for the result, none for "Saving…".
    expect(setBadgeText.mock.calls.filter(([o]) => o.text === "✓")).toHaveLength(1);
    expect(setBadgeText.mock.calls.filter(([o]) => o.text === "!")).toHaveLength(0);
  });
});
