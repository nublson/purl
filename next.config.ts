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
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async redirects() {
    // The in-app AI chat was removed; keep old bookmarks and PWA shortcuts working.
    return [
      { source: "/ai", destination: "/home", permanent: true },
      { source: "/chat", destination: "/home", permanent: true },
      { source: "/chat/:path*", destination: "/home", permanent: true },
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
