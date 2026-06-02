#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const outFile = path.join(root, "purl-extension.zip");

if (!fs.existsSync(distDir)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

execFileSync("zip", ["-r", outFile, "."], { cwd: distDir, stdio: "inherit" });

console.log(`Created ${path.relative(root, outFile)}`);
