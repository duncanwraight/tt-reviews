import { describe, it, expect } from "vitest";
import type { AppLoadContext } from "react-router";
import {
  addSecurityHeaders,
  addApiSecurityHeaders,
  createSecureResponse,
} from "../security.server";
import { isDevelopment } from "../env.server";

/**
 * Regression guard for SECURITY.md Phase 5 (TT-14). The previous default
 * inferred "development" from `!process.env.NODE_ENV`, which is always
 * truthy on Cloudflare Workers. That shipped a dev-permissive CSP and
 * no HSTS to prod. All helpers now require an explicit isDevelopment
 * boolean (or an AppLoadContext they derive it from) and fail closed to
 * strict/prod when ENVIRONMENT is missing.
 */

function contextWith(env: Record<string, string>): AppLoadContext {
  return { cloudflare: { env } } as unknown as AppLoadContext;
}

describe("isDevelopment", () => {
  it("returns true only when ENVIRONMENT === 'development'", () => {
    expect(isDevelopment(contextWith({ ENVIRONMENT: "development" }))).toBe(
      true
    );
  });

  it("returns false when ENVIRONMENT === 'production'", () => {
    expect(isDevelopment(contextWith({ ENVIRONMENT: "production" }))).toBe(
      false
    );
  });

  it("fails closed (returns false) when ENVIRONMENT is missing", () => {
    expect(isDevelopment(contextWith({}))).toBe(false);
  });

  it("returns false for anything other than the literal 'development'", () => {
    expect(isDevelopment(contextWith({ ENVIRONMENT: "preview" }))).toBe(false);
    expect(isDevelopment(contextWith({ ENVIRONMENT: "staging" }))).toBe(false);
    expect(isDevelopment(contextWith({ ENVIRONMENT: "" }))).toBe(false);
  });
});

describe("addSecurityHeaders", () => {
  it("emits HSTS and the tight connect-src when not in development", () => {
    const headers = new Headers();
    addSecurityHeaders(headers, false);

    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
    );
    expect(csp).not.toContain("localhost");
    expect(csp).not.toContain("tt-reviews.local");
  });

  it("does not emit HSTS and widens connect-src in development", () => {
    const headers = new Headers();
    addSecurityHeaders(headers, true);

    expect(headers.get("Strict-Transport-Security")).toBeNull();
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("http://localhost:54321");
    expect(csp).toContain("http://tt-reviews.local:5173");
  });

  it("always sets the non-CSP baseline headers", () => {
    const headers = new Headers();
    addSecurityHeaders(headers, false);

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });
});

describe("addApiSecurityHeaders", () => {
  it("emits HSTS when not in development", () => {
    const headers = new Headers();
    addApiSecurityHeaders(headers, false);
    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
  });

  it("omits HSTS in development", () => {
    const headers = new Headers();
    addApiSecurityHeaders(headers, true);
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });
});

describe("createSecureResponse", () => {
  it("fails closed to strict headers when ENVIRONMENT is unset on the context", () => {
    const response = createSecureResponse(JSON.stringify({ ok: true }), {
      isApi: false,
      context: contextWith({}),
    });

    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
    );
  });

  it("treats ENVIRONMENT='production' the same as missing", () => {
    const response = createSecureResponse(null, {
      isApi: false,
      context: contextWith({ ENVIRONMENT: "production" }),
    });

    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload"
    );
  });

  it("uses the permissive dev branch when ENVIRONMENT='development'", () => {
    const response = createSecureResponse(null, {
      isApi: false,
      context: contextWith({ ENVIRONMENT: "development" }),
    });

    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "http://localhost:54321"
    );
  });
});
