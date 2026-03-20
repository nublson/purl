import { parseHttpUrl } from "./url";

export function isPdfUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  if (!parsed) return false;
  return parsed.pathname.toLowerCase().endsWith(".pdf");
}
