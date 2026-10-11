import { describe, expect, it } from "vitest";
import { buildRobotsTxt } from "./robots-txt";

describe("buildRobotsTxt", () => {
  it("keeps the crawl rules, declares content signals and names the sitemap", () => {
    const txt = buildRobotsTxt("https://purl.live");
    expect(txt).toContain("User-Agent: *\nContent-Signal: ai-train=no");
    expect(txt).toContain("Allow: /\nDisallow: /home\nDisallow: /api/");
    expect(txt).toContain("Sitemap: https://purl.live/sitemap.xml");
  });
});
