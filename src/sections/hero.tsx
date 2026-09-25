import SectionSeparator from "@/components/section-separator";
import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section
      id="hero"
      className="relative w-full h-full overflow-hidden flex flex-col items-center justify-between gap-20 pt-28"
    >
      <div className="w-full flex flex-col items-center justify-center gap-10">
        <div className="text-center flex flex-col gap-8">
          <Typography
            component="span"
            size="mini"
            className="text-muted-foreground uppercase tracking-wider"
          >
            Your personal knowledge base
          </Typography>
          <div className="text-center flex flex-col gap-6">
            <Typography component="h1" variant="h1">
              A home for your pearls
            </Typography>
            <Typography className="mx-auto max-w-[42ch] text-center text-pretty">
              Purl captures your links, PDFs, videos, and audio and keeps
              everything you’ve saved in one place.
            </Typography>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="w-full flex items-center justify-center gap-4">
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </div>

      <SectionSeparator className="absolute bottom-0" />
    </section>
  );
}
