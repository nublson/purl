import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import bundleAnalyzer from "@next/bundle-analyzer";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

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

const nextConfig: NextConfig = {
  // `.next` unless NEXT_DIST_DIR says otherwise: the e2e dev server (.env.e2e)
  // uses its own, so it never shares a cache with your `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Next's default, set explicitly: production builds don't emit browser
  // source maps, so the client code structure isn't published.
  productionBrowserSourceMaps: false,
  // Supabase's Vercel integration names these without NEXT_PUBLIC_, so they
  // reach the browser (Realtime) through here. Both are public: the project
  // URL and the anon key. Never add a secret to this list. Next inlines these
  // at build time in server code too (getAdminSupabase reads the build's
  // SUPABASE_URL): fine on Vercel, where build and runtime env match; a
  // runtime-only env (self-hosting) would need them at build as well.
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  },
  experimental: {
    // reicon-react's barrel re-exports ~2,700 icons; import only the ones used
    // (lucide-react, which it replaced, is on Next's built-in list).
    optimizePackageImports: ["reicon-react"],
  },
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
      // Shared folders live at /@username/slug; /u/... is only the
      // internal route behind that rewrite.
      {
        source: "/u/:username/:slug",
        destination: "/@:username/:slug",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    // App directory segments can't start with "@" (that's parallel routes),
    // so the public /@username/slug URL is served by /u/[username]/[slug].
    return [{ source: "/@:username/:slug", destination: "/u/:username/:slug" }];
  },
  async headers() {
    // X-Frame-Options and friends everywhere; the CSP in production only.
    // See src/lib/security-headers.ts.
    return [{ source: "/:path*", headers: buildSecurityHeaders() }];
  },
};

export default withBundleAnalyzer(withSerwist(nextConfig));
