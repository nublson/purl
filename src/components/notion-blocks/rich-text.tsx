import type { ReactNode } from "react";
import type { RichTextItemResponse } from "@notionhq/client";
import { Typography } from "@/components/typography";
import { classifyNotionLink, type NotionLink } from "@/lib/notion-links";
import { cn } from "@/lib/utils";
import type { NotionRenderContext } from "./types";

// Full class strings, so Tailwind's scanner sees them.
export const NOTION_COLOR_CLASSES: Record<string, string> = {
  default: "",
  gray: "text-gray-600 dark:text-gray-400",
  brown: "text-amber-800 dark:text-amber-400",
  orange: "text-orange-700 dark:text-orange-400",
  yellow: "text-yellow-700 dark:text-yellow-400",
  green: "text-green-700 dark:text-green-400",
  blue: "text-blue-700 dark:text-blue-400",
  purple: "text-purple-700 dark:text-purple-400",
  pink: "text-pink-700 dark:text-pink-400",
  red: "text-red-700 dark:text-red-400",
  gray_background: "bg-gray-100 dark:bg-gray-800",
  brown_background: "bg-amber-100 dark:bg-amber-900/60",
  orange_background: "bg-orange-100 dark:bg-orange-900/60",
  yellow_background: "bg-yellow-100 dark:bg-yellow-900/60",
  green_background: "bg-green-100 dark:bg-green-900/60",
  blue_background: "bg-blue-100 dark:bg-blue-900/60",
  purple_background: "bg-purple-100 dark:bg-purple-900/60",
  pink_background: "bg-pink-100 dark:bg-pink-900/60",
  red_background: "bg-red-100 dark:bg-red-900/60",
};

const LINK_CLASSES =
  "rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** An anchor with the page's link styling; external links open in a new tab. */
export function NotionAnchor({
  link,
  className,
  children,
}: {
  link: NotionLink;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Typography
      component="a"
      href={link.href}
      {...(link.external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className={cn(
        "text-inherit text-[length:inherit] leading-[inherit]",
        LINK_CLASSES,
        className,
      )}
    >
      {children}
      {link.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </Typography>
  );
}

function RichTextItem({
  item,
  context,
}: {
  item: RichTextItemResponse;
  context: NotionRenderContext;
}) {
  const { annotations } = item;
  let node: ReactNode = item.plain_text;

  if (annotations.code) {
    node = (
      <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.875em]">
        {node}
      </code>
    );
  }
  if (annotations.bold) node = <strong>{node}</strong>;
  if (annotations.italic) node = <em>{node}</em>;
  if (annotations.strikethrough) node = <s>{node}</s>;
  if (annotations.underline) node = <u>{node}</u>;

  const color = annotations.color;
  const colorClass = NOTION_COLOR_CLASSES[color] ?? "";
  if (colorClass) {
    node = color.endsWith("_background") ? (
      <mark className={cn("rounded-sm px-0.5 text-inherit", colorClass)}>
        {node}
      </mark>
    ) : (
      <span className={colorClass}>{node}</span>
    );
  }

  const link = classifyNotionLink(item.href, context.pageIdToPath);
  if (link) {
    node = <NotionAnchor link={link}>{node}</NotionAnchor>;
  }

  return node;
}

export function RichText({
  text,
  context,
}: {
  text: RichTextItemResponse[];
  context: NotionRenderContext;
}) {
  return (
    <>
      {text.map((item, i) => (
        <RichTextItem key={i} item={item} context={context} />
      ))}
    </>
  );
}
