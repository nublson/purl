import "server-only";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { HighlightLanguage } from "@/lib/code-languages";

type Root = ReturnType<HighlighterCore["codeToHast"]>;
type Element = Extract<Root["children"][number], { type: "element" }>;

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighter) {
    // Each import is written out so the bundler can trace it.
    highlighter = createHighlighterCore({
      themes: [
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ],
      langs: [
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/json.mjs"),
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/tsx.mjs"),
        import("shiki/langs/http.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/yaml.mjs"),
        import("shiki/langs/markdown.mjs"),
        import("shiki/langs/diff.mjs"),
        import("shiki/langs/toml.mjs"),
      ],
      engine: createJavaScriptRegexEngine(),
    }).catch((error: unknown) => {
      highlighter = null; // retry on the next call
      throw error;
    });
  }
  return highlighter;
}

/**
 * Highlights `code` and returns the hast `<code>` element; every token carries
 * `--shiki-light` and `--shiki-dark`. Throws if highlighting fails.
 */
export async function highlightCode(
  code: string,
  language: HighlightLanguage,
): Promise<Element> {
  const instance = await getHighlighter();
  const root: Root = instance.codeToHast(code, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
  const pre = root.children.find(
    (node): node is Element => node.type === "element" && node.tagName === "pre",
  );
  const codeElement = pre?.children.find(
    (node): node is Element => node.type === "element" && node.tagName === "code",
  );
  if (!codeElement) throw new Error("Highlighter returned no <code> element");
  return codeElement;
}
