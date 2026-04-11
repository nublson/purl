/**
 * Returns true when assistant text likely needs react-markdown (GFM).
 * Plain-text replies skip the async markdown chunk.
 */
export function assistantContentLikelyUsesMarkdown(content: string): boolean {
  const t = content.trim();
  if (!t) return false;

  if (t.includes("```")) return true;

  if (/`[^`]+`/.test(t)) return true;

  if (/\[[^\]]*\]\([^)]+\)/.test(t)) return true;

  if (/(^|\n)\s{0,3}#{1,6}(\s|$)/m.test(content)) return true;

  if (/(^|\n)\s*[-*+]\s/m.test(content)) return true;

  if (/(^|\n)\s*\d+\.\s/m.test(content)) return true;

  if (/(^|\n)\s*>/m.test(content)) return true;

  if (/\*\*[\s\S]+?\*\*/.test(t)) return true;

  if (/__[\s\S]+?__/.test(t)) return true;

  if (/\*[^*\n]+\*/.test(t)) return true;

  if (/_[^_\n]+_/.test(t)) return true;

  return false;
}
