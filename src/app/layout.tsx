import { KeyboardInset } from "@/components/keyboard-inset";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { LANDING_SEEN_SCRIPT } from "@/lib/landing-intro";
import { ThemeProvider } from "next-themes";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const description =
  "Purl is a calm place to save and share the links you find. Keep articles, PDFs, videos and audio in folders, and share any folder with a link.";

export const metadata: Metadata = {
  applicationName: "Purl",
  title: {
    default: "Purl",
    template: "%s · Purl",
  },
  description,
  appleWebApp: {
    capable: true,
    title: "Purl",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  metadataBase: new URL(process.env.BASE_URL as string),
  openGraph: {
    type: "website",
    siteName: "Purl",
    title: "Purl",
    description,
    url: process.env.BASE_URL as string,
  },
  twitter: {
    card: "summary_large_image",
    title: "Purl",
    description,
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

/**
 * Toasts sit above the search field pinned to the bottom (1rem + 44px field
 * + a 12px gap = 72px), and above the keyboard while it's open.
 */
const TOAST_BOTTOM = "calc(72px + var(--keyboard-inset, 0px))";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs on every full page load, before paint: marks a returning
            visitor so the landing page renders settled. */}
        <script dangerouslySetInnerHTML={{ __html: LANDING_SEEN_SCRIPT }} />
      </head>
      <body className={`antialiased h-full flex flex-col relative`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}

            {/* Above the search field pinned to the bottom of the app's lists
                (1rem + 44px field + a 12px gap). */}
            <Toaster
              offset={{ bottom: TOAST_BOTTOM }}
              mobileOffset={{ bottom: TOAST_BOTTOM }}
            />
          </TooltipProvider>
        </ThemeProvider>
        <KeyboardInset />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
