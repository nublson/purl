#!/usr/bin/env node
// Renders the extension's icons from the site's pearl (public/logo.svg): the
// pearl alone on a transparent background, with a hairline edge so it still
// reads on a light toolbar (its highlight is white). The 128px icon follows the
// Web Store's guidance: 96px artwork inside 16px of transparent padding.
//
// Run from the repo root after `pnpm install` (it uses the root's sharp):
//   node extension/scripts/make-icons.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sharp = createRequire(path.join(root, "package.json"))("sharp");
const logo = fs.readFileSync(path.join(root, "public/logo.svg"), "utf-8");
const outDir = path.join(root, "extension/public/icons");

// [size in px, share of the canvas the pearl covers]
const SIZES = [
  [16, 1],
  [32, 1],
  [48, 0.96],
  [128, 0.75],
];
// The edge is a hairline in real pixels at every size, not in logo units.
const edgePx = (size) => (size >= 48 ? 1 : 0.6);

for (const [size, fill] of SIZES) {
  // logo.svg draws the pearl in a 32-unit box; widen the view to leave padding.
  const box = 32 / fill;
  const offset = -(box - 32) / 2;
  const stroke = (edgePx(size) * box) / size; // px -> logo units
  const edge = `<circle cx="16" cy="16" r="${16 - stroke / 2}" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="${stroke}"/>`;
  const svg = logo
    .replace(
      /<svg[^>]*>/,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="${offset} ${offset} ${box} ${box}">`,
    )
    .replace("</svg>", `${edge}\n</svg>`);
  // Rasterize at 4x, then scale down: smoother edges at 16px.
  await sharp(Buffer.from(svg), { density: 72 * (size / box) * 4 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon${size}.png`));
  console.log(`icon${size}.png`);
}
