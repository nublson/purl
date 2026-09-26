/**
 * Pure username rules: format validation, reserved names, and base/candidate
 * generation from an email or display name. No Prisma or server-only imports —
 * this module is safe to import from client components (Settings UI) as well
 * as from server code (Better Auth hooks, API routes).
 */

/** 3–30 chars, lowercase, starts with a letter or digit, then letters/digits/`_`/`-`. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

/** Names that would collide with routes or brand identity. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "help",
  "home",
  "purl",
  "root",
  "settings",
  "support",
  "www",
]);

/** Trims and lowercases a raw username for comparison/storage. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export type UsernameCheck = { ok: true; username: string } | { ok: false; reason: "format" | "reserved" };

/** Normalizes `input`, then checks it against the format pattern and the reserved list. */
export function validateUsername(input: string): UsernameCheck {
  const username = normalizeUsername(input);
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, reason: "format" };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true, username };
}

/** Strips accents/diacritics via Unicode decomposition. */
function stripAccents(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * Slugs a candidate string down to `[a-z0-9_-]`, collapsing repeated
 * separators to their first character and trimming leading/trailing
 * separators, then truncates to 26 characters.
 */
function slugify(value: string): string {
  const cleaned = stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  const collapsed = cleaned.replace(/-{2,}/g, "-").replace(/_{2,}/g, "_");
  const trimmed = collapsed.replace(/^[-_]+/, "").replace(/[-_]+$/, "");
  return trimmed.slice(0, 26);
}

/**
 * Derives a username base from an email's local part (dots removed, `+tag`
 * dropped) or, if that yields fewer than 3 usable characters, from a display
 * name (spaces become `-`). Falls back to `"user"` when neither works, and
 * appends `-1` when the result collides with a reserved name.
 */
export function usernameBaseFrom(email: string, name: string | null | undefined): string {
  const localPart = email.split("@")[0] ?? "";
  const withoutTag = localPart.split("+")[0] ?? "";
  const emailCandidate = slugify(withoutTag.replace(/\./g, ""));

  let base = emailCandidate;
  if (base.length < 3) {
    const nameCandidate = slugify((name ?? "").trim().replace(/\s+/g, "-"));
    base = nameCandidate.length >= 3 ? nameCandidate : "";
  }
  if (base.length < 3) {
    base = "user";
  }

  if (RESERVED_USERNAMES.has(base)) {
    return `${base}-1`;
  }
  return base;
}

const MAX_NUMBERED_ATTEMPTS = 50;
const RANDOM_SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSuffix(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += RANDOM_SUFFIX_CHARS[Math.floor(Math.random() * RANDOM_SUFFIX_CHARS.length)];
  }
  return result;
}

/**
 * Generates a free username: tries the base, then `base2`…`base50`, then
 * `base-<4 random chars>` repeatedly until `isTaken` reports it's free.
 */
export async function generateUsername(
  email: string,
  name: string | null | undefined,
  isTaken: (u: string) => Promise<boolean>,
): Promise<string> {
  const base = usernameBaseFrom(email, name);

  if (!(await isTaken(base))) {
    return base;
  }

  for (let n = 2; n <= MAX_NUMBERED_ATTEMPTS; n++) {
    const candidate = `${base}${n}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  for (;;) {
    const candidate = `${base}-${randomSuffix(4)}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }
}
