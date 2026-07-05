"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export function OAuthConsentActions({ consentCode }: { consentCode: string }) {
  const [submitting, setSubmitting] = React.useState<"allow" | "deny" | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (accept: boolean) => {
    setSubmitting(accept ? "allow" : "deny");
    setError(null);
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });
      if (!res.ok) {
        throw new Error(`Consent request failed with status ${res.status}`);
      }
      const data = (await res.json()) as { redirectURI: string };
      window.location.href = data.redirectURI;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit your decision",
      );
      setSubmitting(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Button
          className="cursor-pointer"
          disabled={submitting !== null}
          onClick={() => void submit(true)}
        >
          {submitting === "allow" ? "Connecting…" : "Allow"}
        </Button>
        <Button
          variant="secondary"
          className="cursor-pointer"
          disabled={submitting !== null}
          onClick={() => void submit(false)}
        >
          {submitting === "deny" ? "Denying…" : "Deny"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
