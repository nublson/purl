import { Typography } from "@/components/typography";
import { ProviderButtons } from "@/components/provider-buttons";
import type { ProviderId } from "@/lib/auth-providers";

export default function HeroSection({ providers }: { providers: ProviderId[] }) {
  return (
    <section id="hero" className="wrapper-center gap-12">
      <div className="text-center flex flex-col gap-6">
        <Typography component="h1" variant="h1">
          A home for your pearls
        </Typography>
        <Typography className="mx-auto max-w-[42ch] text-center text-pretty">
          Save links, PDFs, videos, and audio, and keep everything in one
          place.
        </Typography>
      </div>
      <div className="flex items-center justify-center gap-4">
        <ProviderButtons providers={providers} />
      </div>
    </section>
  );
}
