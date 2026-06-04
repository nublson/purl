"use client";

import { usePreferences } from "@/contexts/preferences-context";
import { Switch } from "./ui/switch";

export function SelectChatWidget() {
  const { preferences, updatePreferences } = usePreferences();

  return (
    <Switch
      checked={preferences.showChatWidget ?? true}
      onCheckedChange={(checked) =>
        void updatePreferences({ showChatWidget: checked })
      }
      aria-label="Show chat widget on home page"
    />
  );
}
