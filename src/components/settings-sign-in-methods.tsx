"use client";

import { linkSocial, listAccounts, unlinkAccount } from "@/lib/auth-client";
import type { ProviderId } from "@/lib/auth-providers";
import * as React from "react";
import { toast } from "sonner";
import { ProviderIcon } from "./provider-icons";
import { SettingsItem } from "./settings-item";
import { TooltipWrapper } from "./tooltip-wrapper";
import { Button } from "./ui/button";

const PROVIDER_NAMES: Record<ProviderId, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
};

const ONLY_SIGN_IN_METHOD_MESSAGE = "You need at least one way to sign in";

interface SettingsSignInMethodsProps {
  /** Providers enabled for this deployment (`getEnabledProviders()`); a user
   * may have no linked account row for one of these if they've never used it. */
  providers: ProviderId[];
}

export function SettingsSignInMethods({ providers }: SettingsSignInMethodsProps) {
  const [connected, setConnected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [pendingProvider, setPendingProvider] = React.useState<ProviderId | null>(
    null,
  );

  const loadAccounts = React.useCallback(async () => {
    try {
      const result = await listAccounts();
      if (result.error) {
        toast.error(
          result.error.message ?? "Unable to load sign-in methods. Try again.",
        );
        return;
      }
      setConnected(new Set((result.data ?? []).map((account) => account.providerId)));
    } catch {
      toast.error("Unable to load sign-in methods. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const connectedCount = providers.filter((provider) => connected.has(provider)).length;

  async function handleConnect(provider: ProviderId) {
    setPendingProvider(provider);
    try {
      const result = await linkSocial({
        provider,
        callbackURL: "/home?settings=account",
        // A failed connect returns here with `?error=<code>`, which
        // `SettingsDeepLink` turns into a toast (see `connectErrorMessage`).
        errorCallbackURL: "/home?settings=account",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Unable to connect. Try again.");
      }
      // On success, linkSocial redirects the browser to the provider, so
      // there's no further local state to update here.
    } catch {
      toast.error("Unable to connect. Try again.");
    } finally {
      setPendingProvider(null);
    }
  }

  async function handleDisconnect(provider: ProviderId) {
    setPendingProvider(provider);
    try {
      const result = await unlinkAccount({ providerId: provider });
      if (result.error) {
        toast.error(result.error.message ?? "Unable to disconnect. Try again.");
        return;
      }
      await loadAccounts();
    } catch {
      toast.error("Unable to disconnect. Try again.");
    } finally {
      setPendingProvider(null);
    }
  }

  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {providers.map((provider) => {
        const isConnected = connected.has(provider);
        const isOnlyConnection = isConnected && connectedCount <= 1;
        const isPending = pendingProvider === provider;

        const button = (
          <Button
            variant="secondary"
            size="sm"
            className="cursor-pointer"
            disabled={loading || isPending || isOnlyConnection}
            onClick={() =>
              void (isConnected ? handleDisconnect(provider) : handleConnect(provider))
            }
          >
            {isPending ? "…" : isConnected ? "Disconnect" : "Connect"}
          </Button>
        );

        return (
          <SettingsItem
            key={provider}
            title={
              <span className="flex items-center gap-2">
                <ProviderIcon provider={provider} className="size-4 shrink-0" />
                {PROVIDER_NAMES[provider]}
              </span>
            }
            description={isConnected ? "Connected" : "Not connected"}
            actions={
              isOnlyConnection ? (
                <TooltipWrapper content={ONLY_SIGN_IN_METHOD_MESSAGE}>
                  <span tabIndex={0}>{button}</span>
                </TooltipWrapper>
              ) : (
                button
              )
            }
          />
        );
      })}
    </div>
  );
}
