import { Fragment, type ReactNode } from "react";
import type { NotionBlock } from "@/lib/notion";
import { createSlugger } from "@/lib/heading-slugs";
import { HeadingBlock } from "./heading-blocks";
import {
  CalloutBlock,
  ColumnBlock,
  ColumnListBlock,
  ToggleBlock,
} from "./layout-blocks";
import { groupBlocks } from "./group-blocks";
import { ListBlock } from "./list-blocks";
import { DividerBlock, ParagraphBlock, QuoteBlock } from "./text-blocks";
import type { NotionRenderContext } from "./types";

export function createRenderContext(
  pageSlug: string,
  pageIdToPath: ReadonlyMap<string, string>,
): NotionRenderContext {
  return { pageSlug, pageIdToPath, slug: createSlugger() };
}

const warnedTypes = new Set<string>();

function warnUnknown(type: string) {
  if (process.env.NODE_ENV !== "development" || warnedTypes.has(type)) return;
  warnedTypes.add(type);
  console.warn(`Static page: unsupported Notion block type "${type}"`);
}

/** Renders a block's nested children with the page's shared context. */
function BlockList({
  blocks,
  context,
}: {
  blocks: NotionBlock[] | undefined;
  context: NotionRenderContext;
}) {
  if (!blocks?.length) return null;
  return (
    <>
      {groupBlocks(blocks).map((group) =>
        group.kind === "block" ? (
          <Fragment key={group.block.id}>
            {renderBlock(group.block, context)}
          </Fragment>
        ) : (
          <ListBlock
            key={group.items[0].id}
            kind={group.kind}
            items={group.items}
            context={context}
            renderChildren={(item) => (
              <BlockList blocks={item.children} context={context} />
            )}
          />
        ),
      )}
    </>
  );
}

/** The dispatcher: later tasks add cases here. */
export function renderBlock(
  block: NotionBlock,
  context: NotionRenderContext,
): ReactNode {
  const children = <BlockList blocks={block.children} context={context} />;

  switch (block.type) {
    case "paragraph":
      return <ParagraphBlock block={block} context={context} />;
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return (
        <HeadingBlock block={block} context={context}>
          {children}
        </HeadingBlock>
      );
    case "quote":
      return <QuoteBlock block={block} context={context} />;
    case "callout":
      return (
        <CalloutBlock block={block} context={context}>
          {children}
        </CalloutBlock>
      );
    case "toggle":
      return (
        <ToggleBlock block={block} context={context}>
          {children}
        </ToggleBlock>
      );
    case "divider":
      return <DividerBlock />;
    case "column_list":
      return (
        <ColumnListBlock block={block} context={context}>
          {children}
        </ColumnListBlock>
      );
    case "column":
      return (
        <ColumnBlock block={block} context={context}>
          {children}
        </ColumnBlock>
      );
    case "synced_block":
      return children;
    default:
      warnUnknown(block.type);
      return null;
  }
}

export function NotionBlocks({
  blocks,
  context,
}: {
  blocks: NotionBlock[];
  context: NotionRenderContext;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      <BlockList blocks={blocks} context={context} />
    </div>
  );
}
