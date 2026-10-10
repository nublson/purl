import { Typography } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import type { NotionBlock } from "@/lib/notion";
import { RichText } from "./rich-text";
import type { NotionRenderContext } from "./types";

type Props = { block: NotionBlock; context: NotionRenderContext };

export function ParagraphBlock({ block, context }: Props) {
  if (block.type !== "paragraph" || block.paragraph.rich_text.length === 0) {
    return null;
  }
  return (
    <Typography className="max-w-[68ch] text-foreground">
      <RichText text={block.paragraph.rich_text} context={context} />
    </Typography>
  );
}

export function QuoteBlock({ block, context }: Props) {
  if (block.type !== "quote") return null;
  return (
    <blockquote className="max-w-[68ch] border-l-2 pl-4">
      <Typography component="span" className="block text-foreground">
        <RichText text={block.quote.rich_text} context={context} />
      </Typography>
    </blockquote>
  );
}

export function DividerBlock() {
  return <Separator />;
}
