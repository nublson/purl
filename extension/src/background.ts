/// <reference types="chrome" />

declare const __PURL_URL__: string;

const PURL_URL: string = __PURL_URL__;

type ToastState = "saving" | "saved" | "error";

// This function is serialized via .toString() and injected into the page context
// by chrome.scripting.executeScript — it must be fully self-contained.
function showToast(state: ToastState, message: string | null): void {
  const HOST_ID = "__purl_ext_toast__";

  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    top: "24px",
    right: "24px",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .toast {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 11px 16px;
      background: #111;
      color: #fff;
      border-radius: 100px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 14px;
      font-weight: 500;
      line-height: 1;
      box-shadow: 0 4px 24px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.15);
      white-space: nowrap;
      opacity: 0;
      transform: translateY(-6px);
      transition: opacity .18s ease, transform .18s ease;
    }
    .toast.in { opacity: 1; transform: translateY(0); }
    .toast.out { opacity: 0; transform: translateY(-6px); }
    .icon-ok { color: #22c55e; font-size: 15px; line-height: 1; }
    .icon-err { color: #ef4444; font-size: 15px; line-height: 1; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      border: 2px solid rgba(255,255,255,.25);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .65s linear infinite;
    }
  `;
  shadow.appendChild(style);

  const toast = document.createElement("div");
  toast.className = "toast";

  // Build icon element safely via DOM methods (no innerHTML)
  let iconEl: HTMLElement;
  if (state === "saving") {
    iconEl = document.createElement("div");
    iconEl.className = "spinner";
  } else {
    iconEl = document.createElement("span");
    iconEl.className = state === "saved" ? "icon-ok" : "icon-err";
    iconEl.textContent = state === "saved" ? "✓" : "✕";
  }

  const labelEl = document.createElement("span");
  const labels: Record<ToastState, string> = {
    saving: "Saving…",
    saved: "Saved with Purl",
    error: message ?? "Something went wrong",
  };
  labelEl.textContent = labels[state];

  toast.appendChild(iconEl);
  toast.appendChild(labelEl);
  shadow.appendChild(toast);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => toast.classList.add("in")),
  );

  if (state !== "saving") {
    const delay = state === "saved" ? 3000 : 4000;
    setTimeout(() => {
      toast.classList.remove("in");
      toast.classList.add("out");
      setTimeout(() => host.remove(), 220);
    }, delay);
  }
}

/**
 * Shows a toast in the page. Best effort: Chrome refuses to run scripts on some
 * pages (its own pages, the Web Store…), and a missing toast must never stop a
 * save. Resolves to whether the toast was shown.
 */
async function injectToast(
  tabId: number,
  state: ToastState,
  message: string | null = null,
): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showToast,
      args: [state, message],
    });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_TITLE = "Save to Purl";
const BADGE_MS = 3000;

/**
 * Where a toast can't run, the toolbar icon says it instead: a badge (✓ or !)
 * with the message as its tooltip, cleared after a few seconds.
 */
async function flashBadge(
  tabId: number,
  state: Exclude<ToastState, "saving">,
  message: string,
): Promise<void> {
  const saved = state === "saved";
  try {
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: saved ? "#16a34a" : "#dc2626",
    });
    await chrome.action.setBadgeText({ tabId, text: saved ? "✓" : "!" });
    await chrome.action.setTitle({ tabId, title: message });
  } catch {
    return; // the tab went away
  }
  setTimeout(() => {
    void Promise.all([
      chrome.action.setBadgeText({ tabId, text: "" }),
      chrome.action.setTitle({ tabId, title: DEFAULT_TITLE }),
    ]).catch(() => {});
  }, BADGE_MS);
}

/** Tells the user how it went: a toast in the page, or the icon where that can't run. */
async function report(
  tabId: number,
  state: ToastState,
  message: string | null = null,
): Promise<void> {
  const shown = await injectToast(tabId, state, message);
  if (shown || state === "saving") return;
  await flashBadge(
    tabId,
    state,
    message ?? (state === "saved" ? "Saved with Purl" : "Something went wrong"),
  );
}

/** Only web pages can be saved; Purl rejects chrome://, file:// and the like. */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}


// --- Connection -------------------------------------------------------------
//
// The extension saves with a save-only OAuth token (`links:save`), not the
// site's session cookie: Safari sends no cookies with an extension's requests.
// Connecting is a normal OAuth code flow with PKCE in a Purl tab: the user
// signs in if needed and allows the extension, Purl redirects the tab to
// REDIRECT_URI with a code, and the extension takes it from the tab's address
// (no `identity` API, which Safari lacks), closes the tab and swaps it for
// tokens. Signing out of Purl disconnects the extension (the next save gets a
// 401 and connects again).

// One registered client per browser, so Purl's Connected apps says where each
// connection comes from. Safari's extension pages are safari-web-extension://;
// every Chromium browser counts as Chrome.
const CLIENT_ID = chrome.runtime.getURL("").startsWith("safari-web-extension:")
  ? "purl-extension-safari"
  : "purl-extension-chrome";
const REDIRECT_URI = `${PURL_URL}/extension/connected`;
const SCOPE = "links:save offline_access";
const AUTHORIZE_URL = `${PURL_URL}/api/auth/mcp/authorize`;
const TOKEN_URL = `${PURL_URL}/api/auth/mcp/token`;
const SAVE_URL = `${PURL_URL}/api/v1/links/save`;

type Tokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // ms since epoch
};

const TOKENS_KEY = "tokens";
// Refresh a little before the access token runs out.
const EXPIRY_MARGIN_MS = 60_000;

async function readTokens(): Promise<Tokens | null> {
  const stored = await chrome.storage.local.get(TOKENS_KEY);
  return (stored[TOKENS_KEY] as Tokens | undefined) ?? null;
}

const writeTokens = (tokens: Tokens) =>
  chrome.storage.local.set({ [TOKENS_KEY]: tokens });

const clearTokens = () => chrome.storage.local.remove(TOKENS_KEY);

/**
 * Calls the token endpoint. Resolves to null when Purl refuses (an expired or
 * revoked grant); a network failure throws, like any other request.
 */
async function requestTokens(
  params: Record<string, string>,
  signal: AbortSignal,
  previousRefreshToken: string | null = null,
): Promise<Tokens | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    credentials: "omit",
    body: new URLSearchParams({ ...params, client_id: CLIENT_ID }),
    signal,
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  } | null;
  if (typeof body?.access_token !== "string") return null;
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  return {
    accessToken: body.access_token,
    refreshToken:
      typeof body.refresh_token === "string"
        ? body.refresh_token
        : previousRefreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

/** New tokens from the refresh token, or null (and disconnected) when that's refused. */
async function refreshTokens(
  tokens: Tokens,
  signal: AbortSignal,
): Promise<Tokens | null> {
  const next = tokens.refreshToken
    ? await requestTokens(
        { grant_type: "refresh_token", refresh_token: tokens.refreshToken },
        signal,
        tokens.refreshToken,
      )
    : null;
  if (next) await writeTokens(next);
  else await clearTokens();
  return next;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const randomToken = () =>
  base64Url(crypto.getRandomValues(new Uint8Array(32)));

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

// --- Saving -----------------------------------------------------------------

// The server answers 403 { code: "LIMIT_REACHED" } at the link cap, and
// 403 { code: "insufficient_scope" } for a token that can't save.
async function errorCode(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    const code =
      typeof body === "object" && body !== null
        ? (body as { code?: unknown }).code
        : undefined;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

type SaveOutcome = "done" | "unauthorized";

const postSave = (accessToken: string, url: string, signal: AbortSignal) =>
  fetch(SAVE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "omit",
    body: JSON.stringify({ url }),
    signal,
  });

/**
 * Saves `url` and tells the user how it went in tab `tabId`. "unauthorized"
 * (not connected, or the connection was revoked) isn't reported: the caller
 * decides whether to connect or give up.
 */
async function savePage(tabId: number, url: string): Promise<SaveOutcome> {
  let tokens = await readTokens();
  if (!tokens) return "unauthorized";

  await report(tabId, "saving");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const { signal } = controller;

  try {
    if (tokens.expiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
      tokens = await refreshTokens(tokens, signal);
      if (!tokens) return "unauthorized";
    }

    let res = await postSave(tokens.accessToken, url, signal);
    // Revoked or expired early: one refresh, then give up.
    if (res.status === 401) {
      tokens = await refreshTokens(tokens, signal);
      if (!tokens) return "unauthorized";
      res = await postSave(tokens.accessToken, url, signal);
      if (res.status === 401) {
        await clearTokens();
        return "unauthorized";
      }
    }

    const code = res.status === 403 ? await errorCode(res) : null;
    if (code === "insufficient_scope") {
      await clearTokens();
      return "unauthorized";
    }
    if (code === "LIMIT_REACHED") {
      await report(tabId, "error", "Link limit reached");
    } else if (res.status === 429) {
      // Saves are limited to 30 a minute.
      await report(tabId, "error", "Too many saves, try again in a minute");
    } else if (!res.ok) {
      await report(tabId, "error", "Something went wrong");
    } else {
      await report(tabId, "saved");
    }
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Request timed out"
        : "Could not reach Purl";
    await report(tabId, "error", msg);
  } finally {
    clearTimeout(timeout);
  }
  return "done";
}

// A save that's waiting for the user to connect. It lives in session storage
// because the browser can stop this worker while they're signing in.
type PendingSave = {
  url: string;
  tabId: number; // the page being saved
  loginTabId: number; // the Purl tab we opened
  state: string;
  codeVerifier: string;
  at: number;
};

const PENDING_KEY = "pendingSave";
const PENDING_TTL_MS = 10 * 60_000;

async function readPending(): Promise<PendingSave | null> {
  const stored = await chrome.storage.session.get(PENDING_KEY);
  return (stored[PENDING_KEY] as PendingSave | undefined) ?? null;
}

/** Opens Purl so the user can connect; the save resumes in `finishConnect`. */
async function startConnect(tabId: number, url: string): Promise<void> {
  const state = randomToken();
  const codeVerifier = randomToken();
  const authorize = new URL(AUTHORIZE_URL);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: await codeChallenge(codeVerifier),
    code_challenge_method: "S256",
  }).toString();

  const loginTab = await chrome.tabs.create({ url: authorize.href });
  if (loginTab.id !== undefined) {
    const pending: PendingSave = {
      url,
      tabId,
      loginTabId: loginTab.id,
      state,
      codeVerifier,
      at: Date.now(),
    };
    await chrome.storage.session.set({ [PENDING_KEY]: pending });
  }
  await report(tabId, "error", "Connect Purl to save this page");
}

/** The callback's parameters when `url` is REDIRECT_URI, else null. */
function readCallback(url: string): URLSearchParams | null {
  try {
    const callback = new URL(url);
    const expected = new URL(REDIRECT_URI);
    return callback.origin === expected.origin &&
      callback.pathname === expected.pathname
      ? callback.searchParams
      : null;
  } catch {
    return null;
  }
}

async function finishConnect(
  pending: PendingSave,
  params: URLSearchParams,
): Promise<void> {
  // Back to the page, and the Purl tab out of the way; either tab may be gone.
  await chrome.tabs.update(pending.tabId, { active: true }).catch(() => {});
  await chrome.tabs.remove(pending.loginTabId).catch(() => {});

  // A denial comes back with `error` and no `state` (Better Auth).
  const code = params.get("code");
  if (!code || params.get("state") !== pending.state) {
    await report(pending.tabId, "error", "Purl wasn't connected");
    return;
  }

  let tokens: Tokens | null;
  try {
    tokens = await requestTokens(
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: pending.codeVerifier,
      },
      AbortSignal.timeout(15_000),
    );
  } catch {
    await report(pending.tabId, "error", "Could not reach Purl");
    return;
  }
  if (!tokens) {
    await report(pending.tabId, "error", "Couldn't connect to Purl");
    return;
  }
  await writeTokens(tokens);

  // Just connected and still unauthorized: say so rather than going round again.
  if ((await savePage(pending.tabId, pending.url)) === "unauthorized") {
    await report(pending.tabId, "error", "Couldn't connect to Purl");
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const pending = await readPending();
  if (!pending || pending.loginTabId !== tabId) return;
  const params = readCallback(changeInfo.url);
  if (!params) return;

  await chrome.storage.session.remove(PENDING_KEY);
  if (Date.now() - pending.at > PENDING_TTL_MS) return;
  await finishConnect(pending, params);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pending = await readPending();
  if (pending?.loginTabId === tabId) {
    await chrome.storage.session.remove(PENDING_KEY);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const tabId = tab.id;

  // No address means the browser gave us no access to the page (its own pages).
  if (!tab.url || !isWebUrl(tab.url)) {
    await report(tabId, "error", "Can't save this page");
    return;
  }

  if ((await savePage(tabId, tab.url)) === "unauthorized") {
    await startConnect(tabId, tab.url);
  }
});

// Marks this entry point as a module (it has no imports), so tests can import it.
export {};
