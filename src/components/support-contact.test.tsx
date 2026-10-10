import { describe, expect, it } from "vitest";
import { renderToHtml } from "@/components/notion-blocks/test-utils";
import { SupportContact } from "./support-contact";

describe("SupportContact", () => {
  it("shows the address as a mailto link with a subject", async () => {
    const html = await renderToHtml(<SupportContact email="help@purl.live" />);
    expect(html).toContain('href="mailto:help@purl.live?subject=Purl%20support"');
    expect(html).toContain(">help@purl.live<");
    // A mail link, not a new tab.
    expect(html).not.toContain("_blank");
    expect(html).not.toContain("opens in a new tab");
  });

  it("asks for what helps us answer", async () => {
    const html = await renderToHtml(<SupportContact email="help@purl.live" />);
    expect(html).toContain("what happened");
    expect(html).toContain("the address of the page");
  });

  it("is a labelled section", async () => {
    const html = await renderToHtml(<SupportContact email="help@purl.live" />);
    expect(html).toMatch(/<section [^>]*aria-labelledby="support-contact-title"/);
    expect(html).toMatch(/<h2 [^>]*id="support-contact-title"[^>]*>Contact us</);
  });

  it("falls back to Feedback and GitHub when there's no address", async () => {
    const html = await renderToHtml(<SupportContact email={null} />);
    expect(html).not.toContain("mailto:");
    expect(html).toContain("Feedback");
    expect(html).toContain('href="https://github.com/nublson/purl/issues"');
    expect(html).toContain('target="_blank"');
  });
});
