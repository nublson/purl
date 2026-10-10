import type { ReactNode } from "react";
import { Typography } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import type { NotionBlock } from "@/lib/notion";
import { RichText } from "./rich-text";
import type { NotionRenderContext } from "./types";

type Props = {
  block: NotionBlock;
  context: NotionRenderContext;
  /** Nested blocks (indented under the text); undefined when there are none. */
  children?: ReactNode;
};

export function ParagraphBlock({ block, context, children }: Props) {
  if (block.type !== "paragraph") return null;
  const empty = block.paragraph.rich_text.length === 0;
  if (empty && !children) return null;
  return (
    <>
      {empty ? null : (
        <Typography className="max-w-[68ch] text-foreground">
          <RichText text={block.paragraph.rich_text} context={context} />
        </Typography>
      )}
      {children ? (
        <div className="flex flex-col gap-4 pl-6">{children}</div>
      ) : null}
    </>
  );
}

export function QuoteBlock({ block, context, children }: Props) {
  if (block.type !== "quote") return null;
  return (
    <blockquote className="max-w-[68ch] border-l-2 pl-4">
      <Typography component="span" className="block text-foreground">
        <RichText text={block.quote.rich_text} context={context} />
      </Typography>
      {children ? (
        <div className="mt-4 flex flex-col gap-4">{children}</div>
      ) : null}
    </blockquote>
  );
}

export function DividerBlock() {
  return <Separator />;
}
