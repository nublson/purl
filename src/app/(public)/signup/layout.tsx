import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up",
  description:
    "Create a Purl account to save links and get AI-powered answers from your saved content.",
};

export default function SignupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
