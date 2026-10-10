import type { ReactNode } from "react";
import { Typography } from "@/components/typography";
import type { NotionBlock } from "@/lib/notion";
import { cn } from "@/lib/utils";
import { RichText } from "./rich-text";
import type { NotionRenderContext } from "./types";

type ListProps = {
  kind: "bulleted" | "numbered" | "todo";
  items: NotionBlock[];
  context: NotionRenderContext;
  /** Renders an item's nested blocks. */
  renderChildren: (item: NotionBlock) => ReactNode;
};

function ItemBody({
  item,
  context,
}: {
  item: NotionBlock;
  context: NotionRenderContext;
}) {
  if (item.type === "bulleted_list_item") {
    return <RichText text={item.bulleted_list_item.rich_text} context={context} />;
  }
  if (item.type === "numbered_list_item") {
    return <RichText text={item.numbered_list_item.rich_text} context={context} />;
  }
  if (item.type === "to_do") {
    const { rich_text, checked } = item.to_do;
    const text = <RichText text={rich_text} context={context} />;
    return (
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          disabled
          checked={checked}
          readOnly
          className="mt-1.5 size-4 shrink-0"
        />
        <span>{checked ? <s>{text}</s> : text}</span>
      </label>
    );
  }
  return null;
}

export function ListBlock({ kind, items, context, renderChildren }: ListProps) {
  const Tag = kind === "numbered" ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "flex max-w-[68ch] flex-col gap-2 pl-6",
        kind === "bulleted" && "list-disc",
        kind === "numbered" && "list-decimal",
        kind === "todo" && "list-none pl-0",
      )}
    >
      {items.map((item) => (
        <Typography
          key={item.id}
          component="li"
          className="text-foreground"
        >
          <ItemBody item={item} context={context} />
          {item.children?.length ? (
            <div className="mt-2 flex flex-col gap-2">{renderChildren(item)}</div>
          ) : null}
        </Typography>
      ))}
    </Tag>
  );
}
