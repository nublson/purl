import { parseHttpUrl } from "./url";

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
];

export function isImageUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) return false;

  const pathname = parsed.pathname.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}
