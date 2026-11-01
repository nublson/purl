import type { ComponentProps } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ReaderImage } from "@/components/reader-image";
import { Typography } from "@/components/typography";
import { isOriginalPageFragment } from "@/lib/reader-view";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";

type Anchor = ComponentProps<"a">;

const HEADING = "mt-10 mb-3 text-foreground font-semibold tracking-[-0.015em] text-balance";

/**
 * Markdown h1 becomes h2: the page title is the only h1. A link into the
 * original page itself (a footnote mark, its ↩) is text: its target isn't
 * here, and opening the original in a new tab isn't what it promised.
 */
const componentsFor = (pageUrl: string): Components => ({
  h1: ({ children }) => (
    <Typography component="h2" className={`${HEADING} text-2xl leading-tight`}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography component="h2" className={`${HEADING} text-2xl leading-tight`}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography component="h3" className={`${HEADING} text-xl leading-tight`}>
      {children}
    </Typography>
  ),
  h4: ({ children }) => (
    <Typography component="h4" className={`${HEADING} text-lg leading-tight`}>
      {children}
    </Typography>
  ),
  h5: ({ children }) => (
    <Typography component="h5" className={`${HEADING} text-lg`}>
      {children}
    </Typography>
  ),
  h6: ({ children }) => (
    <Typography component="h6" className={`${HEADING} text-lg`}>
      {children}
    </Typography>
  ),
  p: ({ children }) => (
    <Typography className="my-4 text-lg leading-8 text-foreground">
      {children}
    </Typography>
  ),
  ul: ({ children }) => (
    <ul className="my-4 list-disc space-y-2 pl-6 text-lg leading-8 text-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 list-decimal space-y-2 pl-6 text-lg leading-8 text-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <Typography component="li" className="text-lg leading-8 text-foreground">
      {children}
    </Typography>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-6 border-s-2 border-border ps-4 text-muted-foreground *:text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-6 overflow-x-auto rounded-lg border bg-muted p-4 text-sm leading-6">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={`${className ?? ""} font-mono text-[0.9em]`}>{children}</code>
  ),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-left text-base">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b px-3 py-2 font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b px-3 py-2">{children}</td>,
  a: ({ href, children }: Anchor) =>
    href && isOriginalPageFragment(href, pageUrl) ? (
      children
    ) : (
      <Typography
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // The surrounding text's size, not Typography's default.
        className="text-[1em] leading-[inherit] text-foreground underline underline-offset-4"
      >
        {children}
      </Typography>
    ),
  img: ({ src, alt }) => {
    const safe = typeof src === "string" ? safeRemoteImgSrc(src) : null;
    return safe ? <ReaderImage src={safe} alt={alt ?? ""} /> : null;
  },
});

/** A reader view's Markdown. No raw HTML: nothing from the page can run. */
export function ReaderContent({
  markdown,
  truncated,
  pageUrl,
}: {
  markdown: string;
  truncated: boolean;
  /** The saved page's URL: links back into it aren't links here. */
  pageUrl: string;
}) {
  // 60ch of the column's 16px text keeps the 18px body near 70 characters a line.
  return (
    <div className="mt-8 max-w-[60ch]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={componentsFor(pageUrl)}
      >
        {markdown}
      </Markdown>
      {truncated ? (
        <Typography size="small" className="mt-8">
          The reader view was cut here. The rest is on the original page.
        </Typography>
      ) : null}
    </div>
  );
}
