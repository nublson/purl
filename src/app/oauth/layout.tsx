import { PublicHeader } from "@/components/public-header";
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
// The <main> below matches src/app/(public)/layout.tsx -- keep the two in sync.
// Unlike the other signed-out pages, this route keeps the PublicHeader.
export const dynamic = "force-dynamic";

export default function OAuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Fragment>
      <PublicHeader />
      <main className="wrapper-public flex-1 flex flex-col items-center justify-start px-4 md:px-6 lg:px-12">
        {children}
      </main>
    </Fragment>
  );
}
