/** What every connected app can do: the MCP server's tools, not gated by scope. */
const PURL_ACCESS = [
  "See your saved links and folders",
  "Save links and move them between folders",
  "Manage folders, including deleting them and the links inside",
] as const;

/** Standard OpenID Connect scopes that share your name and email with the app. */
const IDENTITY_SCOPES = new Set(["openid", "profile", "email"]);

const KNOWN_SCOPES = new Set([...IDENTITY_SCOPES, "offline_access"]);

/**
 * The consent screen's list, in plain words: the fixed Purl access, then what
 * the requested scopes add. A scope this code doesn't know is shown by name:
 * the user is told about everything they're granting.
 */
export function describeAccess(scopes: string[]): string[] {
  const unique = [...new Set(scopes.filter(Boolean))];
  const items: string[] = [...PURL_ACCESS];
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
