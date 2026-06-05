import { CodeBlock } from "@/components/docs/code-block";
import { MethodBadge } from "@/components/docs/method-badge";
import { ParamTable } from "@/components/docs/param-table";
import { Typography } from "@/components/typography";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Reference",
  description:
    "Full reference for the Purl REST API. Manage saved links programmatically with API key authentication.",
};

export default function ApiDocsPage() {
  return (
    <article className="wrapper-private pb-12 pt-24 min-h-screen flex flex-col gap-16">
      <header className="flex flex-col gap-2">
        <Typography variant="h1" component="h1">
          API Reference
        </Typography>
        <Typography size="small" className="text-muted-foreground leading-7">
          The Purl REST API lets you save, read, update, and delete links
          programmatically. All endpoints are authenticated with an API key and
          return JSON.
        </Typography>
        <Typography size="mini" className="text-muted-foreground mt-4">
          Base URL:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            https://purl.so/api/v1
          </code>
        </Typography>
      </header>

      {/* Authentication */}
      <section id="authentication" className="flex flex-col gap-4 scroll-mt-24">
        <Typography variant="h3" component="h2">
          Authentication
        </Typography>
        <Typography size="small" className="text-muted-foreground leading-7">
          All API requests require a Bearer token in the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            Authorization
          </code>{" "}
          header. Generate an API key in your Purl settings under{" "}
          <strong>Settings → API Keys</strong>.
        </Typography>
        <CodeBlock
          language="http"
          code={`Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
        />
        <Typography size="mini" className="text-muted-foreground">
          API keys are scoped to your account. Keep them secret — do not expose
          them in client-side code or public repositories.
        </Typography>
        <Typography size="mini" className="text-muted-foreground">
          All <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/api/v1</code> endpoints include{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Access-Control-Allow-Origin: *</code> headers, so they can be called directly from browser environments.
        </Typography>
      </section>

      {/* Rate Limiting */}
      <section id="rate-limiting" className="flex flex-col gap-4 scroll-mt-24">
        <Typography variant="h3" component="h2">
          Rate Limiting
        </Typography>
        <Typography size="small" className="text-muted-foreground leading-7">
          The API is rate-limited per account. When exceeded, requests return{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            429 Too Many Requests
          </code>
          . Respect the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            Retry-After
          </code>{" "}
          response header.
        </Typography>
      </section>

      {/* Endpoints */}
      <section id="endpoints" className="flex flex-col gap-12 scroll-mt-24">
        <Typography variant="h3" component="h2">
          Endpoints
        </Typography>

        {/* List links */}
        <div id="list-links" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm text-foreground">/links</code>
          </div>
          <Typography size="small" className="text-muted-foreground leading-7">
            Returns a paginated list of your saved links, ordered by most
            recently saved first.
          </Typography>
          <Typography size="mini" className="font-medium text-foreground">
            Query parameters
          </Typography>
          <ParamTable
            params={[
              {
                name: "limit",
                type: "number",
                description:
                  "Number of results to return. Default 50, max 100.",
              },
              {
                name: "cursor",
                type: "string",
                description:
                  "Pagination cursor from the previous response's nextCursor field.",
              },
              {
                name: "contentType",
                type: "WEB | YOUTUBE | PDF | AUDIO",
                description: "Filter results by content type.",
              },
            ]}
          />
          <Typography size="mini" className="font-medium text-foreground">
            Example request
          </Typography>
          <CodeBlock
            language="curl"
            code={`curl https://purl.so/api/v1/links?limit=10 \\
  -H "Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
          />
          <Typography size="mini" className="font-medium text-foreground">
            Response
          </Typography>
          <CodeBlock
            language="json"
            code={`{
  "data": [
    {
      "id": "clxyz123",
      "url": "https://example.com/article",
      "title": "An interesting article",
      "description": "A short description of the article.",
      "favicon": "https://example.com/favicon.ico",
      "thumbnail": null,
      "domain": "example.com",
      "contentType": "WEB",
      "ingestStatus": "COMPLETED",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "nextCursor": "clxyz122"
}`}
            />
            <Typography size="mini" className="text-muted-foreground">
              Pass <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">nextCursor</code> as the{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">cursor</code> query parameter to fetch the next page.{" "}
              When <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">nextCursor</code> is{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">null</code> you have reached the last page.
            </Typography>
        </div>

        {/* Save link */}
        <div id="save-link" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <MethodBadge method="POST" />
            <code className="font-mono text-sm text-foreground">/links</code>
          </div>
          <Typography size="small" className="text-muted-foreground leading-7">
            Saves a URL to your library. Purl automatically detects the content
            type and queues the link for AI processing if your plan includes it.
          </Typography>
          <Typography size="mini" className="font-medium text-foreground">
            Body
          </Typography>
          <ParamTable
            params={[
              {
                name: "url",
                type: "string",
                required: true,
                description:
                  "The URL to save. Must be a valid http or https URL.",
              },
            ]}
          />
          <Typography size="mini" className="font-medium text-foreground">
            Example request
          </Typography>
          <CodeBlock
            language="curl"
            code={`curl -X POST https://purl.so/api/v1/links \\
  -H "Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/article"}'`}
          />
          <Typography size="mini" className="font-medium text-foreground">
            Response — <code className="font-mono text-xs">201 Created</code>
          </Typography>
          <CodeBlock
            language="json"
            code={`{
  "id": "clxyz123",
  "url": "https://example.com/article",
  "title": "An interesting article",
  "description": null,
  "favicon": "https://example.com/favicon.ico",
  "thumbnail": null,
  "domain": "example.com",
  "contentType": "WEB",
  "ingestStatus": "PENDING",
  "createdAt": "2025-06-05T12:00:00.000Z"
}`}
          />
        </div>

        {/* Get link */}
        <div id="get-link" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm text-foreground">
              /links/:id
            </code>
          </div>
          <Typography size="small" className="text-muted-foreground leading-7">
            Returns a single link by its ID.
          </Typography>
          <CodeBlock
            language="curl"
            code={`curl https://purl.so/api/v1/links/clxyz123 \\
  -H "Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
          />
        </div>

        {/* Update link */}
        <div id="update-link" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <MethodBadge method="PATCH" />
            <code className="font-mono text-sm text-foreground">
              /links/:id
            </code>
          </div>
          <Typography size="small" className="text-muted-foreground leading-7">
            Updates a link&apos;s URL, title, or description. At least one field
            is required.
          </Typography>
          <Typography size="mini" className="font-medium text-foreground">
            Body (at least one required)
          </Typography>
          <ParamTable
            params={[
              {
                name: "url",
                type: "string",
                description: "New URL for the link.",
              },
              {
                name: "title",
                type: "string",
                description: "New display title.",
              },
              {
                name: "description",
                type: "string | null",
                description: "New description. Pass null to clear it.",
              },
            ]}
          />
          <CodeBlock
            language="curl"
            code={`curl -X PATCH https://purl.so/api/v1/links/clxyz123 \\
  -H "Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Updated title"}'`}
          />
        </div>

        {/* Delete link */}
        <div id="delete-link" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <MethodBadge method="DELETE" />
            <code className="font-mono text-sm text-foreground">
              /links/:id
            </code>
          </div>
          <Typography size="small" className="text-muted-foreground leading-7">
            Permanently deletes a link and its associated content. Returns{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              204 No Content
            </code>{" "}
            on success.
          </Typography>
          <CodeBlock
            language="curl"
            code={`curl -X DELETE https://purl.so/api/v1/links/clxyz123 \\
  -H "Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
          />
        </div>
      </section>

      {/* API Keys */}
      <section id="api-keys" className="flex flex-col gap-12 scroll-mt-24">
        <Typography variant="h3" component="h2">
          API Keys
        </Typography>

        {/* List keys */}
        <div id="list-keys" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm text-foreground">/keys</code>
          </div>
          <Typography size="small" className="text-muted-foreground leading-7">
            Returns all API keys for your account. Key values are never returned
            after creation — only the prefix and metadata.
          </Typography>
          <CodeBlock
            language="curl"
            code={`curl https://purl.so/api/v1/keys \\
  -H "Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
          />
          <CodeBlock
            language="json"
            code={`[
  {
    "id": "key_abc123",
    "name": "My App",
    "start": "purl_xxxx",
    "createdAt": "2025-06-01T09:00:00.000Z"
  }
]`}
          />
        </div>

        {/* Create key */}
        <div id="create-key" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <MethodBadge method="POST" />
            <code className="font-mono text-sm text-foreground">/keys</code>
          </div>
          <Typography size="small" className="text-muted-foreground leading-7">
            Creates a new API key. The full key value is returned only once in
            the response — store it immediately.
          </Typography>
          <ParamTable
            params={[
              {
                name: "name",
                type: "string",
                description:
                  'A label for this key (e.g. "My App"). Defaults to "API Key".',
              },
            ]}
          />
          <CodeBlock
            language="curl"
            code={`curl -X POST https://purl.so/api/v1/keys \\
  -H "Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My App"}'`}
          />
          <Typography size="mini" className="font-medium text-foreground">
            Response —{" "}
            <code className="font-mono text-xs">201 Created</code>
          </Typography>
          <CodeBlock
            language="json"
            code={`{
  "id": "key_abc123",
  "name": "My App",
  "key": "purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "start": "purl_xxxx",
  "createdAt": "2025-06-05T12:00:00.000Z"
}`}
          />
          <Typography size="mini" className="text-muted-foreground">
            The full <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">key</code> value is only returned once — store it immediately. It cannot be retrieved again.
          </Typography>
        </div>

        {/* Delete key */}
        <div id="delete-key" className="flex flex-col gap-4 scroll-mt-24">
          <div className="flex items-center gap-3">
            <MethodBadge method="DELETE" />
            <code className="font-mono text-sm text-foreground">/keys/:id</code>
          </div>
          <Typography size="small" className="text-muted-foreground leading-7">
            Revokes an API key. Returns{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              204 No Content
            </code>{" "}
            on success. This action is irreversible.
          </Typography>
          <CodeBlock
            language="curl"
            code={`curl -X DELETE https://purl.so/api/v1/keys/key_abc123 \\
  -H "Authorization: Bearer purl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
          />
        </div>
      </section>

      {/* Error Codes */}
      <section id="errors" className="flex flex-col gap-4 scroll-mt-24 pb-16">
        <Typography variant="h3" component="h2">
          Error Codes
        </Typography>
        <Typography size="small" className="text-muted-foreground leading-7">
          All errors return JSON with an{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            error
          </code>{" "}
          field. Some errors include an additional{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            code
          </code>{" "}
          field.
        </Typography>
        <ParamTable
          params={[
            {
              name: "400",
              type: "Bad Request",
              description: "Missing or invalid request body / parameters.",
            },
            {
              name: "401",
              type: "Unauthorized",
              description: "Missing, invalid, or expired API key.",
            },
            {
              name: "402",
              type: "Payment Required",
              description:
                "Plan limit reached. Check code: LIMIT_REACHED and feature fields.",
            },
            {
              name: "404",
              type: "Not Found",
              description:
                "The requested resource does not exist or belongs to another account.",
            },
            {
              name: "429",
              type: "Too Many Requests",
              description:
                "Rate limit exceeded. Retry after the Retry-After header value.",
            },
            {
              name: "500",
              type: "Internal Server Error",
              description:
                "Unexpected server error. Contact support if it persists.",
            },
          ]}
        />
        <CodeBlock
          language="json"
          code={`{
  "error": "Plan limit reached",
  "code": "LIMIT_REACHED",
  "feature": "ai_extractions"
}`}
        />
      </section>
    </article>
  );
}
