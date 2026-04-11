import { isSentryExampleEnabled } from "@/lib/sentry-example-enabled";
import { notFound } from "next/navigation";

export default function SentryExampleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!isSentryExampleEnabled()) {
    notFound();
  }
  return children;
}
