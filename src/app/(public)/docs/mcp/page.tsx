import { CodeBlock } from "@/components/docs/code-block";
import { McpInstallButtons } from "@/components/docs/mcp-install-buttons";
import { ParamTable } from "@/components/docs/param-table";
import { Typography } from "@/components/typography";
import { getAppBaseUrl } from "@/lib/billing-url";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MCP Server",
  description:
    "Connect Purl to AI clients (Claude, Cursor, VS Code) over the Model Context Protocol. Search and save to your knowledge base with API key authentication.",
};

export default function McpDocsPage() {
  const baseUrl = getAppBaseUrl();
  const endpoint = `${baseUrl}/api/mcp`;

  return (
    <article className="wrapper-private flex min-h-screen flex-col gap-16 pb-12 pt-24">
      <header className="flex flex-col gap-2">
        <Typography variant="h1" component="h1">
          MCP Server
        </Typography>
        <Typography size="small" className="leading-7 text-muted-foreground">
          Purl ships a remote{" "}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            Model Context Protocol
          </a>{" "}
          server so AI clients like Claude, Cursor, and VS Code can search and
          save to your knowledge base directly. It uses the Streamable HTTP
          transport and the same API keys as the REST API.
        </Typography>
        <Typography size="mini" className="mt-4 text-muted-foreground">
          Endpoint:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {endpoint}
          </code>
        </Typography>
        <Typography size="mini" className="text-muted-foreground">
          Looking for plain HTTP instead?{" "}
          <Link href="/docs/api" className="underline underline-offset-4">
            See the REST API reference
          </Link>
          .
        </Typography>
      </header>

      {/* Overview */}
      <section id="overview" className="flex scroll-mt-24 flex-col gap-4">
        <Typography variant="h3" component="h2">
          Overview
        </Typography>
        <Typography size="small" className="leading-7 text-muted-foreground">
          MCP lets an AI client call tools on your behalf. Once connected, your
          assistant can run semantic search over everything you&apos;ve saved,
          save new links, list recent items, and fetch a single item — without
          leaving the chat. All calls are scoped to the account that owns the
          API key.
        </Typography>
      </section>

      {/* Getting Started */}
      <section id="getting-started" className="flex scroll-mt-24 flex-col gap-4">
        <Typography variant="h3" component="h2">
          Getting Started
        </Typography>
        <Typography size="small" className="leading-7 text-muted-foreground">
          Generate an API key in{" "}
          <strong>Settings → Integrations</strong>, then pass it as a Bearer
          token in the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Authorization</code>{" "}
          header. Your client must support custom headers (most do).
        </Typography>
        <CodeBlock
          language="http"
          code={`Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
        />
        <Typography size="mini" className="text-muted-foreground">
          Keep your key secret — it grants full access to your saved content. A
          request with a missing or invalid key returns{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">401 Unauthorized</code>.
        </Typography>
      </section>

      {/* App Setup */}
      <section id="app-setup" className="flex scroll-mt-24 flex-col gap-6">
        <Typography variant="h3" component="h2">
          App Setup
        </Typography>
        <Typography size="small" className="leading-7 text-muted-foreground">
          Point any MCP client at{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {endpoint}
          </code>{" "}
          and add your Bearer token. Replace{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">purl_…</code>{" "}
          with your key.
        </Typography>

        <McpInstallButtons endpoint={endpoint} />

        <div className="flex flex-col gap-2">
          <Typography size="small" className="font-medium">
            Claude Code
          </Typography>
          <CodeBlock
            language="bash"
            code={`claude mcp add purl --transport http ${endpoint} \\
  --header "Authorization: Bearer purl_..."`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Typography size="small" className="font-medium">
            Claude Desktop
          </Typography>
          <Typography size="mini" className="text-muted-foreground">
            Settings → Connectors → Add custom connector. Enter the URL{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {endpoint}
            </code>{" "}
            and add an{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Authorization</code>{" "}
            header with your Bearer token.
          </Typography>
        </div>

        <div className="flex flex-col gap-2">
          <Typography size="small" className="font-medium">
            Cursor
          </Typography>
          <Typography size="mini" className="text-muted-foreground">
            Add to{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">~/.cursor/mcp.json</code>:
          </Typography>
          <CodeBlock
            language="json"
            code={`{
  "mcpServers": {
    "purl": {
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer purl_..." }
    }
  }
}`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Typography size="small" className="font-medium">
            VS Code / Copilot
          </Typography>
          <Typography size="mini" className="text-muted-foreground">
            Add to{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.vscode/mcp.json</code>:
          </Typography>
          <CodeBlock
            language="json"
            code={`{
  "servers": {
    "purl": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer purl_..." }
    }
  }
}`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Typography size="small" className="font-medium">
            Codex
          </Typography>
          <CodeBlock language="bash" code={`codex mcp add purl --url ${endpoint}`} />
          <Typography size="mini" className="text-muted-foreground">
            Add your Bearer token via Codex&apos;s MCP header configuration.
          </Typography>
        </div>

        <div className="flex flex-col gap-2">
          <Typography size="small" className="font-medium">
            MCP Inspector (testing)
          </Typography>
          <CodeBlock
            language="bash"
            code={`npx @modelcontextprotocol/inspector`}
          />
          <Typography size="mini" className="text-muted-foreground">
            Connect via <strong>Streamable HTTP</strong> to{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {endpoint}
            </code>{" "}
            with an{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Authorization</code>{" "}
            header to list and try the tools.
          </Typography>
        </div>
      </section>

      {/* Available Tools */}
      <section id="tools" className="flex scroll-mt-24 flex-col gap-8">
        <Typography variant="h3" component="h2">
          Available Tools
        </Typography>

        <div className="flex flex-col gap-3">
          <Typography size="small" className="font-mono font-medium">
            search_content
          </Typography>
          <Typography size="small" className="leading-7 text-muted-foreground">
            Semantic search across your saved content. Returns matching items
            with the relevant text. Requires an active Pro plan (or trial).
          </Typography>
          <ParamTable
            params={[
              {
                name: "query",
                type: "string",
                required: true,
                description: "The search query describing the topic.",
              },
              {
                name: "contentType",
                type: "WEB | YOUTUBE | PDF | AUDIO",
                description: "Filter by content type.",
              },
              {
                name: "dateFrom",
                type: "string",
                description: "ISO 8601 date for the start of the range.",
              },
              {
                name: "dateTo",
                type: "string",
                description: "ISO 8601 date for the end of the range.",
              },
              {
                name: "limit",
                type: "number",
                description: "Maximum items to return (1–20, default 10).",
              },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Typography size="small" className="font-mono font-medium">
            save_link
          </Typography>
          <Typography size="small" className="leading-7 text-muted-foreground">
            Save a URL to your library. Purl ingests the content (web, PDF,
            YouTube, audio) asynchronously after saving.
          </Typography>
          <ParamTable
            params={[
              {
                name: "url",
                type: "string",
                required: true,
                description: "The URL to save.",
              },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Typography size="small" className="font-mono font-medium">
            list_saved_items
          </Typography>
          <Typography size="small" className="leading-7 text-muted-foreground">
            List your saved items (metadata only, newest first) with cursor
            pagination. The response includes a{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">nextCursor</code>{" "}
            for the following page.
          </Typography>
          <ParamTable
            params={[
              {
                name: "contentType",
                type: "WEB | YOUTUBE | PDF | AUDIO",
                description: "Filter by content type.",
              },
              {
                name: "limit",
                type: "number",
                description: "Maximum items to return (1–100, default 50).",
              },
              {
                name: "cursor",
                type: "string",
                description:
                  "Pagination cursor (ISO date) from a previous response.",
              },
            ]}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Typography size="small" className="font-mono font-medium">
            get_link
          </Typography>
          <Typography size="small" className="leading-7 text-muted-foreground">
            Fetch a single saved item by its id.
          </Typography>
          <ParamTable
            params={[
              {
                name: "id",
                type: "string",
                required: true,
                description: "The link id.",
              },
            ]}
          />
        </div>
      </section>
    </article>
  );
}
