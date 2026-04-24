import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppLoadContext } from "react-router";
import {
  addSecurityHeaders,
  addApiSecurityHeaders,
  createSecureResponse,
  rateLimit,
  RATE_LIMITS,
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

/**
 * SECURITY.md Phase 8 (TT-17). `rateLimit` used to be backed exclusively
 * by an in-memory Map, which doesn't share state across Worker isolates.
 * It now delegates to a Cloudflare rate-limit binding when one is
 * configured for the budget, and only falls back to the Map for test /
 * dev paths. These tests pin both paths.
 */
describe("rateLimit — CF binding delegation", () => {
  function makeRequest(ip = "10.0.0.1") {
    return new Request("https://tt-reviews.local/submit", {
      method: "POST",
      headers: { "cf-connecting-ip": ip },
    });
  }

  function contextWithBinding(
    bindingName: string,
    success: boolean,
    throws = false
  ): {
    context: AppLoadContext;
    limit: ReturnType<typeof vi.fn>;
  } {
    const limit = vi.fn(async () => {
      if (throws) throw new Error("binding unavailable");
      return { success };
    });
    const env: Record<string, unknown> = {
      [bindingName]: { limit },
    };
    const context = {
      cloudflare: { env },
    } as unknown as AppLoadContext;
    return { context, limit };
  }

  beforeEach(() => {
    // In-memory store is module-level; reset by exhausting it for a
    // fresh key per test via IP differentiation.
  });

  it("calls the CF binding when the config names one and returns success:true", async () => {
    const { context, limit } = contextWithBinding("FORM_RATE_LIMITER", true);
    const result = await rateLimit(
      makeRequest("10.0.0.10"),
      RATE_LIMITS.FORM_SUBMISSION,
      context
    );
    expect(limit).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith({ key: "10.0.0.10" });
    expect(result.success).toBe(true);
  });

  it("returns 429-equivalent (success:false) when the binding denies", async () => {
    const { context, limit } = contextWithBinding("FORM_RATE_LIMITER", false);
    const result = await rateLimit(
      makeRequest("10.0.0.11"),
      RATE_LIMITS.FORM_SUBMISSION,
      context
    );
    expect(limit).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("falls back to the in-memory Map when no binding is present", async () => {
    const context = {
      cloudflare: { env: {} },
    } as unknown as AppLoadContext;

    // FORM_SUBMISSION allows 5 / 60s; 6th should fail.
    for (let i = 0; i < 5; i++) {
      const res = await rateLimit(
        makeRequest("10.0.0.20"),
        RATE_LIMITS.FORM_SUBMISSION,
        context
      );
      expect(res.success).toBe(true);
    }
    const blocked = await rateLimit(
      makeRequest("10.0.0.20"),
      RATE_LIMITS.FORM_SUBMISSION,
      context
    );
    expect(blocked.success).toBe(false);
  });

  it("falls back to in-memory if the binding throws", async () => {
    const { context, limit } = contextWithBinding(
      "FORM_RATE_LIMITER",
      true,
      true
    );
    // First call — binding throws, in-memory allows it.
    const first = await rateLimit(
      makeRequest("10.0.0.30"),
      RATE_LIMITS.FORM_SUBMISSION,
      context
    );
    expect(limit).toHaveBeenCalledTimes(1);
    expect(first.success).toBe(true);
  });

  it("uses the configured binding name per config (DISCORD vs FORM vs ADMIN)", async () => {
    const formMock = vi.fn(async () => ({ success: true }));
    const discordMock = vi.fn(async () => ({ success: true }));
    const adminMock = vi.fn(async () => ({ success: true }));
    const context = {
      cloudflare: {
        env: {
          FORM_RATE_LIMITER: { limit: formMock },
          DISCORD_RATE_LIMITER: { limit: discordMock },
          ADMIN_RATE_LIMITER: { limit: adminMock },
        },
      },
    } as unknown as AppLoadContext;

    await rateLimit(
      makeRequest("10.0.0.40"),
      RATE_LIMITS.FORM_SUBMISSION,
      context
    );
    await rateLimit(
      makeRequest("10.0.0.40"),
      RATE_LIMITS.DISCORD_WEBHOOK,
      context
    );
    await rateLimit(
      makeRequest("10.0.0.40"),
      RATE_LIMITS.ADMIN_ACTION,
      context
    );

    expect(formMock).toHaveBeenCalledTimes(1);
    expect(discordMock).toHaveBeenCalledTimes(1);
    expect(adminMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * TT-24. enforceAdminActionGate bundles CSRF + per-admin rate limiting.
 * Per-admin key means rotating IPs can't bypass the cap on a compromised
 * admin cred. CSRF check short-circuits before the rate limit so a
 * forged request never consumes an admin's budget.
 */
describe("enforceAdminActionGate", () => {
  it("keys the rate limit on userId, not client IP", async () => {
    const adminMock = vi.fn(async () => ({ success: true }));
    const context = {
      cloudflare: {
        env: {
          ADMIN_RATE_LIMITER: { limit: adminMock },
          SESSION_SECRET: "x".repeat(32),
        },
      },
    } as unknown as AppLoadContext;

    // GET requests don't require CSRF, so the gate reaches the rate-limit path.
    const request = new Request("https://tt-reviews.local/admin/x", {
      method: "GET",
      headers: { "cf-connecting-ip": "203.0.113.5" },
    });
    const { enforceAdminActionGate } = await import("../security.server");
    const result = await enforceAdminActionGate(
      request,
      context,
      "user-abc-123"
    );

    expect(result).toBeNull();
    expect(adminMock).toHaveBeenCalledWith({ key: "admin:user-abc-123" });
  });

  it("returns 429 when the admin rate-limit binding denies", async () => {
    const adminMock = vi.fn(async () => ({ success: false }));
    const context = {
      cloudflare: {
        env: {
          ADMIN_RATE_LIMITER: { limit: adminMock },
          SESSION_SECRET: "x".repeat(32),
        },
      },
    } as unknown as AppLoadContext;

    const request = new Request("https://tt-reviews.local/admin/x", {
      method: "GET",
      headers: { "cf-connecting-ip": "203.0.113.6" },
    });
    const { enforceAdminActionGate } = await import("../security.server");
    const result = await enforceAdminActionGate(request, context, "user-xyz");

    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });
});
