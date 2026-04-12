import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
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

export default withSentryConfig(withBundleAnalyzer(withSerwist(nextConfig)), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "purl",

  project: "purl",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
