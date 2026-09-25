import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify your email",
  description:
    "Check your email for the Purl verification link to activate your account.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
