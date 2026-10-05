import { rateLimitApiRequest } from "@/lib/proxy-rate-limit";
import { type NextRequest, NextResponse } from "next/server";

type WhenAuthenticated = "next" | "redirect";

type PublicRoute = {
  path: string;
  whenAuthenticated: WhenAuthenticated;
  /**
   * `exact` (default), `prefix` (the path or anything under `path/`), or
   * `startsWith` (any pathname beginning with `path`, e.g. `/@` for
   * `/@username/...`).
   */
  match?: "exact" | "prefix" | "startsWith";
};

const publicRoutes: PublicRoute[] = [
  // The landing page is the only signed-out page: signed-out visitors (and
  // the Better Auth `mcp` plugin's signed-out login redirect, which lands
  // here with `?client_id=…&response_type=…`) see it, and signed-in users
  // are bounced to /home.
  { path: "/", whenAuthenticated: "redirect" },
  // RFC 8615 reserved namespace — anything under .well-known is by convention
  // a public, unauthenticated discovery/metadata document (OAuth server
  // metadata, security.txt, etc.), never a session-bearing app route.
  {
    path: "/.well-known",
    match: "prefix",
    whenAuthenticated: "next",
  },
  // Better Auth handles its own cookies.
  {
    path: "/api/auth",
    match: "prefix",
    whenAuthenticated: "next",
  },
  // Shared folders: anyone can read a public folder, signed in or not. The
  // page is /@username/slug (rewritten to /u/...); its data lives under
  // /api/public.
  { path: "/@", match: "startsWith", whenAuthenticated: "next" },
  { path: "/u", match: "prefix", whenAuthenticated: "next" },
  { path: "/api/public", match: "prefix", whenAuthenticated: "next" },
];

/**
 * Better Auth's session cookie (default prefix; `__Secure-` over HTTPS).
 * Read by name rather than with `better-auth/cookies`, whose import alone
 * pulls in its JWT and crypto code.
 */
const SESSION_COOKIE = "better-auth.session_token";

/**
 * Whether the request carries a session cookie. Only that: the proxy's
 * check is optimistic (Next.js and Better Auth both recommend no database
 * work here, since it runs before every page). Whether the session is
 * real is decided where the data is: the `(app)` layout and the consent
 * page redirect without a user, and every API route checks its own.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get(`__Secure-${SESSION_COOKIE}`)?.value ||
      request.cookies.get(SESSION_COOKIE)?.value,
  );
}

const REDIRECT_WHEN_NOT_AUTHENTICATED = "/";
const DEFAULT_PAGE = "/home";

function matchesPublicRoute(pathname: string, route: PublicRoute): boolean {
  if ((route.match ?? "exact") === "exact") {
    return pathname === route.path;
  }
  if (route.match === "startsWith") {
    return pathname.startsWith(route.path);
  }
  return pathname === route.path || pathname.startsWith(`${route.path}/`);
}

function isPublicRoute(pathname: string): PublicRoute | undefined {
  return publicRoutes.find((route) => matchesPublicRoute(pathname, route));
}

export async function proxy(request: NextRequest) {
  // OPTIONS preflight requests never carry credentials; pass them through so
  // route-level CORS handlers can respond correctly.
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  const rateLimited = await rateLimitApiRequest(request);
  if (rateLimited) {
    return rateLimited;
  }

  // API v1 and MCP routes authenticate at the route handler level (API key /
  // bearer token) — bypass the session redirect.
  const currentPath = request.nextUrl.pathname;
  if (currentPath.startsWith("/api/v1/") || currentPath.startsWith("/api/mcp")) {
    return NextResponse.next();
  }

  const publicRoute = isPublicRoute(currentPath);
  // Public "next" routes render the same with or without a session.
  if (publicRoute?.whenAuthenticated === "next") {
    return NextResponse.next();
  }

  // API routes answer for themselves (401 without a session, or their API
  // key / OAuth check); a redirect to the landing page means nothing to a
  // fetch.
  if (currentPath.startsWith("/api/")) {
    return NextResponse.next();
  }

  const signedIn = hasSessionCookie(request);

  // The landing page sends signed-in users to Home, so here the session
  // must be real: a stale cookie would otherwise bounce between / and
  // /home (whose layout sends it back). Auth loads only for this page, so
  // the rest of the app's requests don't pay for it on a cold start.
  if (publicRoute) {
    if (!signedIn) return NextResponse.next();
    let session = null;
    try {
      const { auth } = await import("@/lib/auth");
      session = await auth.api.getSession({ headers: request.headers });
    } catch (err) {
      // An invalid Bearer API key makes the apiKey plugin throw: that's
      // just "no session" for a page.
      console.error("proxy: getSession threw, treating as unauthenticated:", err);
    }
    if (!session) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_PAGE;
    return NextResponse.redirect(url);
  }

  if (!signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = REDIRECT_WHEN_NOT_AUTHENTICATED;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skips static files and routes that never need a session: `_vercel` is
  // Analytics/Speed Insights, plus the service worker, manifest,
  // robots/sitemap, and asset extensions.
  matcher: [
    "/((?!_next/static|_next/image|_vercel|favicon.ico|sw.js|manifest.json|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|mjs|css|map|txt|xml|json|webmanifest|woff|woff2)$).*)",
  ],
};
