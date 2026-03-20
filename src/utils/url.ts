export function isValidUrl(input: string): boolean {
  const str = input.trim();

  // Try as-is first
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {}

  // Try with https:// prepended
  try {
    const url = new URL("https://" + str);
    return url.hostname.includes("."); // basic sanity check
  } catch {
    return false;
  }
}
