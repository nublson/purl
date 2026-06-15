"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";

const PLACEHOLDER_KEY = "purl_YOUR_KEY";

function base64(input: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(input).toString("base64");
  }
  return window.btoa(input);
}

interface McpInstallButtonsProps {
  endpoint: string;
}

/**
 * One-click / quick install buttons for the Purl MCP server.
 *
 * Cursor supports a real install deeplink; Claude Code and Codex install via a
 * CLI command, so those buttons copy the command to the clipboard. All embed a
 * placeholder API key the user replaces with their own.
 */
export function McpInstallButtons({ endpoint }: McpInstallButtonsProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const cursorConfig = base64(
    JSON.stringify({
      url: endpoint,
      headers: { Authorization: `Bearer ${PLACEHOLDER_KEY}` },
    }),
  );
  const cursorHref = `cursor://anysphere.cursor-deeplink/mcp/install?name=purl&config=${encodeURIComponent(
    cursorConfig,
  )}`;

  const claudeCommand = `claude mcp add purl --transport http ${endpoint} --header "Authorization: Bearer ${PLACEHOLDER_KEY}"`;
  const codexCommand = `codex mcp add purl --url ${endpoint} --header "Authorization=Bearer ${PLACEHOLDER_KEY}"`;

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const buttonClass =
    "inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted cursor-pointer";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <a href={cursorHref} className={buttonClass}>
          <Download className="size-4" />
          Add to Cursor
        </a>

        <button
          type="button"
          onClick={() => copy("claude", claudeCommand)}
          className={buttonClass}
        >
          {copied === "claude" ? (
            <Check className="size-4 text-green-500" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied === "claude" ? "Copied" : "Add to Claude Code"}
        </button>

        <button
          type="button"
          onClick={() => copy("codex", codexCommand)}
          className={buttonClass}
        >
          {copied === "codex" ? (
            <Check className="size-4 text-green-500" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied === "codex" ? "Copied" : "Add to Codex"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Buttons use a placeholder key. After installing, replace{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {PLACEHOLDER_KEY}
        </code>{" "}
        with a key from Settings → Integrations. &ldquo;Add to Claude Code&rdquo;
        and &ldquo;Add to Codex&rdquo; copy the install command to your
        clipboard.
      </p>
    </div>
  );
}
