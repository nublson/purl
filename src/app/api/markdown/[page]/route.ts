import { htmlToMarkdown, htmlTitle } from "@/lib/html-to-markdown";
import { pathForMarkdownKey } from "@/lib/markdown-negotiation";

/**
 * A public page as Markdown. The proxy rewrites `GET <page>` here when the
 * request says `Accept: text/markdown`; the page itself stays HTML for
 * everyone else. Only the keys in MARKDOWN_PAGES resolve, and the fetch goes
 * to our own origin, so this isn't a user-supplied-URL fetch (no safeFetch).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ page: string }> },
) {
  const { page } = await params;
  const path = pathForMarkdownKey(page);
  if (!path) return new Response("Not found", { status: 404 });

  const res = await fetch(new URL(path, request.url), {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  if (!res.ok) return new Response("Not found", { status: 404 });

  const html = await res.text();
  let markdown = htmlToMarkdown(html, new URL(request.url).origin);
  if (!/^#\s/m.test(markdown)) {
    const title = htmlTitle(html);
    if (title) markdown = `# ${title}\n\n${markdown}`;
  }
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
