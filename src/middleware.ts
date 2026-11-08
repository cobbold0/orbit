import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_EXACT_PATHS = new Set([
  "/sign-in",
  "/sign-up",
  "/login",
  "/register",
  "/favicon.ico",
  "/sw.js",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  "/apple-touch-icon.png",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle common auth aliases
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (pathname === "/register") {
    return NextResponse.redirect(new URL("/sign-up", request.url));
  }

  // Public APIs and Next internals bypass auth check
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/inngest") ||
    PUBLIC_EXACT_PATHS.has(pathname)
  ) {
    const sessionToken =
      request.cookies.get("better-auth.session_token")?.value ||
      request.cookies.get("__Secure-better-auth.session_token")?.value;

    // If already logged in and visiting sign-in or sign-up, redirect to home
    if (sessionToken && (pathname === "/sign-in" || pathname === "/sign-up")) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  // Protected application routes
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  if (!sessionToken) {
    const signInUrl = new URL("/sign-in", request.url);
    if (pathname !== "/") {
      signInUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     */
    "/((?!_next/static|_next/image).*)",
  ],
};
