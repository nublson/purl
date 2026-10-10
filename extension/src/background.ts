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

// The server answers 403 { code: "LIMIT_REACHED" } at the link cap; any other
// 403 (or an unreadable body) stays a generic error.
async function isLimitReached(res: Response): Promise<boolean> {
  try {
    const body: unknown = await res.json();
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { code?: unknown }).code === "LIMIT_REACHED"
    );
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const tabId = tab.id;

  // No address means Chrome gave us no access to the page (its own pages).
  if (!tab.url || !isWebUrl(tab.url)) {
    await report(tabId, "error", "Can't save this page");
    return;
  }

  await report(tabId, "saving");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${PURL_URL}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ url: tab.url }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 401) {
      await report(tabId, "error", "Log in to Purl first");
      return;
    }
    if (res.status === 403 && (await isLimitReached(res))) {
      await report(tabId, "error", "Link limit reached");
      return;
    }
    if (res.status === 429) {
      // Saves are limited to 30 a minute.
      await report(tabId, "error", "Too many saves, try again in a minute");
      return;
    }
    if (!res.ok) {
      await report(tabId, "error", "Something went wrong");
      return;
    }

    await report(tabId, "saved");
  } catch (e) {
    clearTimeout(timeout);
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Request timed out"
        : "Could not reach Purl";
    await report(tabId, "error", msg);
  }
});

// Marks this entry point as a module (it has no imports), so tests can import it.
export {};
