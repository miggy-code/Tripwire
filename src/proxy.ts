import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

function isPublicRoute(pathname: string) {
  return pathname === "/"
    || pathname.startsWith("/sign-in")
    || pathname.startsWith("/sign-up")
    || pathname === "/status"
    || pathname === "/api/health"
    || pathname === "/api/config";
}

// This blocks unauthenticated navigation early. Each protected route also verifies
// the session at its data boundary, so access remains closed if proxy matching changes.
const authenticatedProxy = clerkMiddleware(async (auth, request) => {
  // API routes authenticate at the resource itself. This keeps cron collection
  // available to a bearer token without teaching middleware to trust it.
  if (request.nextUrl.pathname === "/workspace") {
    await auth.protect();
  }
});

function clerkIsConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && process.env.CLERK_SECRET_KEY?.trim());
}

// Keep explicitly public pages visible during setup, while every protected request
// receives an actionable failure rather than an unauthenticated development bypass.
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (clerkIsConfigured()) return authenticatedProxy(request, event);
  if (isPublicRoute(request.nextUrl.pathname)) return NextResponse.next();
  const message = "Authentication is unavailable. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, then restart Tripwire.";
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "auth_not_configured", message } }, { status: 503 });
  }
  return new NextResponse(message, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
