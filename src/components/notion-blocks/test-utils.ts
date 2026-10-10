import { prerender } from "react-dom/static";
import type { ReactNode } from "react";
import type { RichTextItemResponse } from "@notionhq/client";
import type { NotionBlock } from "@/lib/notion";

let counter = 0;

/** Builds a Notion block fixture of the given type. */
export function block(
  type: string,
  data: Record<string, unknown> = {},
  extra: { children?: NotionBlock[]; id?: string } = {},
): NotionBlock {
  counter += 1;
  return {
    object: "block",
    id: extra.id ?? `00000000-0000-0000-0000-${String(counter).padStart(12, "0")}`,
    type,
    has_children: Boolean(extra.children?.length),
    [type]: data,
    ...(extra.children ? { children: extra.children } : {}),
  } as unknown as NotionBlock;
}

/** Builds one rich text item. */
export function richText(
  text: string,
  opts: {
    href?: string | null;
    annotations?: Partial<{
      bold: boolean;
      italic: boolean;
      strikethrough: boolean;
      underline: boolean;
      code: boolean;
      color: string;
    }>;
  } = {},
): RichTextItemResponse {
  return {
    type: "text",
    text: { content: text, link: opts.href ? { url: opts.href } : null },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: "default",
      ...opts.annotations,
    },
    plain_text: text,
    href: opts.href ?? null,
  } as RichTextItemResponse;
}

/** Renders a React node (async components included) to an HTML string. */
export async function renderToHtml(node: ReactNode): Promise<string> {
  const { prelude } = await prerender(node);
  return new Response(prelude).text();
}
