/** Languages the static pages' code blocks highlight (shiki grammars). */
export const HIGHLIGHT_LANGUAGES = [
  "bash",
  "json",
  "typescript",
  "javascript",
  "tsx",
  "http",
  "python",
  "yaml",
  "markdown",
  "diff",
  "toml",
] as const;

export type HighlightLanguage = (typeof HIGHLIGHT_LANGUAGES)[number];

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  shell: "bash",
  zsh: "bash",
  sh: "bash",
  yml: "yaml",
  md: "markdown",
  py: "python",
};

/** Notion's code language label → a highlight language; null is plain text. */
export function normalizeLanguage(
  label: string | null | undefined,
): HighlightLanguage | null {
  const key = (label ?? "").trim().toLowerCase();
  const name = ALIASES[key] ?? key;
  return (HIGHLIGHT_LANGUAGES as readonly string[]).includes(name)
    ? (name as HighlightLanguage)
    : null;
}

// The API sends Notion's language values in lowercase ("javascript").
const DISPLAY_NAMES: Record<string, string> = {
  bash: "Bash",
  shell: "Shell",
  json: "JSON",
  typescript: "TypeScript",
  javascript: "JavaScript",
  tsx: "TSX",
  jsx: "JSX",
  http: "HTTP",
  python: "Python",
  yaml: "YAML",
  markdown: "Markdown",
  diff: "Diff",
  toml: "TOML",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
};

/** The label shown on a code block: the language's name, or "Plain text". */
export function codeLanguageLabel(label: string | null | undefined): string {
  const text = (label ?? "").trim();
  const key = text.toLowerCase();
  if (!text || key === "plain text" || key === "plaintext" || key === "text") {
    return "Plain text";
  }
  return DISPLAY_NAMES[key] ?? text.charAt(0).toUpperCase() + text.slice(1);
}
