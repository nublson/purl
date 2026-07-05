import Footer from "@/components/footer";
import Header from "@/components/header";
import { PublicHeaderActions } from "@/components/public-header-actions-loader";
import { Fragment } from "react";

// Intentionally NOT under the (public) route group: that group's layout sets
// `dynamic = "force-static"`, which forces `searchParams` (and cookies/headers)
// to resolve empty for every descendant page — even ones that set their own
// `dynamic = "force-dynamic"`. Next.js's rendering pipeline sets
// `workStore.forceStatic = true` from the ancestor layout and never clears it
// for a descendant's `force-dynamic` (it only sets a separate `forceDynamic`
// flag), and `searchParams`/`cookies`/`headers` all short-circuit on
// `forceStatic` first. This route needs real, per-request query params
// (`consent_code`, `client_id`, `scope`) from Better Auth's mcp plugin
// redirect, so it lives in its own segment with its own dynamic rendering.
//
// The JSX below duplicates src/app/(public)/layout.tsx's chrome -- keep the
// two in sync (nav/footer changes there should be mirrored here).
export const dynamic = "force-dynamic";

export default function OAuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Fragment>
      <Header pathname="/" actions={<PublicHeaderActions />} />
      <main className="wrapper-public flex-1 flex flex-col items-center justify-start px-4 md:px-6 lg:px-12">
        {children}
      </main>
      <Footer />
    </Fragment>
  );
}
