"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { DialogWrapper } from "./dialog-wrapper";
import { Skeleton } from "./ui/skeleton";

// Loaded when the dialog first opens: the tabs (usage, integrations, account)
// stay off /home's initial bundle.
const SettingsContent = dynamic(() => import("./settings-content"), {
  loading: () => (
    <div className="flex flex-col gap-4 px-6">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  ),
});

export const SETTINGS_TAB_VALUES = ["usage", "integrations", "account"] as const;
export type SettingsTabValue = (typeof SETTINGS_TAB_VALUES)[number];

function isSettingsTabValue(value: string | null): value is SettingsTabValue {
  return (SETTINGS_TAB_VALUES as readonly string[]).includes(value ?? "");
}

interface SettingsDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: SettingsTabValue;
}

/**
 * The dialog itself. `open`/`onOpenChange`/`defaultTab` are owned by the
 * caller (see `SettingsDeepLink` below for why) rather than local state here.
 */
export function SettingsDialog({
  children,
  open,
  onOpenChange,
  defaultTab,
}: SettingsDialogProps) {
  return (
    <DialogWrapper
      className="dialog-top"
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Usage, integrations, and account"
      content={
        <SettingsContent
          closeDialog={() => onOpenChange(false)}
          defaultTab={defaultTab}
        />
      }
    >
      {children}
    </DialogWrapper>
  );
}

/**
 * Opens the settings dialog on the tab named by `?settings=` (e.g. after an
 * OAuth connect redirect back to `/home?settings=account`), then strips just
 * that param from the URL, keeping the pathname and any other query params.
 *
 * Must be mounted somewhere that's always present in the tree from page
 * load — not inside `SettingsDialog` itself or the dropdown menu that hosts
 * its trigger. Radix's dropdown/menu content only mounts once the menu has
 * been opened at least once (no `forceMount` is used anywhere in this repo),
 * so a `?settings=` param arriving on page load — the whole point of this
 * component — would never be read if it lived behind that gate. The
 * caller (`User`) mounts this unconditionally and lifts the dialog's
 * open/defaultTab state up to itself so this can drive it directly.
 */
export function SettingsDeepLink({
  onOpen,
}: {
  onOpen: (tab: SettingsTabValue) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const settingsParam = searchParams.get("settings");

  React.useEffect(() => {
    if (!isSettingsTabValue(settingsParam)) return;
    onOpen(settingsParam);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("settings");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // Re-running only when the param itself changes avoids looping: after
    // the replace above, settingsParam becomes null and the guard returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsParam]);

  return null;
}
