const DEFAULT_BASE_URL = "https://purl.nublson.com";
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

async function getBaseUrl() {
  const { purlBaseUrl } = await chrome.storage.sync.get("purlBaseUrl");
  return purlBaseUrl ?? DEFAULT_BASE_URL;
}

async function getCachedSession() {
  const { sessionCache } = await chrome.storage.session.get("sessionCache");
  if (!sessionCache) return null;
  if (Date.now() - sessionCache.ts > SESSION_CACHE_TTL_MS) return null;
  return sessionCache.session;
}

async function setCachedSession(session) {
  await chrome.storage.session.set({
    sessionCache: { session, ts: Date.now() },
  });
}

async function checkSession(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/auth/get-session`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.session ?? null;
  } catch {
    return null;
  }
}

async function saveLink(baseUrl, url) {
  try {
    const res = await fetch(`${baseUrl}/api/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      credentials: "include",
    });
    if (res.status === 201) {
      const link = await res.json();
      return { ok: true, link };
    }
    if (res.status === 401)
      return { ok: false, error: "Not logged in", code: "UNAUTHORIZED" };
    if (res.status === 402)
      return {
        ok: false,
        error: "Link limit reached. Upgrade to Pro.",
        code: "LIMIT_REACHED",
      };
    if (res.status === 400)
      return { ok: false, error: "Invalid URL", code: "INVALID_URL" };
    return {
      ok: false,
      error: `Unexpected error (${res.status})`,
      code: "NETWORK_ERROR",
    };
  } catch {
    return { ok: false, error: "Cannot reach Purl", code: "NETWORK_ERROR" };
  }
}

async function handleMessage(msg) {
  const baseUrl = await getBaseUrl();

  switch (msg.type) {
    case "GET_CONFIG":
      return { type: "CONFIG_RESULT", baseUrl };

    case "SET_CONFIG":
      await chrome.storage.sync.set({ purlBaseUrl: msg.baseUrl });
      await setCachedSession(null);
      return { type: "CONFIG_SAVED" };

    case "CHECK_SESSION": {
      const cached = await getCachedSession();
      if (cached) return { type: "SESSION_RESULT", session: cached };
      const session = await checkSession(baseUrl);
      await setCachedSession(session);
      return { type: "SESSION_RESULT", session };
    }

    case "SAVE_LINK": {
      const result = await saveLink(baseUrl, msg.url);
      if (!result.ok && result.code === "UNAUTHORIZED")
        await setCachedSession(null);
      return { type: "SAVE_RESULT", ...result };
    }

    default:
      return { type: "UNKNOWN" };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse);
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-current-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab?.id) return;

  const baseUrl = await getBaseUrl();
  const result = await saveLink(baseUrl, tab.url);

  chrome.action.setBadgeText({ text: result.ok ? "✓" : "✗", tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({
    color: result.ok ? "#16a34a" : "#dc2626",
    tabId: tab.id,
  });
  setTimeout(
    () => chrome.action.setBadgeText({ text: "", tabId: tab.id }),
    2000,
  );
});
