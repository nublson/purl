import { defineBackground, storage } from "#imports";

const DEFAULT_BASE_URL = "https://purl.nublson.com";
const SESSION_TTL_MS = 5 * 60 * 1000;

const purlBaseUrl = storage.defineItem<string>("sync:purlBaseUrl", {
  fallback: DEFAULT_BASE_URL,
});

async function getBaseUrl(): Promise<string> {
  return purlBaseUrl.getValue();
}

async function saveLink(baseUrl: string, url: string) {
  try {
    const res = await fetch(`${baseUrl}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      credentials: "include",
    });
    if (res.status === 201) return { ok: true };
    if (res.status === 401) return { ok: false, code: "UNAUTHORIZED" };
    if (res.status === 402) return { ok: false, code: "LIMIT_REACHED" };
    if (res.status === 400) return { ok: false, code: "INVALID_URL" };
    return { ok: false, code: "NETWORK_ERROR" };
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
}

function resultToStatus(result: { ok: boolean; code?: string }) {
  if (result.ok) return "saved";
  if (result.code === "UNAUTHORIZED") return "unauthorized";
  if (result.code === "LIMIT_REACHED") return "limit";
  if (result.code === "INVALID_URL") return "invalid";
  return "error";
}

async function showBadge(tabId: number, ok: boolean) {
  browser.action.setBadgeText({ text: ok ? "✓" : "✗", tabId });
  browser.action.setBadgeBackgroundColor({ color: ok ? "#16a34a" : "#dc2626", tabId });
  setTimeout(() => browser.action.setBadgeText({ text: "", tabId }), 2000);
}

async function handleSave(tab: chrome.tabs.Tab) {
  if (!tab?.url || !tab?.id) return;
  const tabId = tab.id;
  const baseUrl = await getBaseUrl();

  // Show spinner toast immediately, then update with result
  try {
    await browser.tabs.sendMessage(tabId, { type: "SHOW_TOAST", status: "saving" });
  } catch {
    // chrome:// or other restricted page — skip toast, use badge instead
    const result = await saveLink(baseUrl, tab.url);
    await showBadge(tabId, result.ok);
    return;
  }

  const result = await saveLink(baseUrl, tab.url);
  const status = resultToStatus(result);

  try {
    await browser.tabs.sendMessage(tabId, { type: "SHOW_TOAST", status });
  } catch {
    await showBadge(tabId, result.ok);
  }
}

export default defineBackground(() => {
  // Icon click → save + show content script toast
  browser.action.onClicked.addListener(handleSave);

  // Keyboard shortcut → same flow
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "save-current-page") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) await handleSave(tab);
  });
});
