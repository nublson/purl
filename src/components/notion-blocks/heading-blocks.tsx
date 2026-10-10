import type { ReactNode } from "react";
import { Typography } from "@/components/typography";
import type { NotionBlock } from "@/lib/notion";
import { RichText } from "./rich-text";
import type { NotionRenderContext } from "./types";

type Props = {
  block: NotionBlock;
  context: NotionRenderContext;
  /** Renders nested children (toggleable headings). */
  children?: ReactNode;
};

const ANCHOR =
  "shrink-0 rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:opacity-100";

export function HeadingBlock({ block, context, children }: Props) {
  if (
    block.type !== "heading_1" &&
    block.type !== "heading_2" &&
    block.type !== "heading_3"
  ) {
    return null;
  }
  const data =
    block.type === "heading_1"
      ? block.heading_1
      : block.type === "heading_2"
        ? block.heading_2
        : block.heading_3;
  const text = data.rich_text.map((t) => t.plain_text).join("");
  // A blank heading would get an empty id and an unnamed anchor.
  if (text.trim() === "") return <>{children}</>;
  const id = context.slug(text);
  const content = <RichText text={data.rich_text} context={context} />;

  const heading =
    block.type === "heading_1" ? (
      <Typography variant="h3" component="h2" id={id} className="scroll-mt-8">
        {content}
      </Typography>
    ) : block.type === "heading_2" ? (
      <Typography variant="h4" component="h3" id={id} className="scroll-mt-8">
        {content}
      </Typography>
    ) : (
      <Typography
        component="h4"
        id={id}
        className="scroll-mt-8 font-semibold text-foreground"
      >
        {content}
      </Typography>
    );

  // Space above a heading is twice the gap below it, so it reads with the
  // section it opens. The anchor sits beside the heading, not inside it, so
  // the heading's accessible name is only its text.
  const spacing = block.type === "heading_1" ? "mt-8" : "mt-4";

  return (
    <>
      <div className={`group flex items-baseline gap-2 ${spacing}`}>
        {heading}
        <a
          href={`#${id}`}
          aria-label={`Link to section: ${text}`}
          className={ANCHOR}
        >
          <span aria-hidden="true">#</span>
        </a>
      </div>
      {children}
    </>
  );
}
