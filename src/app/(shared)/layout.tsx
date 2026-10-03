/** Shared (public) folder pages: no app header, rendered per request. */
export default function SharedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 pt-16 pb-12 md:px-0">
      {children}
    </main>
  );
}
