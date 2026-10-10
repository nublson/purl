import type { ReactNode } from "react";
import { Typography } from "@/components/typography";
import type { NotionBlock } from "@/lib/notion";
import { RichText } from "./rich-text";
import type { NotionRenderContext } from "./types";

type Props = {
  block: NotionBlock;
  context: NotionRenderContext;
  /** The block's rendered children. */
  children?: ReactNode;
};

export function CalloutBlock({ block, context, children }: Props) {
  if (block.type !== "callout") return null;
  const { icon, rich_text } = block.callout;
  return (
    <div className="flex gap-3 rounded-lg bg-card p-4">
      {icon?.type === "emoji" ? (
        <span aria-hidden="true" className="shrink-0 leading-normal">
          {icon.emoji}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Typography className="text-foreground">
          <RichText text={rich_text} context={context} />
        </Typography>
        {children}
      </div>
    </div>
  );
}

export function ToggleBlock({ block, context, children }: Props) {
  if (block.type !== "toggle") return null;
  return (
    <details className="group">
      <summary className="cursor-pointer text-foreground">
        <RichText text={block.toggle.rich_text} context={context} />
      </summary>
      <div className="mt-2 flex flex-col gap-4 pl-5">{children}</div>
    </details>
  );
}

export function ColumnListBlock({ children }: Props) {
  return (
    <div className="grid gap-4 md:auto-cols-fr md:grid-flow-col">
      {children}
    </div>
  );
}

export function ColumnBlock({ children }: Props) {
  return <div className="flex min-w-0 flex-col gap-4">{children}</div>;
}
