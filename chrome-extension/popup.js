let baseUrl = "https://purl.nublson.com";

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function setIcon(type) {
  const el = document.getElementById("icon");
  if (type === "loading") {
    el.className = "spinner";
    el.textContent = "";
    return;
  }
  el.className = `status-icon ${type}`;
  el.textContent = type === "success" ? "✓" : type === "warn" ? "!" : "✕";
}

function setLabel(text) {
  document.getElementById("label").textContent = text;
}

async function run() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? "";

  const configResult = await sendMessage({ type: "GET_CONFIG" });
  baseUrl = configResult?.baseUrl ?? baseUrl;

  const result = await sendMessage({ type: "SAVE_LINK", url });

  if (result.ok) {
    setIcon("success");
    setLabel("Saved with Purl");
    return;
  }

  if (result.code === "UNAUTHORIZED") {
    setIcon("error");
    setLabel("Sign in to Purl");
    return;
  }

  if (result.code === "LIMIT_REACHED") {
    setIcon("warn");
    setLabel("Link limit reached");
    return;
  }

  if (result.code === "INVALID_URL") {
    setIcon("error");
    setLabel("Can't save this page");
    return;
  }

  setIcon("error");
  setLabel("Something went wrong");
}

document.addEventListener("DOMContentLoaded", run);
