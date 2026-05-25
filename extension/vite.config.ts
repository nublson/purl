import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const purlUrl = env.VITE_PURL_URL ?? "https://purl.nublson.com";

  return {
    define: {
      // Replaced at build time so the value is baked into background.js
      __PURL_URL__: JSON.stringify(purlUrl),
    },
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
