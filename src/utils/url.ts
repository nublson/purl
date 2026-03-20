export function parseHttpUrl(input: string): URL | null {
  const str = input.trim();

  // Try as-is first
  try {
    const url = new URL(str);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url;
    }
  } catch {}

  // Try with https:// prepended
  try {
    const url = new URL("https://" + str);
    return url.hostname.includes(".") ? url : null; // basic sanity check
  } catch {
    return null;
  }
}

export function isValidUrl(input: string): boolean {
  return parseHttpUrl(input) !== null;
}
