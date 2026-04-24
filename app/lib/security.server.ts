/**
 * Security utilities for server-side operations
 */

import type { AppLoadContext } from "react-router";
import {
  generateCSRFToken,
  getSessionId,
  getSessionSecret,
  requiresCSRFProtection,
  validateCSRFFromRequest,
} from "./csrf.server";
import { isDevelopment } from "./env.server";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: Request) => string; // Custom key generator
  // Name of the Cloudflare rate-limit binding in wrangler.toml that
  // backs this budget. When present and resolvable on context.env, the
  // binding is authoritative and the in-memory Map is skipped entirely
  // (SECURITY.md Phase 8 / TT-17). The binding's limit+period are
  // configured in wrangler.toml and must match `maxRequests` / `windowMs`
  // here for the headers and fallback to stay in sync.
  binding?: "FORM_RATE_LIMITER" | "DISCORD_RATE_LIMITER";
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory rate limiting store. Only used as a fallback when the
// Cloudflare binding is not available (tests, CI without wrangler).
// Workers isolates don't share memory reliably across requests, so this
// fallback is not a production safeguard — the bindings above are.
const rateLimitStore = new Map<string, RateLimitEntry>();

export async function rateLimit(
  request: Request,
  config: RateLimitConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context?: any
): Promise<{ success: boolean; resetTime?: number; remaining?: number }> {
  const key = config.keyGenerator
    ? config.keyGenerator(request)
    : getClientIP(request);
  const now = Date.now();

  if (config.binding && context?.cloudflare?.env) {
    const env = context.cloudflare.env as Record<string, unknown>;
    const binding = env[config.binding] as
      | { limit(opts: { key: string }): Promise<{ success: boolean }> }
      | undefined;
    if (binding && typeof binding.limit === "function") {
      try {
        const { success } = await binding.limit({ key });
        return {
          success,
          resetTime: now + config.windowMs,
          remaining: success ? config.maxRequests - 1 : 0,
        };
      } catch {
        // Fall through to in-memory fallback if the binding call throws.
        // In practice this only happens during a misconfiguration window
        // — a thrown error here should not fail-open on request handling.
      }
    }
  }

  // In-memory fallback. Clean up old entries first so the Map doesn't
  // grow unbounded over the life of the isolate.
  for (const [entryKey, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(entryKey);
    }
  }

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    const resetTime = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { success: true, resetTime, remaining: config.maxRequests - 1 };
  }

  if (entry.count >= config.maxRequests) {
    return { success: false, resetTime: entry.resetTime, remaining: 0 };
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    success: true,
    resetTime: entry.resetTime,
    remaining: config.maxRequests - entry.count,
  };
}

/**
 * Get client IP address for rate limiting
 */
function getClientIP(request: Request): string {
  // Check Cloudflare headers first
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  // Check other common headers
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp;

  // Fallback to a default
  return "unknown";
}

// Predefined rate limit configurations. Values here must match the
// wrangler.toml [[unsafe.bindings]] with `type = "ratelimit"` for the
// budgets to stay in sync between the CF binding path and the in-memory
// fallback. The `binding` field names the binding the runtime should
// ask; callers pass the whole config to `rateLimit`.
export const RATE_LIMITS = {
  API_STRICT: { windowMs: 60 * 1000, maxRequests: 10 },
  API_MODERATE: { windowMs: 60 * 1000, maxRequests: 30 },
  LOGIN: { windowMs: 15 * 60 * 1000, maxRequests: 5 },
  FORM_SUBMISSION: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    binding: "FORM_RATE_LIMITER",
  },
  DISCORD_WEBHOOK: {
    windowMs: 10 * 1000,
    maxRequests: 20,
    binding: "DISCORD_RATE_LIMITER",
  },
} as const satisfies Record<string, RateLimitConfig>;

export function addSecurityHeaders(headers: Headers, isDevelopment: boolean) {
  const connectSrc = isDevelopment
    ? "'self' https://*.supabase.co wss://*.supabase.co http://localhost:54321 http://tt-reviews.local:5173 http://localhost:5173"
    : "'self' https://*.supabase.co wss://*.supabase.co";

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Allow inline scripts for React hydration
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: https: blob:", // Allow external images and data URIs
    `connect-src ${connectSrc}`, // Supabase API + local development
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'self' https://www.youtube.com https://youtube.com",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  // upgrade-insecure-requests breaks dev: it tells the browser to upgrade
  // every subresource to HTTPS, but the dev server only speaks HTTP.
  if (!isDevelopment) {
    cspDirectives.push("upgrade-insecure-requests");
  }
  const csp = cspDirectives.join("; ");

  headers.set("Content-Security-Policy", csp);

  // Additional security headers
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // HSTS - Only add in production with HTTPS
  if (!isDevelopment) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
}

export function addApiSecurityHeaders(
  headers: Headers,
  isDevelopment: boolean
) {
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-XSS-Protection", "1; mode=block");

  if (!isDevelopment) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
}

/**
 * Sanitize error messages for production to prevent information leakage
 */
export function sanitizeError(
  error: unknown,
  isDevelopment: boolean = false
): string {
  if (isDevelopment) {
    // In development, show full error details
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  // In production, return generic error messages
  if (error instanceof Error) {
    // Only show safe error messages
    const safeErrors = [
      "Not found",
      "Unauthorized",
      "Forbidden",
      "Bad request",
      "Validation failed",
    ];

    if (
      safeErrors.some(safe =>
        error.message.toLowerCase().includes(safe.toLowerCase())
      )
    ) {
      return error.message;
    }
  }

  return "An unexpected error occurred";
}

/**
 * Create a secure response with proper headers
 */
export function createSecureResponse(
  body: BodyInit | null,
  init: ResponseInit & {
    isApi?: boolean;
    rateLimit?: { resetTime: number; remaining: number };
    context: AppLoadContext;
  }
): Response {
  const headers = new Headers(init.headers);
  const isDev = isDevelopment(init.context);

  if (init.isApi) {
    addApiSecurityHeaders(headers, isDev);
  } else {
    addSecurityHeaders(headers, isDev);
  }

  // Add rate limiting headers if provided
  if (init?.rateLimit) {
    headers.set("X-RateLimit-Limit", String(init.rateLimit.remaining + 1));
    headers.set("X-RateLimit-Remaining", String(init.rateLimit.remaining));
    headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(init.rateLimit.resetTime / 1000))
    );
  }

  return new Response(body, {
    ...init,
    headers,
  });
}

/**
 * Create a rate limit exceeded response
 */
export function createRateLimitResponse(
  resetTime: number,
  context: AppLoadContext
): Response {
  const headers = new Headers();
  addApiSecurityHeaders(headers, isDevelopment(context));
  headers.set("X-RateLimit-Limit", "0");
  headers.set("X-RateLimit-Remaining", "0");
  headers.set("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)));
  headers.set(
    "Retry-After",
    String(Math.ceil((resetTime - Date.now()) / 1000))
  );

  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
    }),
    {
      status: 429,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Issue a CSRF token for the current authenticated session. Centralises
 * the secret + sessionId resolution so routes don't each have to wire
 * them up. Throws if SESSION_SECRET is missing, or if there's no usable
 * session cookie to bind the token to — both cases indicate a real
 * misconfiguration and should surface as a 500.
 */
export async function issueCSRFToken(
  request: Request,
  context: AppLoadContext,
  userId: string
): Promise<string> {
  const env = context.cloudflare.env as unknown as { SESSION_SECRET?: string };
  const secret = getSessionSecret(env);
  const sessionId = getSessionId(request);
  if (!sessionId) {
    throw new Error(
      "Cannot issue CSRF token — no authenticated session cookie found"
    );
  }
  return generateCSRFToken(sessionId, userId, secret);
}

/**
 * Validate CSRF token for requests that require protection. Resolves
 * the signing secret from the Worker env; fails closed if missing.
 */
export async function validateCSRF(
  request: Request,
  context: AppLoadContext,
  userId?: string
): Promise<{ valid: boolean; error?: string }> {
  if (!requiresCSRFProtection(request)) {
    return { valid: true };
  }

  const env = context.cloudflare.env as unknown as { SESSION_SECRET?: string };
  const secret = getSessionSecret(env);
  return validateCSRFFromRequest(request, secret, userId);
}

/**
 * Create a CSRF validation failed response
 */
export function createCSRFFailureResponse(
  context: AppLoadContext,
  error: string = "Invalid CSRF token"
): Response {
  const headers = new Headers();
  addSecurityHeaders(headers, isDevelopment(context));

  return new Response(JSON.stringify({ error }), {
    status: 403,
    headers: {
      ...Object.fromEntries(headers.entries()),
      "Content-Type": "application/json",
    },
  });
}
