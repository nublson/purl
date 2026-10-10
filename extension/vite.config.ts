import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

const PRODUCTION_URL = "https://purl.live";

/**
 * Writes manifest.json into dist/ after the build. The source manifest only
 * allows the production site; `npm run dev` adds the local server it talks to
 * (VITE_PURL_URL), so a store build can never carry a localhost permission.
 */
function manifestPlugin(isDev: boolean, purlUrl: string): Plugin {
  return {
    name: "purl-manifest",
    closeBundle() {
      const src = path.resolve(__dirname, "public/manifest.json");
      const dest = path.resolve(__dirname, "dist/manifest.json");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const manifest: any = JSON.parse(fs.readFileSync(src, "utf-8"));
      const hosts: string[] = manifest.host_permissions;

      if (isDev) {
        const local = `${new URL(purlUrl).origin}/*`;
        if (!hosts.includes(local)) hosts.push(local);
        manifest.name = `${manifest.name} (dev)`;
      } else if (hosts.some((h) => h !== `${PRODUCTION_URL}/*`)) {
        throw new Error(
          `public/manifest.json must only allow ${PRODUCTION_URL}/*, found: ${hosts.join(", ")}`,
        );
      }

      fs.writeFileSync(dest, JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig(({ mode }) => {
  // `npm run dev` builds with --mode development, which also reads
  // .env.development; a production build only ever reads .env(.production).
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const isDev = mode === "development";
  // Empty counts as unset (`??` would have baked an empty address in).
  const purlUrl = (env.VITE_PURL_URL || PRODUCTION_URL).replace(/\/+$/, "");

  if (!isDev && purlUrl !== PRODUCTION_URL) {
    throw new Error(
      `A production build must talk to ${PRODUCTION_URL}, but VITE_PURL_URL is ${purlUrl}. ` +
        "Remove it from .env / .env.production (local development belongs in .env.development).",
    );
  }

  return {
    define: {
      // Replaced at build time so the value is baked into background.js
      __PURL_URL__: JSON.stringify(purlUrl),
    },
    plugins: [manifestPlugin(isDev, purlUrl)],
    build: {
      // Minification must be disabled: chrome.scripting.executeScript serializes
      // functions via .toString(), which breaks with minified variable names.
      minify: false,
      rollupOptions: {
        input: { background: "src/background.ts" },
        output: {
          entryFileNames: "[name].js",
          format: "es",
        },
      },
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
