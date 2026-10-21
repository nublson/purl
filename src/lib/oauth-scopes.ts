/** The scope for save-only tokens: they can save links and nothing else. */
export const SAVE_SCOPE = "links:save";

/** Every scope the discovery documents advertise. */
export const ADVERTISED_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  SAVE_SCOPE,
] as const;

/**
 * What a connected app can do without the save-only scope: the MCP server's
 * tools, not gated by other scopes.
 */
const PURL_ACCESS = [
  "See your saved links and folders",
  "Save links and move them between folders",
  "Delete links, and manage folders, including deleting them",
] as const;

/** Standard OpenID Connect scopes that share your name and email with the app. */
const IDENTITY_SCOPES = new Set(["openid", "profile", "email"]);

const KNOWN_SCOPES = new Set([...IDENTITY_SCOPES, "offline_access", SAVE_SCOPE]);

/**
 * The consent screen's list, in plain words: the fixed Purl access, then what
 * the requested scopes add. A scope this code doesn't know is shown by name:
 * the user is told about everything they're granting.
 */
export function describeAccess(scopes: string[]): string[] {
  const unique = [...new Set(scopes.filter(Boolean))];
  const items: string[] = unique.includes(SAVE_SCOPE)
    ? ["Save links to your library"]
    : [...PURL_ACCESS];
  if (unique.some((s) => IDENTITY_SCOPES.has(s))) {
    items.push("Know your name and email");
  }
  if (unique.includes("offline_access")) {
    items.push("Stay connected until you disconnect it");
  }
  for (const scope of unique) {
    if (!KNOWN_SCOPES.has(scope)) items.push(`Use the “${scope}” permission`);
  }
  return items;
}
