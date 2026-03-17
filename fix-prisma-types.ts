#!/usr/bin/env tsx
/**
 * Script to fix TypeScript errors in generated Prisma files.
 * Adds explicit type annotations to DbNull, JsonNull, and AnyNull exports
 * to resolve TS2742 errors about non-portable inferred types.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const filesToFix = [
  "src/generated/prisma/internal/prismaNamespace.ts",
  "src/generated/prisma/internal/prismaNamespaceBrowser.ts",
];

const fixes = [
  {
    pattern: /export const DbNull = runtime\.DbNull/g,
    replacement: "export const DbNull: typeof runtime.DbNull = runtime.DbNull",
  },
  {
    pattern: /export const JsonNull = runtime\.JsonNull/g,
    replacement:
      "export const JsonNull: typeof runtime.JsonNull = runtime.JsonNull",
  },
  {
    pattern: /export const AnyNull = runtime\.AnyNull/g,
    replacement:
      "export const AnyNull: typeof runtime.AnyNull = runtime.AnyNull",
  },
];

function fixFile(filePath: string): boolean {
  const fullPath = join(process.cwd(), filePath);

  if (!existsSync(fullPath)) {
    console.log(`Skipped (not found): ${filePath}`);
    return false;
  }

  try {
    let content = readFileSync(fullPath, "utf-8");
    let modified = false;

    for (const fix of fixes) {
      if (fix.pattern.test(content)) {
        content = content.replace(fix.pattern, fix.replacement);
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(fullPath, content, "utf-8");
      console.log(`Fixed: ${filePath}`);
      return true;
    }
    console.log(`No changes needed: ${filePath}`);
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    throw error;
  }
}

function main() {
  console.log("Fixing Prisma generated types...\n");

  let fixedCount = 0;
  for (const file of filesToFix) {
    if (fixFile(file)) {
      fixedCount++;
    }
  }

  console.log(`\nFixed ${fixedCount} file(s)`);
  process.exit(0);
}

main();
