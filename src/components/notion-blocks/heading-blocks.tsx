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

  const content = (
    <>
      <RichText text={data.rich_text} context={context} />
      <a
        href={`#${id}`}
        aria-label={`Link to section: ${text}`}
        className="ml-2 rounded-sm font-normal text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:opacity-100"
      >
        #
      </a>
    </>
  );

  const heading =
    block.type === "heading_1" ? (
      <Typography
        variant="h3"
        component="h2"
        id={id}
        className="group mt-8 scroll-mt-8"
      >
        {content}
      </Typography>
    ) : block.type === "heading_2" ? (
      <Typography
        variant="h4"
        component="h3"
        id={id}
        className="group mt-4 scroll-mt-8"
      >
        {content}
      </Typography>
    ) : (
      <Typography
        component="h4"
        id={id}
        className="group mt-2 scroll-mt-8 font-semibold text-foreground"
      >
        {content}
      </Typography>
    );

  return (
    <>
      {heading}
      {children}
    </>
  );
}
