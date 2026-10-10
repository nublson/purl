"use client";

import * as React from "react";
import { requireConsentRedirectUri } from "@/lib/oauth-consent-redirect";
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
      const data = (await res.json()) as { redirectURI?: string };
      window.location.href = requireConsentRedirectUri(data);
    } catch (err) {
      console.error("OAuth consent failed:", err);
      setError("Unable to submit your choice. Try again.");
      setSubmitting(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          className="w-full cursor-pointer sm:w-auto sm:px-4 pointer-coarse:min-h-11"
          disabled={submitting !== null}
          onClick={() => void submit(true)}
        >
          {submitting === "allow" ? "Allowing…" : "Allow access"}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="w-full cursor-pointer sm:w-auto sm:px-4 pointer-coarse:min-h-11"
          disabled={submitting !== null}
          onClick={() => void submit(false)}
        >
          {submitting === "deny" ? "Denying…" : "Deny"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
