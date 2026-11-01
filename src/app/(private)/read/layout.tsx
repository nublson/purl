import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import {
  STATIC_PAGE_COLUMN,
  STATIC_PAGE_MARK_LINK,
} from "@/components/static-page";
import { Typography } from "@/components/typography";

/** The read page's frame: the static pages' mark and column, no app chrome. */
export default function ReadLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wrapper-public flex w-full flex-1 flex-col px-4 pb-24 md:px-6 lg:px-12">
      <header className={`${STATIC_PAGE_COLUMN} pt-12 sm:pt-16 md:pt-20`}>
        <Typography
          component="a"
          href="/"
          aria-label="Purl, home"
          className={STATIC_PAGE_MARK_LINK}
        >
          <BrandMark />
        </Typography>
      </header>
      <main className={`${STATIC_PAGE_COLUMN} flex flex-1 flex-col`}>
        {children}
      </main>
    </div>
  );
}
