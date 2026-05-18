import { defineContentScript } from "#imports";

type ToastStatus = "saving" | "saved" | "unauthorized" | "limit" | "invalid" | "error";

const LABEL: Record<ToastStatus, string> = {
  saving: "Saving…",
  saved: "Saved with Purl",
  unauthorized: "Sign in to Purl",
  limit: "Link limit reached",
  invalid: "Can't save this page",
  error: "Something went wrong",
};

const ICON: Record<Exclude<ToastStatus, "saving">, { char: string; cls: string }> = {
  saved:        { char: "✓", cls: "success" },
  unauthorized: { char: "✕", cls: "err" },
  limit:        { char: "!", cls: "warn" },
  invalid:      { char: "✕", cls: "err" },
  error:        { char: "✕", cls: "err" },
};

function renderToast(status: ToastStatus): string {
  const iconHtml =
    status === "saving"
      ? `<div class="spinner"></div>`
      : `<div class="icon ${ICON[status].cls}">${ICON[status].char}</div>`;

  return `
    <style>
      :host { all: initial; }
      .pill {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: #0a0a0a;
        border-radius: 12px;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.01em;
        white-space: nowrap;
        -webkit-font-smoothing: antialiased;
        animation: in 0.15s ease;
      }
      .icon {
        width: 18px; height: 18px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 700; flex-shrink: 0;
      }
      .success { background: #16a34a; color: #fff; }
      .err     { background: #dc2626; color: #fff; }
      .warn    { background: #d97706; color: #fff; }
      .spinner {
        width: 18px; height: 18px; flex-shrink: 0;
        border: 2px solid rgba(255,255,255,0.2);
        border-top-color: rgba(255,255,255,0.8);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes in {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div class="pill">${iconHtml}<span>${LABEL[status]}</span></div>
  `;
}

function getOrCreateHost(): { host: HTMLElement; shadow: ShadowRoot } {
  const existing = document.getElementById("purl-toast-host");
  if (existing) {
    return { host: existing, shadow: existing.shadowRoot! };
  }
  const host = document.createElement("div");
  host.id = "purl-toast-host";
  host.style.cssText =
    "all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);
  return { host, shadow };
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(status: ToastStatus, autoDismissMs = 2500) {
  const { host, shadow } = getOrCreateHost();
  shadow.innerHTML = renderToast(status);

  if (dismissTimer) clearTimeout(dismissTimer);
  if (status !== "saving") {
    dismissTimer = setTimeout(() => host.remove(), autoDismissMs);
  }
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    browser.runtime.onMessage.addListener((msg) => {
      if (msg.type === "SHOW_TOAST") {
        showToast(msg.status ?? "error");
      }
    });
  },
});
