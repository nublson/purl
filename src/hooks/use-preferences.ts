import { PreferencesContext } from "@/contexts/preferences-context";
import { useContext } from "react";

export function usePreferences() {
  return useContext(PreferencesContext);
}
