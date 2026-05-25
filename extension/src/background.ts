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

async function injectToast(
  tabId: number,
  state: ToastState,
  message: string | null = null,
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: showToast,
    args: [state, message],
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;

  await injectToast(tab.id, "saving");

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
      await injectToast(tab.id, "error", "Sign in to Purl first");
      return;
    }
    if (res.status === 402) {
      await injectToast(tab.id, "error", "Link limit reached");
      return;
    }
    if (!res.ok) {
      await injectToast(tab.id, "error", "Something went wrong");
      return;
    }

    await injectToast(tab.id, "saved");
  } catch (e) {
    clearTimeout(timeout);
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Request timed out"
        : "Could not reach Purl";
    await injectToast(tab.id, "error", msg);
  }
});
