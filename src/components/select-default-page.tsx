"use client";

import { usePreferences } from "@/contexts/preferences-context";
import type { UserPreferences } from "@/lib/user-preferences-shared";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type DefaultPage = NonNullable<UserPreferences["defaultPage"]>;

export function SelectDefaultPage() {
  const { preferences, updatePreferences } = usePreferences();
  const defaultPage = preferences.defaultPage ?? "home";

  return (
    <Select
      value={defaultPage}
      onValueChange={(v) =>
        void updatePreferences({ defaultPage: v as DefaultPage })
      }
    >
      <SelectTrigger size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        <SelectGroup>
          <SelectItem value="home">Home</SelectItem>
          <SelectItem value="ai">AI</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
