import { Typography } from "@/components/typography";

const POINTS = [
  "Save web pages, PDFs, YouTube videos and audio. Purl fills in the title, favicon, description and thumbnail.",
  "Keep links in folders, and share any folder with a public link.",
  "Free for everyone, up to 1,000 saved links. No ads, no AI.",
  "Save from a Chrome extension, the REST API or an MCP server.",
] as const;

/** Plain, visible facts about the product, under the demo. */
export function LandingAbout() {
  return (
    <section
      aria-labelledby="landing-about"
      className="mt-24 w-full md:px-[6%]"
    >
      <Typography component="h2" variant="h4" id="landing-about">
        What Purl does
      </Typography>
      <ul className="mt-4 flex max-w-[60ch] flex-col gap-2">
        {POINTS.map((point) => (
          <Typography component="li" key={point} className="text-pretty">
            {point}
          </Typography>
        ))}
      </ul>
    </section>
  );
}
