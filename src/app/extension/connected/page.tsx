import type { Metadata } from "next";
import { CONSENT_COLUMN } from "@/components/oauth-consent-card";
import { BrandMark } from "@/components/brand-mark";
import { Typography } from "@/components/typography";

export const metadata: Metadata = {
  title: "Browser extension",
  robots: { index: false },
};

/**
 * The browser extension's OAuth callback (the `purl-extension-*` clients' redirect URL).
 * The extension watches its connect tab, takes the code from this address and
 * closes the tab, usually before this renders; the page is only what's left
 * when it doesn't. It never reads or exchanges the code.
 */
export default async function ExtensionConnectedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className={CONSENT_COLUMN}>
      <BrandMark />
      <Typography variant="h3" component="h1" className="mt-8 md:text-3xl">
        {error ? "The extension wasn’t connected" : "Go back to your page"}
      </Typography>
      <Typography className="mt-3 text-pretty">
        {error
          ? "Choose Purl from your browser’s extensions to try again."
          : "If it wasn’t saved, choose Purl there again. You can close this tab."}
      </Typography>
    </div>
  );
}
