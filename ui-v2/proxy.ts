import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isPublicSitePath } from "@/modules/auth/public-paths";
import { isSetupComplete } from "@/modules/auth/server/service";

const PUBLIC_ROUTES = new Set(["/", "/login", "/setup"]);
const AUTH_ROUTES = new Set(["/login", "/setup"]);

export default auth(async (request) => {
  const pathname = request.nextUrl.pathname;

  if (isPublicSitePath(pathname)) {
    return NextResponse.next();
  }

  const setupComplete = await isSetupComplete();
  const isAuthenticated = Boolean(request.auth?.user);
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  if (!setupComplete && pathname !== "/setup") {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (setupComplete && pathname === "/setup") {
    return NextResponse.redirect(
      new URL(isAuthenticated ? "/workflow" : "/login", request.url),
    );
  }

  if (AUTH_ROUTES.has(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL("/workflow", request.url));
  }

  if (!isPublicRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    const redirectTo = `${pathname}${request.nextUrl.search}`;

    if (redirectTo.startsWith("/")) {
      loginUrl.searchParams.set("redirectTo", redirectTo);
    }

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!$|docs(?:/|$)|api/auth|api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
