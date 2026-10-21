/**
 * What the public pages may be used for (contentsignals.org): not for
 * training models, fine for search and for answering a user's question.
 */
export const CONTENT_SIGNAL = "ai-train=no, search=yes, ai-input=yes";

export function buildRobotsTxt(baseUrl: string): string {
  return [
    "User-Agent: *",
    `Content-Signal: ${CONTENT_SIGNAL}`,
    "Allow: /",
    "Disallow: /home",
    "Disallow: /api/",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
    "",
  ].join("\n");
}
