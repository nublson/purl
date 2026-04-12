import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value='lucide-react'] ImportNamespaceSpecifier",
          message:
            "Use named per-icon imports from lucide-react instead of namespace imports.",
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
  ]),
]);

export default eslintConfig;
