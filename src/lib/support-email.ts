// A plain address: no whitespace, quotes, angle brackets, commas, parentheses or
// further `@`, and a dot in the domain. It ends up in a `mailto:` link, so
// anything cleverer than that is dropped.
const ADDRESS = /^[^\s@<>,;:"'()?&]+@[^\s@<>,;:"'()?&]+\.[^\s@<>,;:"'()?&]+$/;

/**
 * The address the support page shows: the first usable recipient of
 * `FEEDBACK_TO_EMAIL` (the inbox in-app feedback goes to), which may hold
 * several, comma-separated, some as `Name <address>`. Null when none is a
 * plain address, so the page falls back to its other ways to reach us.
 */
export function getSupportEmail(
  raw: string | undefined = process.env.FEEDBACK_TO_EMAIL,
): string | null {
  for (const entry of (raw ?? "").split(",")) {
    const candidate = entry.trim();
    const address = candidate.match(/<([^<>]+)>$/)?.[1]?.trim() ?? candidate;
    if (ADDRESS.test(address)) return address;
  }
  return null;
}
