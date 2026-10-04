import type { NextFunction, Request, Response } from "express";

/**
 * Baseline response headers for the Express app (the Manus deployment).
 *
 * Vercel does not run this middleware: the static client and the API functions
 * get only the three simple headers, repeated in vercel.json (a test keeps the
 * two copies identical). The Report-Only CSP and HSTS are Express-only; Vercel
 * adds HSTS itself.
 *
 * Deliberately NOT set here:
 *  - X-Frame-Options / frame-ancestors enforcement. The repo ships a `__manus__`
 *    folder that suggests the platform may preview the app inside an iframe;
 *    forbidding framing could break that. Verify, then add it.
 *  - An ENFORCING Content-Security-Policy. The app relies on inline styles and an
 *    inline script in index.html, and a wrong policy blanks the page. A
 *    Report-Only policy is sent instead: violations show up in the browser
 *    console, so the owner can review them and then set CSP_MODE=enforce.
 *
 * CSP_MODE: "report-only" (default) | "enforce" | "off".
 */

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // index.html has an inline script and the UI is styled inline.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://img.mlbstatic.com https://www.mlbstatic.com https://content.mlb.com https://www.mlb.com",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://statsapi.mlb.com https://ncaa-api.henrygd.me",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
].join("; ");

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES;

const HSTS_MAX_AGE_SECONDS = 15_552_000; // 180 days; no preload, no subdomains.

function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return proto === "https";
}

export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.removeHeader("X-Powered-By");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // The app uses the microphone for voice notes; everything else is denied.
    res.setHeader(
      "Permissions-Policy",
      "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)"
    );

    // Only over HTTPS in production: HSTS on plain HTTP is ignored by browsers,
    // and on localhost/dev it would only create confusion.
    if (process.env.NODE_ENV === "production" && isSecureRequest(req)) {
      res.setHeader(
        "Strict-Transport-Security",
        `max-age=${HSTS_MAX_AGE_SECONDS}`
      );
    }

    const mode = (process.env.CSP_MODE || "report-only").toLowerCase();
    if (mode === "enforce") {
      res.setHeader("Content-Security-Policy", CSP_DIRECTIVES);
    } else if (mode !== "off") {
      res.setHeader("Content-Security-Policy-Report-Only", CSP_DIRECTIVES);
    }
    next();
  };
}
