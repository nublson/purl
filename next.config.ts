import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import bundleAnalyzer from "@next/bundle-analyzer";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/csp-header";

function getSerwistRevision(): string {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim();
  if (fromEnv) return fromEnv;
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  });
  const stdout = result.stdout?.trim();
  if (stdout) return stdout;
  return randomUUID();
}

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/~offline", revision: getSerwistRevision() },
  ],
  disable: process.env.NODE_ENV === "development",
});

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  // Static HTML under .next/analyze/ is often a blank treemap when opened as file://
  // (FoamTree/WebGL + large inline data). After `pnpm analyze`, run `pnpm analyze:view`
  // and open http://localhost:3456/client over HTTP (`serve` 301s /client.html → /client).
  openAnalyzer: false,
});

const BASE_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Legacy fallback for the CSP's `frame-ancestors 'none'` (older browsers),
  // and the only framing protection in dev, where the CSP isn't sent.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Next's default, set explicitly: production builds don't emit browser
  // source maps, so the client code structure isn't published.
  productionBrowserSourceMaps: false,
  async redirects() {
    // The in-app AI chat was removed; keep old bookmarks and PWA shortcuts working.
    return [
      { source: "/ai", destination: "/home", permanent: true },
      { source: "/chat", destination: "/home", permanent: true },
      { source: "/chat/:path*", destination: "/home", permanent: true },
      // The landing page ("/") is now the only signed-out page — email/password
      // sign-in is gone in favor of Google/GitHub OAuth, so these no longer exist.
      { source: "/login", destination: "/", permanent: true },
      { source: "/signup", destination: "/", permanent: true },
      { source: "/verify-email", destination: "/", permanent: true },
    ];
  },
  async headers() {
    if (process.env.NODE_ENV !== "production") {
      return [{ source: "/:path*", headers: [...BASE_SECURITY_HEADERS] }];
    }
    return [
      {
        source: "/:path*",
        headers: [
          ...BASE_SECURITY_HEADERS,
          {
            key: "Content-Security-Policy",
            value: buildContentSecurityPolicy(),
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(withSerwist(nextConfig));
