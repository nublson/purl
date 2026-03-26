import previewAppDesktop from "@/assets/preview_app_desktop.svg";
import SectionSeparator from "@/components/section-separator";
import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function HeroSection() {
  return (
    <section
      id="hero"
      className="w-full h-screen overflow-hidden flex flex-col items-center justify-between gap-16 pt-28"
    >
      <div className="w-full flex flex-col items-center justify-center gap-10">
        <div className="text-center flex flex-col gap-8">
          <Typography
            component="span"
            size="mini"
            className="text-muted-foreground"
          >
            YOUR PERSONAL KNOWLEDGE BASE
          </Typography>
          <div className="text-center flex flex-col gap-6">
            <h1 className="main-heading">
              Save Anything. <br /> Understand it deeply.
            </h1>
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

      <Image
        src={previewAppDesktop}
        alt="Purl preview"
        width={780}
        height={507}
        className="w-full h-auto"
      />
      <SectionSeparator />
    </section>
  );
}
