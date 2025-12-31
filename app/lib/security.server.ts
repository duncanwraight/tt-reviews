/**
 * Security utilities for server-side operations
 */

import { validateCSRFFromRequest, requiresCSRFProtection } from "./csrf.server";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: Request) => string; // Custom key generator
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory rate limiting store (for development)
// In production, use Cloudflare KV or similar
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiting implementation
 */
export async function rateLimit(
  request: Request,
  config: RateLimitConfig,
  context?: any
): Promise<{ success: boolean; resetTime?: number; remaining?: number }> {
  const key = config.keyGenerator
    ? config.keyGenerator(request)
    : getClientIP(request);
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Clean up old entries
  for (const [entryKey, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(entryKey);
    }
  }

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    // First request in window or window expired
    const resetTime = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { success: true, resetTime, remaining: config.maxRequests - 1 };
  }

  if (entry.count >= config.maxRequests) {
    // Rate limit exceeded
    return { success: false, resetTime: entry.resetTime, remaining: 0 };
  }

  // Increment count
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

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMITS = {
  API_STRICT: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 requests per minute
  API_MODERATE: { windowMs: 60 * 1000, maxRequests: 30 }, // 30 requests per minute
  LOGIN: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 attempts per 15 minutes
  FORM_SUBMISSION: { windowMs: 60 * 1000, maxRequests: 5 }, // 5 submissions per minute
  DISCORD_WEBHOOK: { windowMs: 10 * 1000, maxRequests: 20 }, // 20 requests per 10 seconds
} as const;

export function addSecurityHeaders(headers: Headers, isDevelopment?: boolean) {
  // Content Security Policy - Progressive enhancement approach
  // Default to checking NODE_ENV, but allow override from context
  // In standard React dev, NODE_ENV might not be set, so be more permissive
  const isDevMode = isDevelopment ?? (
    process.env.NODE_ENV === "development" || 
    process.env.ENVIRONMENT === "development" ||
    !process.env.NODE_ENV || // If NODE_ENV is not set, assume development
    process.env.NODE_ENV !== "production"
  );
  
  const connectSrc = isDevMode
    ? "'self' https://*.supabase.co wss://*.supabase.co http://localhost:54321 http://tt-reviews.local:5173 http://localhost:5173"
    : "'self' https://*.supabase.co wss://*.supabase.co";

  const csp = [
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
    "upgrade-insecure-requests",
  ].join("; ");

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
  if (!isDevMode) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
}

export function addApiSecurityHeaders(headers: Headers, isDevelopment?: boolean) {
  // API-specific security headers (less restrictive CSP for JSON responses)
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-XSS-Protection", "1; mode=block");

  // HSTS - Only add in production with HTTPS
  const isDevMode = isDevelopment ?? (
    process.env.NODE_ENV === "development" || 
    process.env.ENVIRONMENT === "development" ||
    !process.env.NODE_ENV ||
    process.env.NODE_ENV !== "production"
  );
  if (!isDevMode) {
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
  init?: ResponseInit & {
    isApi?: boolean;
    rateLimit?: { resetTime: number; remaining: number };
    isDevelopment?: boolean;
  }
): Response {
  const headers = new Headers(init?.headers);

  if (init?.isApi) {
    addApiSecurityHeaders(headers, init.isDevelopment);
  } else {
    addSecurityHeaders(headers, init?.isDevelopment);
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
export function createRateLimitResponse(resetTime: number): Response {
  const headers = new Headers();
  addApiSecurityHeaders(headers);
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
 * Validate CSRF token for requests that require protection
 */
export async function validateCSRF(
  request: Request,
  userId?: string
): Promise<{ valid: boolean; error?: string }> {
  // Check if request requires CSRF protection
  if (!requiresCSRFProtection(request)) {
    return { valid: true };
  }

  return await validateCSRFFromRequest(request, userId);
}

/**
 * Create a CSRF validation failed response
 */
export function createCSRFFailureResponse(
  error: string = "Invalid CSRF token"
): Response {
  const headers = new Headers();
  addSecurityHeaders(headers);

  return new Response(JSON.stringify({ error }), {
    status: 403,
    headers: {
      ...Object.fromEntries(headers.entries()),
      "Content-Type": "application/json",
    },
  });
}
