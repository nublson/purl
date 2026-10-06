import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          name: "lucide-react",
          message:
            "Icons come from reicon-react. shadcn components still generate lucide-react imports: swap them for the Reicon equivalents (see CLAUDE.md).",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value='reicon-react'] ImportNamespaceSpecifier",
          message:
            "Use named per-icon imports from reicon-react instead of namespace imports.",
        },
        {
          selector:
            "ImportDeclaration[source.value='radix-ui'] ImportNamespaceSpecifier",
          message:
            "Use named imports from radix-ui instead of namespace imports.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Serwist build output (minified bundle)
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
    "public/swe-worker-*.js.map",
    // Playwright output
    "test-results/**",
    "playwright-report/**",
    // Claude Code worktrees: other checkouts, with their own .next output
    ".claude/**",
  ]),
]);

export default eslintConfig;
