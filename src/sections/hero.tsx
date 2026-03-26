import PreviewApp from "@/components/preview-app";
import SectionSeparator from "@/components/section-separator";
import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section
      id="hero"
      className="relative w-full max-h-[842px] overflow-hidden flex flex-col items-center justify-between gap-16 pt-28"
    >
      <div className="w-full flex flex-col items-center justify-center gap-10">
        <div className="text-center flex flex-col gap-8">
          <Typography
            component="span"
            size="mini"
            className="text-muted-foreground uppercase"
          >
            Your personal knowledge base
          </Typography>
          <div className="text-center flex flex-col gap-6">
            <Typography component="h1" variant="h1">
              Save Anything. <br /> Understand it deeply.
            </Typography>
            <Typography className="text-center font-light">
              Purl captures your links, PDFs, videos, and audio — then <br />{" "}
              lets you ask anything about what you&apos;ve saved.
            </Typography>
          </div>
        </div>
        <div className="w-full flex items-center justify-center gap-4">
          <Button asChild>
            <Link href="/signup">Try for free</Link>
          </Button>
          <Button variant="outline">
            <Link href={"#"}>See how it works</Link>
          </Button>
        </div>
      </div>

      <PreviewApp />
      <SectionSeparator className="absolute bottom-0" />
    </section>
  );
}
