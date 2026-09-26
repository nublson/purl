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

const SETTINGS_TAB_VALUES = ["usage", "integrations", "account"] as const;
type SettingsTabValue = (typeof SETTINGS_TAB_VALUES)[number];

function isSettingsTabValue(value: string | null): value is SettingsTabValue {
  return (SETTINGS_TAB_VALUES as readonly string[]).includes(value ?? "");
}

interface SettingsDialogProps {
  children: React.ReactNode;
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [defaultTab, setDefaultTab] = React.useState<SettingsTabValue | undefined>(
    undefined,
  );

  return (
    <>
      {/* useSearchParams opts its component into client-side rendering, which
          Next requires be wrapped in its own Suspense boundary at build time
          (see src/components/sign-in-error-toast.tsx for the same pattern). */}
      <React.Suspense fallback={null}>
        <SettingsDeepLink
          onOpen={(tab) => {
            setDefaultTab(tab);
            setOpen(true);
          }}
        />
      </React.Suspense>
      <DialogWrapper
        className="dialog-top"
        open={open}
        onOpenChange={setOpen}
        title="Settings"
        description="Usage, integrations, and account"
        content={
          <SettingsContent
            closeDialog={() => setOpen(false)}
            defaultTab={defaultTab}
          />
        }
      >
        {children}
      </DialogWrapper>
    </>
  );
}

/**
 * Opens the settings dialog on the tab named by `?settings=` (e.g. after an
 * OAuth connect redirect back to `/home?settings=account`), then strips just
 * that param from the URL, keeping the pathname and any other query params.
 */
function SettingsDeepLink({
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
