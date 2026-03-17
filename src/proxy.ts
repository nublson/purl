import { auth } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = [
  { path: "/", whenAuthenticated: "next" },
  { path: "/login", whenAuthenticated: "redirect" as const },
  { path: "/signup", whenAuthenticated: "redirect" as const },
  { path: "/verify-email", whenAuthenticated: "next" },
  { path: "/privacy", whenAuthenticated: "next" },
  { path: "/terms", whenAuthenticated: "next" },
] as const;

const REDIRECT_WHEN_NOT_AUTHENTICATED = "/login";
const REDIRECT_WHEN_AUTHENTICATED_ON_AUTH_PAGE = "/home";

function isPublicRoute(pathname: string) {
  if (pathname.startsWith("/api/auth")) {
    return { path: "/api/auth", whenAuthenticated: "next" as const };
  }
  return publicRoutes.find((route) => route.path === pathname);
}

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const currentPath = request.nextUrl.pathname;
  const publicRoute = isPublicRoute(currentPath);

  if (publicRoute && !session) {
    return NextResponse.next();
  }

  if (publicRoute && session && publicRoute.whenAuthenticated === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = REDIRECT_WHEN_AUTHENTICATED_ON_AUTH_PAGE;
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
