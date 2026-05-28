import type { UserPreferences } from "./user-preferences";

export async function fetchPreferences(): Promise<UserPreferences> {
  const res = await fetch("/api/user/preferences");
  if (!res.ok) throw new Error("Failed to fetch preferences");
  return res.json() as Promise<UserPreferences>;
}

export async function patchPreferences(
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const res = await fetch("/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update preferences");
  return res.json() as Promise<UserPreferences>;
}
