"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signIn, signOut as authSignOut } from "@/lib/auth-client";
import type { ProviderId } from "@/lib/auth-providers";
import { signInErrorMessage } from "@/lib/sign-in-errors";

export function useAuth() {
  const router = useRouter();

  async function signInWithProvider(provider: ProviderId) {
    const res = await signIn.social({
      provider,
      callbackURL: "/home",
      errorCallbackURL: "/",
    });
    if (res.error) {
      const code = "code" in res.error ? (res.error.code as string | undefined) : undefined;
      toast.error(
        signInErrorMessage(code ?? null) ??
          res.error.message ??
          "We couldn't sign you in. Try again.",
      );
    }
  }

  async function signOut() {
    await authSignOut();
    router.push("/");
    router.refresh();
  }

  return { signInWithProvider, signOut };
}
