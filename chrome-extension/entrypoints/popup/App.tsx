import { useEffect, useState } from "react";
import "./style.css";

type Status = "saving" | "saved" | "unauthorized" | "limit" | "invalid" | "error";

const ICONS: Record<Exclude<Status, "saving">, string> = {
  saved: "✓",
  unauthorized: "✕",
  limit: "!",
  invalid: "✕",
  error: "✕",
};

const LABELS: Record<Status, string> = {
  saving: "Saving…",
  saved: "Saved with Purl",
  unauthorized: "Sign in to Purl",
  limit: "Link limit reached",
  invalid: "Can't save this page",
  error: "Something went wrong",
};

const ICON_CLASS: Record<Exclude<Status, "saving">, string> = {
  saved: "success",
  unauthorized: "err",
  limit: "warn",
  invalid: "err",
  error: "err",
};

export default function App() {
  const [status, setStatus] = useState<Status>("saving");

  useEffect(() => {
    (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? "";

      let result: { ok: boolean; code?: string } | null = null;
      try {
        result = await browser.runtime.sendMessage({ type: "SAVE_LINK", url });
      } catch {
        setStatus("error");
        return;
      }

      if (!result) { setStatus("error"); return; }
      if (result.ok) { setStatus("saved"); return; }

      setStatus(
        result.code === "UNAUTHORIZED" ? "unauthorized" :
        result.code === "LIMIT_REACHED" ? "limit" :
        result.code === "INVALID_URL" ? "invalid" : "error",
      );
    })();
  }, []);

  return (
    <div className="pill">
      {status === "saving" ? (
        <div className="spinner" />
      ) : (
        <div className={`icon ${ICON_CLASS[status]}`}>{ICONS[status]}</div>
      )}
      <span className="label">{LABELS[status]}</span>
    </div>
  );
}
