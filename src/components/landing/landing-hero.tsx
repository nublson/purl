import { BrandMark } from "@/components/brand-mark";
import { ProviderButtons } from "@/components/provider-buttons";
import { Typography } from "@/components/typography";
import type { ProviderId } from "@/lib/auth-providers";
import { Fragment, type CSSProperties } from "react";

const WORDS = ["A", "home", "for", "your", "pearls."] as const;

function wordStyle(i: number) {
  return { "--i": i } as CSSProperties;
}

export function LandingHero({ providers }: { providers: ProviderId[] }) {
  return (
    // Left-aligned on the product panel's edge: the same md:px-[6%] as
    // ProductFrame, measured against the same parent, so both start at one x.
    <section
      aria-labelledby="landing-title"
      className="flex w-full flex-col items-start pt-12 sm:pt-16 md:px-[6%] md:pt-20"
    >
      {/* The brand mark, the first beat of the arrival. The wordmark names
          the product, so the pearl itself is decorative. */}
      <div data-landing-block="mark">
        <BrandMark />
      </div>
      {/* What's new, read before the headline: a quiet pill, not a link
          (there's no page to send it to). "New" reads as its own word to
          screen readers too. */}
      <div data-landing-block="badge" className="mt-8 md:mt-10">
        <Typography
          component="p"
          size="small"
          className="inline-flex items-center gap-2 rounded-full border border-border py-1 ps-1 pe-3"
        >
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            New
          </span>
          <span className="sr-only">: </span>
          Upload images, video and audio
        </Typography>
      </div>
      <Typography
        component="h1"
        variant="h1"
        id="landing-title"
        className="mt-4 md:mt-5"
      >
        {WORDS.map((word, i) => (
          <Fragment key={word}>
            {i > 0 && " "}
            <span data-landing-word style={wordStyle(i)}>
              {word}
            </span>
          </Fragment>
        ))}
      </Typography>
      <div data-landing-block="sub" className="mt-3.5">
        <Typography className="max-w-[42ch] text-pretty text-lg">
          Save the links and files worth keeping, all in one calm place.
          Share a folder when one’s worth passing on.
        </Typography>
      </div>
      <div
        data-landing-block="actions"
        className="mt-8 flex w-full flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5"
      >
        <ProviderButtons
          providers={providers}
          className="max-w-none sm:w-auto sm:flex-row sm:flex-wrap"
        />
      </div>
    </section>
  );
}
