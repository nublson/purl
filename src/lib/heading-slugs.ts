/** Lowercase, accent-free, hyphenated anchor id for a heading's text. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/** Slugs for one page: the first use is plain, repeats get -2, -3… */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const slug = slugify(text);
    const count = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, count);
    return count === 1 ? slug : `${slug}-${count}`;
  };
}
