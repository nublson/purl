/**
 * Rasterize public/logo.svg onto the app background color for favicons and PWA PNGs.
 * Run: pnpm exec tsx scripts/generate-pwa-icons.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = join(root, "public/logo.svg");
const bg = { r: 9, g: 9, b: 11 }; // bg-zinc-950 / theme

async function rasterize(size: number, outPath: string) {
  const svg = readFileSync(svgPath);
  await sharp(svg)
    .resize(size, size)
    .flatten({ background: bg })
    .png()
    .toFile(outPath);
}

async function main() {
  await rasterize(32, join(root, "src/app/icon.png"));
  await rasterize(192, join(root, "public/icons/icon-192.png"));
  await rasterize(512, join(root, "public/icons/icon-512.png"));
  await rasterize(1024, join(root, "src/app/apple-icon.png"));
  console.log("Wrote icon.png, PWA icons, and apple-icon.png from public/logo.svg");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
