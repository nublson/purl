import { Logo } from "@/components/logo";
import { Typography } from "@/components/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import {
  ChevronMark,
  GlobeMark,
  NewspaperMark,
  PaulGrahamMark,
  PdfMark,
  VideoMark,
} from "./preview-favicons";

interface PreviewLink {
  title: string;
  domain: string;
  icon: ReactNode;
}

const LINKS: PreviewLink[] = [
  {
    title: "How to read more books",
    domain: "paulgraham.com",
    icon: <PaulGrahamMark />,
  },
  {
    title: "Designing calm interfaces",
    domain: "youtube.com",
    icon: <VideoMark />,
  },
  {
    title: "The case for slow software",
    domain: "nytimes.com",
    icon: <NewspaperMark />,
  },
  { title: "Attention is a garden", domain: "arxiv.org", icon: <PdfMark /> },
];

/** Placeholder rows below the links; widths vary so they read as titles. */
const SKELETON_WIDTHS = ["w-3/5", "w-2/5", "w-1/2"];

/** The app's row grid (see LinkItem): 48px, 56px on phones (its menu button sets that height). */
const ROW =
  "grid min-h-12 grid-cols-[20px_1fr] items-start gap-4 p-2 max-md:min-h-14 max-md:grid-cols-[24px_1fr] max-md:py-3";

/** Phones show the first 3 rows and 2 skeletons (index 5+ is hidden). */
function rowIndexClass(index: number) {
  return index === 3 || index === 6 ? "max-md:hidden" : undefined;
}

/** Fades the whole panel (rows and side borders) into the page at its bottom. */
const FADE_MASK: CSSProperties = {
  maskImage: "linear-gradient(to bottom, #000 55%, transparent)",
  WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent)",
};

function indexStyle(index: number) {
  return { "--i": index } as CSSProperties;
}

/**
 * The panel's frame, shared by the still picture and the live demo: border,
 * rounded top, a bottom fade into the page and the pearl glow behind its top
 * edge.
 * `data-landing-panel` is the arrival animation's hook. `decorative` hides
 * the still picture from assistive tech; the demo is real, interactive UI,
 * named by `label` as a region so its controls read as a demo.
 */
export function ProductFrame({
  header,
  children,
  className,
  decorative = false,
  label,
}: {
  header: ReactNode;
  children: ReactNode;
  className?: string;
  decorative?: boolean;
  label?: string;
}) {
  return (
    <div
      aria-hidden={decorative ? "true" : undefined}
      role={label ? "region" : undefined}
      aria-label={label}
      className={cn("relative isolate mx-auto w-full md:px-[6%]", className)}
    >
      {/* The glow sits behind the panel: a box over the panel's top (the
          panel's mask would clip its own shadow) casting light up from its
          top edge; short, so the sides don't glow down to where the panel
          fades out. The panel is opaque, so none shows through it. The
          arrival hook is on this wrapper, so the glow arrives with it. */}
      <div data-landing-panel className="relative">
        <div
          className="pearl-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 rounded-t-2xl"
          aria-hidden="true"
        />
        {/* The card over the page at 80%, made opaque: the color the
            translucent panel had. */}
        <div
          className="relative overflow-hidden rounded-t-2xl border border-b-0 bg-[color-mix(in_oklab,var(--card)_80%,var(--background))]"
          style={FADE_MASK}
        >
          {header}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A still, decorative picture of the app (one shared folder and its rows)
 * under the hero. No data, providers or client JS; it is the
 * fallback when the live demo has no data. `data-landing-panel` / `data-landing-row`
 * (with `--i`) are hooks for the arrival animation.
 */
export function ProductPreview({ className }: { className?: string }) {
  return (
    <ProductFrame
      decorative
      className={className}
      header={
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={20} />
            <span className="h-4 w-px shrink-0 bg-border" />
            <Typography
              component="span"
              size="small"
              className="flex min-w-0 items-center gap-1.5 font-medium text-foreground"
            >
              <span aria-hidden>📚</span>
              <span className="truncate">Reading list</span>
              <ChevronMark className="size-4 shrink-0 text-muted-foreground" />
            </Typography>
          </div>
          {/* Inert copy of FolderSharePopover's trigger, shared state. */}
          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[min(var(--radius-md),10px)] bg-secondary pl-1.5 pr-2.5 text-sm font-medium text-secondary-foreground">
            <GlobeMark className="size-4" />
            Public
          </span>
        </div>
      }
    >
      <div className="wrapper-private px-1 py-2 md:px-2">
        {LINKS.map((link, index) => (
          <div
            key={link.title}
            data-landing-row
            style={indexStyle(index)}
            className={cn(ROW, rowIndexClass(index))}
          >
            <div className="mt-1.5 flex h-[1lh] items-center text-sm leading-normal max-md:mt-1 max-md:text-base max-md:leading-6">
              <div
                className="size-5 overflow-hidden rounded-[3px] max-md:size-6"
              >
                {link.icon}
              </div>
            </div>
            <div className="min-w-0 pt-1.5 max-md:pt-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <Typography
                  size="small"
                  className="block truncate font-medium text-accent-foreground max-md:text-base max-md:leading-6"
                >
                  {link.title}
                </Typography>
                <Typography
                  component="span"
                  size="small"
                  className="hidden shrink-0 font-normal md:block"
                >
                  {link.domain}
                </Typography>
              </div>
            </div>
          </div>
        ))}
        {SKELETON_WIDTHS.map((width, i) => {
          const index = LINKS.length + i;
          return (
            <div
              key={width}
              data-landing-row
              style={indexStyle(index)}
              className={cn(ROW, "items-center", rowIndexClass(index))}
            >
              <Skeleton className="size-5 rounded-[3px] max-md:size-6" />
              <Skeleton className={cn("h-3.5 max-md:h-4", width)} />
            </div>
          );
        })}
      </div>
    </ProductFrame>
  );
}
