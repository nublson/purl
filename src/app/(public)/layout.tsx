// The landing page — the only signed-out page. It owns its landmarks
// (header, main, footer), so the layout adds none.
export const dynamic = "force-static";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
