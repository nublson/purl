import { PearlWord } from "@/components/landing/pearl-word";
import { Logo } from "@/components/logo";
import { ProviderButtons } from "@/components/provider-buttons";
import { Typography } from "@/components/typography";
import type { ProviderId } from "@/lib/auth-providers";
import { Fragment, type CSSProperties } from "react";

const WORDS = ["A", "home", "for", "your"] as const;

function wordStyle(i: number) {
  return { "--i": i } as CSSProperties;
}

export function LandingHero({ providers }: { providers: ProviderId[] }) {
  return (
    <section
      aria-labelledby="landing-title"
      className="flex w-full flex-col items-center gap-8 pt-12 text-center sm:pt-16 md:pt-20"
    >
      <div className="flex flex-col items-center gap-5">
        {/* The brand mark: centered on the hero's axis, the first beat of the
            arrival. Its alt text names the product (there's no wordmark). */}
        <div data-landing-block="mark">
          <Logo size={40} />
        </div>
        <Typography component="h1" variant="h1" id="landing-title">
          {WORDS.map((word, i) => (
            <Fragment key={word}>
              <span data-landing-word style={wordStyle(i)}>
                {word}
              </span>{" "}
            </Fragment>
          ))}
          <span data-landing-word style={wordStyle(4)}>
            <PearlWord>pearls</PearlWord>
          </span>
        </Typography>
        <div data-landing-block="sub">
          <Typography className="mx-auto max-w-[48ch] text-pretty text-lg">
            The calm read-it-later app. Save links, PDFs, videos and audio to
            one quiet list, and read them when you’re ready.
          </Typography>
        </div>
      </div>
      <div
        data-landing-block="actions"
        className="flex w-full flex-col items-center gap-4"
      >
        <ProviderButtons
          providers={providers}
          className="sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center"
        />
        <Typography size="small">Free · 1,000 links · No ads · No AI</Typography>
      </div>
    </section>
  );
}
