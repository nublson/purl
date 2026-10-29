import { type LinkProps, type NotionBlock, NotionLink, NotionRenderer } from "notionic";
import { sameSiteLink } from "@/lib/notion-links";
import { CodeBlock } from "./code-block";

/** Links to Purl's own site stay in the tab, as paths. */
function Link({ link, children }: LinkProps) {
  return <NotionLink link={sameSiteLink(link)}>{children}</NotionLink>;
}

const components = { code: CodeBlock, link: Link };

/**
 * A static page's Notion content, rendered by notionic. Links to Notion pages
 * go to the static page's path (`pageIdToPath`), or render as text when the
 * page isn't one; uploaded files go through `/api/notion/file/[blockId]`,
 * since Notion's URLs for them expire after an hour.
 */
export function NotionContent({
  blocks,
  pageIdToPath,
}: {
  blocks: NotionBlock[];
  pageIdToPath: ReadonlyMap<string, string>;
}) {
  return (
    <NotionRenderer
      blocks={blocks}
      components={components}
      pageHref={(pageId) => pageIdToPath.get(pageId) ?? null}
      transformFileUrl={({ blockId }) =>
        `/api/notion/file/${blockId.replace(/-/g, "")}`
      }
    />
  );
}
