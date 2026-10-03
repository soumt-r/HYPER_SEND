import { NextRequest, NextResponse } from "next/server";

// Content Security Policy for pages, with a fresh nonce per request: Next.js adds
// it to its own scripts, so injected inline scripts can't run.
// 'self' stays allowed for scripts so same-origin scripts Cloudflare may inject
// (e.g. /cdn-cgi/ email obfuscation) keep working. Styles allow inline because
// animations and SSR'd style attributes rely on it.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // Google profile pictures on the admin page
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes, build assets and files from public/ don't need it
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
