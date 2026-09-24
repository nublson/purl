import HeroSection from "@/sections/hero";
import type { Metadata } from "next";

export const metadata: Metadata = {
  description:
    "Purl is a read-it-later app. Save links, PDFs, YouTube videos, and audio in one place.",
};

export default function Home() {
  return (
    <div className="w-full flex flex-col h-full items-center justify-center">
      <HeroSection />
    </div>
  );
}
