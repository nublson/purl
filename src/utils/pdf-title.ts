/** Derive a display title from a PDF URL path (shared with server scrape fallback). */
export function derivePdfTitleFromUrl(url: string, domain: string): string {
  try {
    const parsed = new URL(url);
    const fileName = parsed.pathname.split("/").pop() ?? "";
    const withoutPdf = decodeURIComponent(fileName).replace(/\.pdf$/i, "");
    const normalized = withoutPdf.replace(/[-_]+/g, " ").trim();
    return normalized || domain;
  } catch {
    return domain;
  }
}
