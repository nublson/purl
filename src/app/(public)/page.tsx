import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Purl – Save links. Ask questions. Get answers.",
  description:
    "Purl is an AI-powered read-it-later app. Save any link, and Purl understands and remembers the content so you can ask questions and get answers with sources.",
};

export default function Home() {
  return (
    <div className="flex flex-col gap-4 min-h-screen items-center justify-center">
      <Typography component="h1" variant="h2" className="text-center">
        Save links. Ask questions. Get answers.
      </Typography>
      <Typography size="small" className="max-w-sm text-center">
        Purl is an AI-powered read-it-later app. Save any link, and Purl
        understands and remembers it — so you can ask questions and get answers
        with sources, weeks later.
      </Typography>
      <Typography size="small" className="text-muted-foreground">
        <Button asChild>
          <Link href="/login">Start for free</Link>
        </Button>
      </Typography>
    </div>
  );
}
