import { defineBackground, storage } from "#imports";

const DEFAULT_BASE_URL = "https://purl.nublson.com";
const SESSION_TTL_MS = 5 * 60 * 1000;

const purlBaseUrl = storage.defineItem<string>("sync:purlBaseUrl", {
  fallback: DEFAULT_BASE_URL,
});

type SessionCache = { session: unknown; ts: number } | null;
const sessionCache = storage.defineItem<SessionCache>("session:sessionCache", {
  fallback: null,
});

async function getBaseUrl(): Promise<string> {
  return purlBaseUrl.getValue();
}

async function getCachedSession() {
  const cached = await sessionCache.getValue();
  if (!cached) return null;
  if (Date.now() - cached.ts > SESSION_TTL_MS) return null;
  return cached.session;
}

async function saveLink(baseUrl: string, url: string) {
  try {
    const res = await fetch(`${baseUrl}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      credentials: "include",
    });
    if (res.status === 201) return { ok: true, link: await res.json() };
    if (res.status === 401) return { ok: false, code: "UNAUTHORIZED" };
    if (res.status === 402) return { ok: false, code: "LIMIT_REACHED" };
    if (res.status === 400) return { ok: false, code: "INVALID_URL" };
    return { ok: false, code: "NETWORK_ERROR", error: `Error ${res.status}` };
  } catch {
    return { ok: false, code: "NETWORK_ERROR", error: "Cannot reach Purl" };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "SAVE_LINK") {
      (async () => {
        const baseUrl = await getBaseUrl();
        const result = await saveLink(baseUrl, msg.url);
        sendResponse(result);
      })();
      return true;
    }
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "save-current-page") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab?.id) return;
    const baseUrl = await getBaseUrl();
    const result = await saveLink(baseUrl, tab.url);
    browser.action.setBadgeText({ text: result.ok ? "✓" : "✗", tabId: tab.id });
    browser.action.setBadgeBackgroundColor({
      color: result.ok ? "#16a34a" : "#dc2626",
      tabId: tab.id,
    });
    setTimeout(
      () => browser.action.setBadgeText({ text: "", tabId: tab.id }),
      2000,
    );
  });
});
