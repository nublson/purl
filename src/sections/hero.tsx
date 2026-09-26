import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HeroSection() {
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
        <Button asChild size="lg">
          <Link href="/signup">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </section>
  );
}
