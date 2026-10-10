import { Logo } from "@/components/logo";
import { Typography } from "@/components/typography";
import { STATIC_PAGES } from "@/lib/static-pages";

const LINK =
  "inline-flex min-h-8 items-center rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11";

const NAV = [
  ...STATIC_PAGES.map(({ label, path }) => ({
    label,
    href: path,
    external: false,
  })),
  { label: "GitHub", href: "https://github.com/nublson/purl", external: true },
];

export function LandingFooter() {
  return (
    <footer className="mt-24 w-full border-t border-border py-6">
      <div className="flex flex-col items-center gap-3 text-center md:flex-row md:justify-between md:gap-6 md:text-left">
        <div className="flex items-center gap-2.5">
          <Logo size={20} />
          <Typography size="small">
            Made by{" "}
            <Typography
              component="a"
              size="small"
              href="https://github.com/nublson"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              @nublson
            </Typography>
          </Typography>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
            {NAV.map(({ label, href, external }) => (
              <Typography component="li" size="small" key={label}>
                <Typography
                  component="a"
                  size="small"
                  href={href}
                  className={LINK}
                  {...(external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {label}
                </Typography>
              </Typography>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
