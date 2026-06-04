"use client";

import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/lib/user-preferences-shared";
import { patchPreferences } from "@/lib/user-preferences-client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface PreferencesContextValue {
  preferences: UserPreferences;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  updatePreferences: async () => {},
});

export function PreferencesProvider({
  initialPreferences,
  children,
}: {
  initialPreferences: UserPreferences;
  children: ReactNode;
}) {
  const [preferences, setPreferences] =
    useState<UserPreferences>(initialPreferences);

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...patch }));
      await patchPreferences(patch);
    },
    [],
  );

  return (
    <PreferencesContext value={{ preferences, updatePreferences }}>
      {children}
    </PreferencesContext>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
