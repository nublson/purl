"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signIn, signUp, signOut as authSignOut } from "@/lib/auth-client";

export function useAuth() {
  const router = useRouter();

  async function signInWithEmail(credentials: { email: string; password: string }) {
    const res = await signIn.email(credentials);
    if (res.error) {
      toast.error(res.error.message ?? "Something went wrong.");
      return res;
    }
    toast.success("Signed in successfully.");
    router.replace("/home");
    return res;
  }

  async function signUpWithEmail(params: {
    name?: string;
    email: string;
    password: string;
  }) {
    const res = await signUp.email({
      name: params.name?.trim() || params.email,
      email: params.email,
      password: params.password,
    });
    if (res.error) {
      toast.error(res.error.message ?? "Something went wrong.");
      return res;
    }
    toast.success("Account created. Please check your email to verify.");
    router.push("/verify-email");
    router.refresh();
    return res;
  }

  async function signOut() {
    await authSignOut();
    router.push("/login");
    router.refresh();
  }

  return { signInWithEmail, signUpWithEmail, signOut };
}
