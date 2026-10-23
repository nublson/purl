import { createHash } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Tab = { id?: number; url?: string };

let click: (tab: Tab) => Promise<void>;
let tabUpdated: (tabId: number, changeInfo: { url?: string }) => Promise<void>;
let tabRemoved: (tabId: number) => Promise<void>;
const executeScript = vi.fn();
const setBadgeText = vi.fn();
const setBadgeBackgroundColor = vi.fn();
const setTitle = vi.fn();
const tabsCreate = vi.fn();
const tabsUpdate = vi.fn();
const tabsRemove = vi.fn();
// Site access to Purl: granted at install unless a test says otherwise (Chrome).
const permissionsContains = vi.fn(async () => true);
const permissionsRequest = vi.fn();
// The extension's own base address: Chrome's, unless a test says Safari.
let extensionBase = "chrome-extension://abcdef/";

/** An in-memory chrome.storage area. */
function storageArea(data: () => Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string) => (key in data() ? { [key]: data()[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data(), items);
    }),
    remove: vi.fn(async (key: string) => {
      delete data()[key];
    }),
  };
}
let session: Record<string, unknown> = {};
let local: Record<string, unknown> = {};

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
      permissions: { contains: permissionsContains, request: permissionsRequest },
      runtime: { getURL: (path: string) => `${extensionBase}${path}` },
      scripting: { executeScript },
      tabs: {
        create: tabsCreate,
        update: tabsUpdate,
        remove: tabsRemove,
        onUpdated: {
          addListener: (listener: typeof tabUpdated) => {
            tabUpdated = listener;
          },
        },
        onRemoved: {
          addListener: (listener: typeof tabRemoved) => {
            tabRemoved = listener;
          },
        },
      },
      storage: {
        session: storageArea(() => session),
        local: storageArea(() => local),
      },
    },
  });
  await import("./background");
});

const PAGE: Tab = { id: 7, url: "https://example.com/article" };
const SAVE_URL = "https://purl.live/api/v1/links/save";
const TOKEN_URL = "https://purl.live/api/auth/mcp/token";
const CALLBACK = "https://purl.live/extension/connected";

/** [state, message] of every toast the extension tried to show, in order. */
const toasts = () =>
  executeScript.mock.calls.map(
    ([options]) => (options as { args: [string, string | null] }).args,
  );

const lastToast = () => toasts()[toasts().length - 1];

type Reply = { status: number; body?: unknown };
const reply = ({ status, body = {} }: Reply) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
  });

/**
 * Stubs fetch: the save endpoint answers `save` (one reply per call, the last
 * one repeating), the token endpoint answers `token`.
 */
function server({
  save = [{ status: 201 }],
  token = [{ status: 200, body: TOKEN_REPLY }],
}: { save?: Reply[]; token?: Reply[] } = {}) {
  const calls = { save: 0, token: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    if (url === SAVE_URL) return reply(save[Math.min(calls.save++, save.length - 1)]);
    if (url === TOKEN_URL) return reply(token[Math.min(calls.token++, token.length - 1)]);
    throw new Error(`unexpected request to ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const TOKEN_REPLY = {
  access_token: "new-access",
  refresh_token: "new-refresh",
  expires_in: 3600,
  token_type: "Bearer",
};

const requestsTo = (fetchMock: ReturnType<typeof server>, url: string) =>
  fetchMock.mock.calls.filter(([u]) => u === url) as unknown as [string, RequestInit][];

const formOf = (init: RequestInit) =>
  Object.fromEntries(new URLSearchParams(init.body as URLSearchParams));

function connect(expiresAt = Date.now() + 3_600_000) {
  local.tokens = { accessToken: "access", refreshToken: "refresh", expiresAt };
}

/** The authorize URL the extension opened, as its parameters. */
const authorizeParams = () =>
  new URL((tabsCreate.mock.calls[0][0] as { url: string }).url).searchParams;

/** Starts a connect for PAGE (not connected), and returns the tab's callback address. */
async function startConnect(): Promise<(params?: Record<string, string>) => string> {
  server();
  await click(PAGE);
  const state = authorizeParams().get("state")!;
  return (params = { code: "the-code", state }) =>
    `${CALLBACK}?${new URLSearchParams(params)}`;
}

beforeEach(() => {
  executeScript.mockReset().mockResolvedValue(undefined);
  setBadgeText.mockReset().mockResolvedValue(undefined);
  setBadgeBackgroundColor.mockReset().mockResolvedValue(undefined);
  setTitle.mockReset().mockResolvedValue(undefined);
  tabsCreate.mockReset().mockResolvedValue({ id: 99 });
  tabsUpdate.mockReset().mockResolvedValue(undefined);
  tabsRemove.mockReset().mockResolvedValue(undefined);
  permissionsContains.mockReset().mockResolvedValue(true);
  permissionsRequest.mockReset().mockResolvedValue(true);
  session = {};
  local = {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("saving a page", () => {
  beforeEach(() => connect());

  it("posts the tab's address with the token, and shows Saving then Saved", async () => {
    const fetchMock = server();
    await click(PAGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SAVE_URL);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access");
    expect(JSON.parse(init.body as string)).toEqual({ url: PAGE.url });
    expect(toasts()).toEqual([
      ["saving", null],
      ["saved", null],
    ]);
    // The toast was shown, so the toolbar icon stays quiet.
    expect(setBadgeText).not.toHaveBeenCalled();
  });

  it.each([
    [403, { code: "LIMIT_REACHED", feature: "SAVE_LIMIT" }, "Link limit reached"],
    [403, { error: "Forbidden" }, "Something went wrong"],
    [403, "not json", "Something went wrong"],
    [429, { error: "Too many requests" }, "Too many saves, try again in a minute"],
    [500, {}, "Something went wrong"],
    [400, { error: "Invalid or missing URL" }, "Something went wrong"],
  ])("shows the right error for %i %j", async (status, body, message) => {
    server({ save: [{ status, body }] });
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

describe("keeping the connection", () => {
  it("refreshes an expired token before saving, and keeps the new one", async () => {
    connect(Date.now() - 1);
    const fetchMock = server();
    await click(PAGE);

    const [[, refresh]] = requestsTo(fetchMock, TOKEN_URL);
    expect(formOf(refresh)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "refresh",
      client_id: "purl-extension-chrome",
    });
    const [[, save]] = requestsTo(fetchMock, SAVE_URL);
    expect((save.headers as Record<string, string>).Authorization).toBe("Bearer new-access");
    expect(local.tokens).toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });
    expect(lastToast()).toEqual(["saved", null]);
  });

  it("refreshes once on a 401 and saves", async () => {
    connect();
    const fetchMock = server({ save: [{ status: 401 }, { status: 201 }] });
    await click(PAGE);
    expect(requestsTo(fetchMock, TOKEN_URL)).toHaveLength(1);
    expect(requestsTo(fetchMock, SAVE_URL)).toHaveLength(2);
    expect(lastToast()).toEqual(["saved", null]);
  });

  it("disconnects and connects again when the refresh is refused (signed out of Purl)", async () => {
    connect();
    server({ save: [{ status: 401 }], token: [{ status: 401, body: { error: "invalid_grant" } }] });
    await click(PAGE);
    expect(local.tokens).toBeUndefined();
    expect(tabsCreate).toHaveBeenCalledTimes(1);
    expect(lastToast()).toEqual(["error", "Connect Purl to save this page"]);
  });

  it("disconnects a token that can't save", async () => {
    connect();
    server({ save: [{ status: 403, body: { code: "insufficient_scope" } }] });
    await click(PAGE);
    expect(local.tokens).toBeUndefined();
    expect(tabsCreate).toHaveBeenCalledTimes(1);
  });
});

describe("when the extension isn't connected", () => {
  it("opens Purl's authorize page with PKCE and says to connect", async () => {
    const fetchMock = server();
    await click(PAGE);

    expect(fetchMock).not.toHaveBeenCalled();
    const opened = new URL((tabsCreate.mock.calls[0][0] as { url: string }).url);
    expect(`${opened.origin}${opened.pathname}`).toBe(
      "https://purl.live/api/auth/mcp/authorize",
    );
    const params = opened.searchParams;
    expect(params.get("response_type")).toBe("code");
    expect(params.get("client_id")).toBe("purl-extension-chrome");
    expect(params.get("redirect_uri")).toBe(CALLBACK);
    expect(params.get("scope")).toBe("links:save offline_access");
    expect(params.get("code_challenge_method")).toBe("S256");
    const { codeVerifier, state } = session.pendingSave as {
      codeVerifier: string;
      state: string;
    };
    expect(params.get("state")).toBe(state);
    expect(params.get("code_challenge")).toBe(
      createHash("sha256").update(codeVerifier).digest("base64url"),
    );
    expect(lastToast()).toEqual(["error", "Connect Purl to save this page"]);
    // Chrome granted the manifest's site access at install: nothing to ask.
    expect(permissionsRequest).not.toHaveBeenCalled();
  });

  it("swaps the callback's code for tokens, closes the tab and saves the page", async () => {
    const callback = await startConnect();
    const { codeVerifier } = session.pendingSave as { codeVerifier: string };
    const fetchMock = server();
    await tabUpdated(99, { url: callback() });

    const [[, exchange]] = requestsTo(fetchMock, TOKEN_URL);
    expect(formOf(exchange)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: CALLBACK,
      code_verifier: codeVerifier,
      client_id: "purl-extension-chrome",
    });
    expect(local.tokens).toMatchObject({ accessToken: "new-access" });
    const [[, save]] = requestsTo(fetchMock, SAVE_URL);
    expect(JSON.parse(save.body as string)).toEqual({ url: PAGE.url });
    expect(tabsUpdate).toHaveBeenCalledWith(7, { active: true });
    expect(tabsRemove).toHaveBeenCalledWith(99);
    expect(lastToast()).toEqual(["saved", null]);
  });

  it("saves only once", async () => {
    const callback = await startConnect();
    const fetchMock = server();
    await tabUpdated(99, { url: callback() });
    await tabUpdated(99, { url: callback() });
    expect(requestsTo(fetchMock, SAVE_URL)).toHaveLength(1);
  });

  it.each([
    [99, "https://purl.live/home"],
    [99, "https://accounts.google.com/o/oauth2/auth"],
    [99, "https://evil.example/extension/connected?code=x"],
    [5, `${CALLBACK}?code=x`],
  ])("ignores tab %i going to %s", async (tabId, url) => {
    await startConnect();
    const fetchMock = server();
    await tabUpdated(tabId, { url });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tabsRemove).not.toHaveBeenCalled();
  });

  it("ignores tab updates without a new address", async () => {
    await startConnect();
    const fetchMock = server();
    await tabUpdated(99, {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a callback with the wrong state", async () => {
    const callback = await startConnect();
    const fetchMock = server();
    await tabUpdated(99, { url: callback({ code: "x", state: "forged" }) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tabsRemove).toHaveBeenCalledWith(99);
    expect(lastToast()).toEqual(["error", "Purl wasn't connected"]);
  });

  it("says so when the user denies (no state, like Better Auth)", async () => {
    const callback = await startConnect();
    const fetchMock = server();
    await tabUpdated(99, { url: callback({ error: "access_denied" }) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tabsRemove).toHaveBeenCalledWith(99);
    expect(lastToast()).toEqual(["error", "Purl wasn't connected"]);
  });

  it("says so when Purl refuses the code", async () => {
    const callback = await startConnect();
    const fetchMock = server({ token: [{ status: 400, body: { error: "invalid_grant" } }] });
    await tabUpdated(99, { url: callback() });
    expect(requestsTo(fetchMock, SAVE_URL)).toHaveLength(0);
    expect(local.tokens).toBeUndefined();
    expect(lastToast()).toEqual(["error", "Couldn't connect to Purl"]);
  });

  it("doesn't open another tab if the new token is refused too", async () => {
    const callback = await startConnect();
    server({ save: [{ status: 401 }], token: [{ status: 200, body: TOKEN_REPLY }, { status: 401 }] });
    await tabUpdated(99, { url: callback() });
    expect(tabsCreate).toHaveBeenCalledTimes(1);
    expect(lastToast()).toEqual(["error", "Couldn't connect to Purl"]);
  });

  it("forgets the save when the Purl tab is closed", async () => {
    const callback = await startConnect();
    await tabRemoved(99);
    const fetchMock = server();
    await tabUpdated(99, { url: callback() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the save when another tab is closed", async () => {
    const callback = await startConnect();
    await tabRemoved(5);
    const fetchMock = server();
    await tabUpdated(99, { url: callback() });
    expect(requestsTo(fetchMock, SAVE_URL)).toHaveLength(1);
  });

  it("drops a save older than 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const callback = await startConnect();
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1);
    const fetchMock = server();
    await tabUpdated(99, { url: callback() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a newer save replaces the pending one", async () => {
    const first = await startConnect();
    tabsCreate.mockResolvedValue({ id: 100 });
    await click({ id: 8, url: "https://example.com/other" });
    const { state } = session.pendingSave as { state: string };

    const fetchMock = server();
    await tabUpdated(99, { url: first() });
    expect(fetchMock).not.toHaveBeenCalled();
    await tabUpdated(100, { url: `${CALLBACK}?code=c&state=${state}` });
    const [[, save]] = requestsTo(fetchMock, SAVE_URL);
    expect(JSON.parse(save.body as string)).toEqual({
      url: "https://example.com/other",
    });
  });

  it("still saves when the original tab is gone", async () => {
    const callback = await startConnect();
    tabsUpdate.mockRejectedValue(new Error("No tab with id: 7"));
    executeScript.mockRejectedValue(new Error("No tab with id: 7"));
    const fetchMock = server();
    await tabUpdated(99, { url: callback() });
    expect(requestsTo(fetchMock, SAVE_URL)).toHaveLength(1);
    expect(tabsRemove).toHaveBeenCalledWith(99);
  });
});

describe("pages that can't be saved", () => {
  beforeEach(() => connect());

  it.each([
    "chrome://extensions",
    "chrome-extension://abc/page.html",
    "about:blank",
    "file:///Users/me/notes.html",
    "view-source:https://example.com",
  ])("%s: no request, and the icon says it can't be saved", async (url) => {
    const fetchMock = server();
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

  it("does the same when the browser withholds the address", async () => {
    const fetchMock = server();
    executeScript.mockRejectedValue(new Error("no access"));
    await click({ id: 7 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "!" });
  });

  it("shows the message as a toast where a toast can run", async () => {
    server();
    await click({ id: 7, url: "about:blank" });
    expect(toasts()).toEqual([["error", "Can't save this page"]]);
    expect(setBadgeText).not.toHaveBeenCalled();
  });

  it("does nothing without a tab", async () => {
    const fetchMock = server();
    await click({ url: PAGE.url });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
    expect(setBadgeText).not.toHaveBeenCalled();
  });
});

describe("when the toast can't be shown", () => {
  beforeEach(() => {
    connect();
    // Chrome refuses to script some pages, such as the Chrome Web Store.
    executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));
  });

  it("still saves, and the icon shows a check, then clears", async () => {
    vi.useFakeTimers();
    const fetchMock = server();
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
    server({ save: [{ status: 500 }] });
    await click(PAGE);
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 7,
      color: "#dc2626",
    });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "!" });
    expect(setTitle).toHaveBeenCalledWith({
      tabId: 7,
      title: "Something went wrong",
    });
  });

  it("doesn't flash the icon for Saving", async () => {
    vi.useFakeTimers();
    server();
    await click(PAGE);
    // One badge for the result, none for "Saving…".
    expect(setBadgeText.mock.calls.filter(([o]) => o.text === "✓")).toHaveLength(1);
    expect(setBadgeText.mock.calls.filter(([o]) => o.text === "!")).toHaveLength(0);
  });
});

describe("without access to Purl's site (Safari, until the user allows it)", () => {
  // A fresh worker that finds no access when it starts.
  beforeEach(async () => {
    permissionsContains.mockResolvedValue(false);
    vi.resetModules();
    await import("./background");
    await new Promise((resolve) => setTimeout(resolve));
  });

  it("asks during the click itself, then connects", async () => {
    server();
    const done = click(PAGE);
    // Before any await: Safari refuses the request outside the user gesture.
    expect(permissionsRequest).toHaveBeenCalledWith({ origins: ["https://purl.live/*"] });
    await done;
    expect(tabsCreate).toHaveBeenCalledTimes(1);
    expect(lastToast()).toEqual(["error", "Connect Purl to save this page"]);
  });

  it("doesn't open Purl when the user refuses, and says why", async () => {
    permissionsRequest.mockResolvedValue(false);
    server();
    await click(PAGE);
    expect(tabsCreate).not.toHaveBeenCalled();
    expect(session.pendingSave).toBeUndefined();
    expect(lastToast()).toEqual(["error", "Allow Purl to access its site to connect"]);
  });

  it("still saves with a token it already has", async () => {
    permissionsRequest.mockResolvedValue(false);
    connect();
    const fetchMock = server();
    await click(PAGE);
    expect(requestsTo(fetchMock, SAVE_URL)).toHaveLength(1);
    expect(lastToast()).toEqual(["saved", null]);
  });

  it("asks only until it's granted", async () => {
    connect();
    server();
    await click(PAGE);
    await click(PAGE);
    expect(permissionsRequest).toHaveBeenCalledTimes(1);
  });
});

// Last: it reloads the worker as Safari's, which the tests above don't expect.
describe("in Safari", () => {
  it("connects as Purl's Safari client, so Connected apps says so", async () => {
    extensionBase = "safari-web-extension://abcdef/";
    vi.resetModules();
    await import("./background");

    server();
    await click(PAGE);
    expect(authorizeParams().get("client_id")).toBe("purl-extension-safari");
  });
});
