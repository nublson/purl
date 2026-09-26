"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { signInErrorMessage } from "@/lib/sign-in-errors";

/** Reads `?error=` from a failed OAuth redirect, toasts it once, then cleans the URL. */
export function SignInErrorToast() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    if (!error) return;
    const message = signInErrorMessage(error);
    if (message) toast.error(message);
    router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return null;
}
