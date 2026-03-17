import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Purl account to access your saved links and ask questions.",
};

export default function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
