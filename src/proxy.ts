import { auth } from "@/lib/auth";
import { rateLimitApiRequest } from "@/lib/proxy-rate-limit";
import { type NextRequest, NextResponse } from "next/server";

type WhenAuthenticated = "next" | "redirect";

type PublicRoute = {
  path: string;
  whenAuthenticated: WhenAuthenticated;
  match?: "exact" | "prefix";
};

const publicRoutes: PublicRoute[] = [
  { path: "/", whenAuthenticated: "next" },
  { path: "/login", whenAuthenticated: "redirect" },
  { path: "/signup", whenAuthenticated: "redirect" },
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
];

const VERIFY_EMAIL_PATH = "/verify-email";
const REDIRECT_WHEN_NOT_AUTHENTICATED = "/login";
const REDIRECT_WHEN_NOT_VERIFIED = "/verify-email";
const DEFAULT_PAGE = "/home";

function matchesPublicRoute(pathname: string, route: PublicRoute): boolean {
  if ((route.match ?? "exact") === "exact") {
    return pathname === route.path;
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
  // Public "next" routes render the same with or without a session, so only
  // routes that redirect signed-in users (e.g. /login) need the lookup.
  if (publicRoute?.whenAuthenticated === "next") {
    return NextResponse.next();
  }

  // Better Auth's apiKey plugin throws (rather than returning null) when the
  // Authorization header carries an invalid/expired/malformed API key. Treat
  // that the same as "no session" instead of letting it crash the whole
  // middleware with an unhandled 500 for what's just a bad Bearer token on a
  // normal page.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch (err) {
    console.error("proxy: getSession threw, treating as unauthenticated:", err);
  }

  if (publicRoute && !session) {
    return NextResponse.next();
  }

  if (publicRoute && session && publicRoute.whenAuthenticated === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_PAGE;
    return NextResponse.redirect(url);
  }

  if (publicRoute && session) {
    return NextResponse.next();
  }

  if (!publicRoute && !session) {
    const url = request.nextUrl.clone();
    url.pathname = REDIRECT_WHEN_NOT_AUTHENTICATED;
    return NextResponse.redirect(url);
  }

  if (currentPath === VERIFY_EMAIL_PATH && session?.user?.emailVerified) {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_PAGE;
    return NextResponse.redirect(url);
  }

  if (currentPath === VERIFY_EMAIL_PATH && session) {
    return NextResponse.next();
  }

  if (!publicRoute && session && !session.user.emailVerified) {
    const url = request.nextUrl.clone();
    url.pathname = REDIRECT_WHEN_NOT_VERIFIED;
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
