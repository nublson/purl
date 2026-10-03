/**
 * Shared (public) folder pages: the app's page frame (see the (app)
 * layout) without its session-bound header; each page draws its own.
 */
export default function SharedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-4 md:px-0">
      {children}
    </main>
  );
}
