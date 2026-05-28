"use client";

import { fetchPreferences, patchPreferences } from "@/lib/user-preferences-client";
import type { UserPreferences } from "@/lib/user-preferences";
import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Skeleton } from "./ui/skeleton";

type DefaultPage = NonNullable<UserPreferences["defaultPage"]>;

export function SelectDefaultPage() {
  const [defaultPage, setDefaultPage] = React.useState<DefaultPage | null>(
    null,
  );

  React.useEffect(() => {
    fetchPreferences()
      .then((data) => setDefaultPage(data.defaultPage ?? "home"))
      .catch(() => setDefaultPage("home"));
  }, []);

  const handleChange = async (value: DefaultPage) => {
    setDefaultPage(value);
    await patchPreferences({ defaultPage: value });
  };

  if (defaultPage === null) {
    return <Skeleton className="h-8 w-24 rounded-md" />;
  }

  return (
    <Select
      value={defaultPage}
      onValueChange={(v) => void handleChange(v as DefaultPage)}
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
