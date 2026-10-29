import { Fragment, type ReactNode } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { type BlockProps, RichText } from "notionic";
import { Typography } from "@/components/typography";
import { highlightCode } from "@/lib/code-highlight";
import { codeLanguageLabel, normalizeLanguage } from "@/lib/code-languages";
import { CopyCodeButton } from "./copy-code-button";

/** notionic's code block, highlighted on the server, with a copy button. */
export async function CodeBlock({ block, context }: BlockProps<"code">) {
  const data = block.code;
  const code = data.rich_text.map((item) => item.plain_text).join("");
  const label = codeLanguageLabel(data.language);
  const language = normalizeLanguage(data.language);

  let content: ReactNode = code;
  if (language) {
    try {
      const element = await highlightCode(code, language);
      // The tokens only: our own <code> wraps them (the element is a <code> itself).
      content = toJsxRuntime(
        { type: "root", children: element.children },
        { Fragment, jsx, jsxs },
      );
    } catch (error) {
      console.warn(
        `Static page: could not highlight code block ${block.id}`,
        error,
      );
    }
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        {/* foreground/70, not muted: muted on bg-muted is 4.35:1 in light mode. */}
        <Typography component="span" size="mini" className="text-foreground/70">
          {label}
        </Typography>
        <CopyCodeButton code={code} />
      </div>
      <pre
        tabIndex={0}
        role="region"
        aria-label={`Code, ${label}`}
        // Inset ring: the figure's overflow-hidden would clip an outer one.
        className="overflow-x-auto px-4 py-3 font-mono text-[0.8125rem] leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <code className="shiki">{content}</code>
      </pre>
      {data.caption.length > 0 && (
        <figcaption className="border-t border-border px-4 py-2">
          <Typography component="span" size="small">
            <RichText text={data.caption} context={context} />
          </Typography>
        </figcaption>
      )}
    </figure>
  );
}
