"use client";

import { useState } from "react";
import type { ProviderId } from "@/lib/auth-providers";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ProviderIcon } from "@/components/provider-icons";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
  apple: "Continue with Apple",
};

export function ProviderButtons({ providers }: { providers: ProviderId[] }) {
  const { signInWithProvider } = useAuth();
  const [pendingProvider, setPendingProvider] = useState<ProviderId | null>(
    null,
  );

  async function handleClick(provider: ProviderId) {
    setPendingProvider(provider);
    try {
      await signInWithProvider(provider);
    } finally {
      setPendingProvider(null);
    }
  }

  const disabled = pendingProvider !== null;

  return (
    <div className="flex flex-col items-stretch gap-3 w-full max-w-xs">
      {providers.map((provider) => {
        const isPending = pendingProvider === provider;
        return (
          <Button
            key={provider}
            size="lg"
            variant={provider === "google" ? "default" : "outline"}
            disabled={disabled}
            aria-busy={isPending}
            onClick={() => handleClick(provider)}
          >
            {isPending ? (
              <Spinner />
            ) : (
              <ProviderIcon provider={provider} className="size-4" />
            )}
            {PROVIDER_LABEL[provider]}
          </Button>
        );
      })}
    </div>
  );
}
