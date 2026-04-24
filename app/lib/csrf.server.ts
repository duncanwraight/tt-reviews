/**
 * CSRF (Cross-Site Request Forgery) Protection
 *
 * Generates and validates CSRF tokens to prevent malicious cross-site
 * requests that could trick users into performing unwanted actions.
 *
 * The signing secret is sourced from `context.cloudflare.env.SESSION_SECRET`
 * and must be passed explicitly. An earlier version read
 * `process.env.SESSION_SECRET`, which is always undefined on Cloudflare
 * Workers and silently fell back to the string "fallback-secret-key" —
 * i.e. every CSRF token in production was forgeable. This module now
 * fails closed: if SESSION_SECRET is missing, `getSessionSecret` throws
 * and callers are expected to bubble that into a 500.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Logger, createLogContext } from "./logger.server";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours in ms
const MIN_SECRET_LENGTH = 16;

interface CSRFTokenPayload {
  token: string;
  sessionId: string;
  userId?: string;
  timestamp: number;
}

interface EnvWithSessionSecret {
  SESSION_SECRET?: string;
}

/**
 * Resolve the CSRF signing secret from the Worker env. Throws if it's
 * missing or obviously too short — better a loud 500 than silent
 * forgeable tokens.
 */
export function getSessionSecret(env: EnvWithSessionSecret): string {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured — refusing to sign CSRF tokens"
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET is too short (<${MIN_SECRET_LENGTH} chars) — refusing to sign CSRF tokens`
    );
  }
  return secret;
}

function sign(payload: CSRFTokenPayload, secret: string): string {
  const canonical = `${payload.token}:${payload.sessionId}:${payload.userId || ""}:${payload.timestamp}`;
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Generate a signed CSRF token bound to the given session and user.
 */
export function generateCSRFToken(
  sessionId: string,
  userId: string | undefined,
  secret: string
): string {
  const payload: CSRFTokenPayload = {
    token: randomBytes(CSRF_TOKEN_LENGTH).toString("hex"),
    sessionId,
    userId,
    timestamp: Date.now(),
  };

  const signature = sign(payload, secret);
  const envelope = JSON.stringify({ ...payload, signature });
  return Buffer.from(envelope).toString("base64url");
}

/**
 * Validate a token against a session (and optionally a user id). Uses
 * HMAC-SHA256 with a constant-time signature comparison to resist
 * timing-oracle attacks.
 */
export function validateCSRFToken(
  token: string,
  sessionId: string,
  secret: string,
  userId?: string
): { valid: boolean; error?: string } {
  try {
    if (!token || !sessionId) {
      return { valid: false, error: "Missing token or session" };
    }

    const decoded = JSON.parse(Buffer.from(token, "base64url").toString());
    const {
      signature,
      timestamp,
      sessionId: tokenSessionId,
      userId: tokenUserId,
      token: tokenValue,
    } = decoded;

    if (!signature || !timestamp || !tokenSessionId || !tokenValue) {
      return { valid: false, error: "Invalid token structure" };
    }

    if (Date.now() - timestamp > CSRF_TOKEN_LIFETIME) {
      return { valid: false, error: "Token expired" };
    }

    if (tokenSessionId !== sessionId) {
      return { valid: false, error: "Session mismatch" };
    }

    if (userId && tokenUserId !== userId) {
      return { valid: false, error: "User mismatch" };
    }

    const expected = sign(
      {
        token: tokenValue,
        sessionId: tokenSessionId,
        userId: tokenUserId,
        timestamp,
      },
      secret
    );

    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, error: "Invalid signature" };
    }

    return { valid: true };
  } catch (error) {
    Logger.error(
      "CSRF token validation error",
      createLogContext("csrf-server"),
      error instanceof Error ? error : undefined
    );
    return { valid: false, error: "Token validation failed" };
  }
}

/**
 * Derive a stable per-session identifier from the Supabase auth cookies.
 * Returns null when no real session is present — callers fail closed
 * rather than fall back to `sha256(IP + UA)`, which previously meant
 * users behind the same NAT with the same UA shared interchangeable
 * CSRF tokens.
 */
export function getSessionId(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("Cookie") || "");

  // Supabase SSR splits the auth token across cookies named
  // sb-<project-ref>-auth-token, sb-<ref>-auth-token.0, .1, ...
  // Hashing the concatenated values binds the CSRF token to this
  // specific authenticated session and rotates when Supabase rotates.
  const supabaseAuthValue = Object.entries(cookies)
    .filter(([name]) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
    .join(":");

  if (supabaseAuthValue) {
    return createHash("sha256")
      .update(supabaseAuthValue)
      .digest("hex")
      .substring(0, 32);
  }

  if (cookies["session"]) {
    return cookies["session"];
  }

  return null;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach(cookie => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length > 0) {
      cookies[name] = rest.join("=");
    }
  });

  return cookies;
}

/**
 * Middleware to validate CSRF token from form data or X-CSRF-Token
 * header. Called from the action path via `validateCSRF` in
 * security.server.ts, which handles secret resolution.
 */
export async function validateCSRFFromRequest(
  request: Request,
  secret: string,
  userId?: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const sessionId = getSessionId(request);
    if (!sessionId) {
      return { valid: false, error: "No session found" };
    }

    let csrfToken: string | null = null;

    if (
      request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "DELETE" ||
      request.method === "PATCH"
    ) {
      const clonedRequest = request.clone();
      try {
        const formData = await clonedRequest.formData();
        csrfToken = formData.get("_csrf") as string;
      } catch {
        csrfToken = request.headers.get("X-CSRF-Token");
      }
    }

    if (!csrfToken) {
      return { valid: false, error: "CSRF token missing" };
    }

    return validateCSRFToken(csrfToken, sessionId, secret, userId);
  } catch (error) {
    Logger.error(
      "CSRF validation error",
      createLogContext("csrf-server", {
        method: request.method,
        route: new URL(request.url).pathname,
        userId,
      }),
      error instanceof Error ? error : undefined
    );
    return { valid: false, error: "CSRF validation failed" };
  }
}

/**
 * Helper to check if request needs CSRF protection.
 */
export function requiresCSRFProtection(request: Request): boolean {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return false;
  }

  // Discord interactions are Ed25519-signed; webhooks have their own
  // shared-secret path (not yet implemented — see SECURITY.md Phase 1
  // follow-up for the deleted discord.notify route).
  if (
    url.pathname.startsWith("/api/discord/") ||
    url.pathname.startsWith("/api/webhooks/")
  ) {
    return false;
  }

  return true;
}
