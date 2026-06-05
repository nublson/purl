export type UserPreferences = {
  defaultPage?: "home" | "ai";
  showChatWidget?: boolean;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultPage: "home",
  showChatWidget: true,
};

export function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFERENCES;
  const p = raw as Record<string, unknown>;
  return {
    defaultPage: p.defaultPage === "ai" ? "ai" : "home",
    showChatWidget:
      typeof p.showChatWidget === "boolean" ? p.showChatWidget : true,
  };
}
