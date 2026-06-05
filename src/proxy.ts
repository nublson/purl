import { auth } from "@/lib/auth";
import { rateLimitApiRequest } from "@/lib/proxy-rate-limit";
import { getPreferences } from "@/lib/user-preferences";
import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = [
  { path: "/", whenAuthenticated: "next" },
  { path: "/login", whenAuthenticated: "redirect" as const },
  { path: "/signup", whenAuthenticated: "redirect" as const },
  { path: "/privacy", whenAuthenticated: "next" },
  { path: "/terms", whenAuthenticated: "next" },
] as const;

const VERIFY_EMAIL_PATH = "/verify-email";
const REDIRECT_WHEN_NOT_AUTHENTICATED = "/login";
const REDIRECT_WHEN_NOT_VERIFIED = "/verify-email";

async function getDefaultPage(userId: string) {
  const prefs = await getPreferences(userId);
  return prefs.defaultPage === "ai" ? "/ai" : "/home";
}

function isPublicRoute(pathname: string) {
  if (pathname.startsWith("/api/auth")) {
    return { path: "/api/auth", whenAuthenticated: "next" as const };
  }
  return publicRoutes.find((route) => route.path === pathname);
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

  // API v1 routes authenticate at the route handler level — bypass session redirect
  const currentPath = request.nextUrl.pathname;
  if (currentPath.startsWith("/api/v1/")) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const publicRoute = isPublicRoute(currentPath);

  if (publicRoute && !session) {
    return NextResponse.next();
  }

  if (publicRoute && session && publicRoute.whenAuthenticated === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = await getDefaultPage(session.user.id);
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
    url.pathname = await getDefaultPage(session.user.id);
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
