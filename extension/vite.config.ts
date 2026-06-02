import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Writes a production-safe manifest.json into dist/ after the build.
 * In development (watch) mode the source manifest is used as-is so
 * localhost permissions remain available for local testing.
 */
function manifestPlugin(isDev: boolean): Plugin {
  return {
    name: "purl-manifest",
    closeBundle() {
      const src = path.resolve(__dirname, "public/manifest.json");
      const dest = path.resolve(__dirname, "dist/manifest.json");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const manifest: any = JSON.parse(fs.readFileSync(src, "utf-8"));

      if (!isDev) {
        // Strip localhost from host_permissions for store submissions
        manifest.host_permissions = (
          manifest.host_permissions as string[]
        ).filter((p) => !p.startsWith("http://localhost"));
      }

      fs.writeFileSync(dest, JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const purlUrl = env.VITE_PURL_URL ?? "https://purl.nublson.com";
  const isDev = mode === "development";

  return {
    define: {
      // Replaced at build time so the value is baked into background.js
      __PURL_URL__: JSON.stringify(purlUrl),
    },
    plugins: [manifestPlugin(isDev)],
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
