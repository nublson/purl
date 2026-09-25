import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal"],
  display: "swap",
});

const description =
  "Purl is a read-it-later app. Save any link, PDF, video, or audio file and keep it all in one place.";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} h-full`}
      suppressHydrationWarning
    >
      <body className={`antialiased h-full flex flex-col relative`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}

            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
