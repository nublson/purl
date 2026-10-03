import { CurrentUserProvider } from "@/contexts/current-user-context";
import { UsageProvider } from "@/contexts/usage-context";
import { getEnabledProviders } from "@/lib/auth-providers";
import { getSessionUser } from "@/lib/session";
import { getUsageSummaryForUser } from "@/lib/usage-summary";
import { Suspense } from "react";
import { FolderSelectDropdown } from "./folder-select-dropdown";
import { FolderSharePopover } from "./folder-share-popover";
import { HeaderAddMenu } from "./header-add-menu";
import { Logo } from "./logo";
import { HeaderActionsFallback } from "./skeletons/header-actions-fallback";
import { Separator } from "./ui/separator";
import { User } from "./user";

async function HeaderActions() {
  const user = await getSessionUser();
  const usageSummary = user ? await getUsageSummaryForUser(user.id) : null;
  const enabledProviders = getEnabledProviders();

  return (
    <CurrentUserProvider user={user} enabledProviders={enabledProviders}>
      <UsageProvider usageSummary={usageSummary}>
        <div className="flex items-center justify-end gap-2">
          <FolderSharePopover />
          <HeaderAddMenu />
          <User />
        </div>
      </UsageProvider>
    </CurrentUserProvider>
  );
}

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 transform-none">
      <div className="flex w-full items-center justify-between gap-2 bg-linear-to-b from-background to-transparent p-4">
        {/* min-w-0 lets the folder selector truncate before it can push into the actions. */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0">
            <Logo size={32} pathname="/home" />
          </div>
          <Separator
            orientation="vertical"
            className="data-vertical:h-5 data-vertical:self-center"
          />
          <FolderSelectDropdown />
        </div>
        <div className="shrink-0">
          <Suspense fallback={<HeaderActionsFallback />}>
            <HeaderActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
