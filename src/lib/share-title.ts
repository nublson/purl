/**
 * A page's title in link previews (`og:title`, `twitter:title`) and its
 * preview image's alt text: always led by the product, "Purl | MCP", so a
 * saved or shared link reads as Purl's wherever it lands. The tab title
 * keeps the app's "%s · Purl".
 */
export function shareTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed ? `Purl | ${trimmed}` : "Purl";
}
