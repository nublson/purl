/**
 * F-004 / REACT-URL-001: Markdown link targets are untrusted (e.g. model output).
 * Without scheme checks, `javascript:` and similar URLs can enable phishing or unsafe navigation.
 */
export function sanitizeChatMarkdownHref(
  href: string | undefined,
): string | undefined {
  if (href == null) return undefined;
  const trimmed = href.trim();
  if (!trimmed) return undefined;

  // In-page fragment only; disallow whitespace or extra "#" (e.g. confusing payloads).
  if (trimmed.startsWith("#")) {
    if (/\s/.test(trimmed) || trimmed.slice(1).includes("#")) {
      return undefined;
    }
    return trimmed;
  }

  // Same-site path only; reject protocol-relative URLs (//evil.com).
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) return undefined;
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  return url.href;
}
