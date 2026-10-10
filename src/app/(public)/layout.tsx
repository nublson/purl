// The signed-out pages: the landing page and the Notion-backed static pages
// (Privacy, Terms, API and MCP docs). Each owns its landmarks, so the layout
// adds none.
export const dynamic = "force-static";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
