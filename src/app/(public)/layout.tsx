// The landing page has no header. Login, signup and verify-email add it in
// their own layouts via PublicHeader.
export const dynamic = "force-static";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="wrapper-public flex-1 flex flex-col items-center justify-start px-4 md:px-6 lg:px-12">
      {children}
    </main>
  );
}
