/**
 * CSRF (Cross-Site Request Forgery) Protection
 *
 * Generates and validates CSRF tokens to prevent malicious cross-site requests
 * that could trick users into performing unwanted actions.
 */

import { createHash, randomBytes } from "crypto";

// CSRF token configuration
const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface CSRFTokenData {
  token: string;
  sessionId: string;
  userId?: string;
  timestamp: number;
}

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(sessionId: string, userId?: string): string {
  const timestamp = Date.now();
  const randomData = randomBytes(CSRF_TOKEN_LENGTH).toString("hex");

  // Create token payload
  const payload: CSRFTokenData = {
    token: randomData,
    sessionId,
    userId,
    timestamp,
  };

  // Create signature using HMAC
  const signature = createTokenSignature(payload);

  // Encode the complete token
  const tokenData = JSON.stringify({ ...payload, signature });
  return Buffer.from(tokenData).toString("base64url");
}

/**
 * Validate a CSRF token
 */
export function validateCSRFToken(
  token: string,
  sessionId: string,
  userId?: string
): { valid: boolean; error?: string } {
  try {
    if (!token || !sessionId) {
      return { valid: false, error: "Missing token or session" };
    }

    // Decode token
    const tokenData = JSON.parse(Buffer.from(token, "base64url").toString());
    const {
      signature,
      timestamp,
      sessionId: tokenSessionId,
      userId: tokenUserId,
      token: tokenValue,
    } = tokenData;

    // Check token structure
    if (!signature || !timestamp || !tokenSessionId || !tokenValue) {
      return { valid: false, error: "Invalid token structure" };
    }

    // Check token age
    if (Date.now() - timestamp > CSRF_TOKEN_LIFETIME) {
      return { valid: false, error: "Token expired" };
    }

    // Verify session matches
    if (tokenSessionId !== sessionId) {
      return { valid: false, error: "Session mismatch" };
    }

    // Verify user matches (if provided)
    if (userId && tokenUserId !== userId) {
      return { valid: false, error: "User mismatch" };
    }

    // Verify signature
    const expectedSignature = createTokenSignature({
      token: tokenValue,
      sessionId: tokenSessionId,
      userId: tokenUserId,
      timestamp,
    });

    if (signature !== expectedSignature) {
      return { valid: false, error: "Invalid signature" };
    }

    return { valid: true };
  } catch (error) {
    console.error("CSRF token validation error:", error);
    return { valid: false, error: "Token validation failed" };
  }
}

/**
 * Create HMAC signature for token data
 */
function createTokenSignature(data: CSRFTokenData): string {
  // Use a combination of session data and environment to create signature
  const signingKey = process.env.SESSION_SECRET || "fallback-secret-key";
  const payload = `${data.token}:${data.sessionId}:${data.userId || ""}:${data.timestamp}`;

  return createHash("sha256")
    .update(payload + signingKey)
    .digest("hex");
}

/**
 * Extract session ID from request headers/cookies
 */
export function getSessionId(request: Request): string | null {
  // Try to get session from various sources
  const cookies = parseCookies(request.headers.get("Cookie") || "");

  // Check for session cookie
  if (cookies["session"]) {
    return cookies["session"];
  }

  // Check for authorization header (if using JWT)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    // Extract session from JWT or similar
    return createHash("sha256")
      .update(authHeader)
      .digest("hex")
      .substring(0, 32);
  }

  // Fallback: use IP + User-Agent as session identifier
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  const userAgent = request.headers.get("User-Agent") || "unknown";

  return createHash("sha256")
    .update(`${ip}:${userAgent}`)
    .digest("hex")
    .substring(0, 32);
}

/**
 * Simple cookie parser
 */
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
 * Middleware to validate CSRF token from form data
 */
export async function validateCSRFFromRequest(
  request: Request,
  userId?: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const sessionId = getSessionId(request);
    if (!sessionId) {
      return { valid: false, error: "No session found" };
    }

    // Get token from form data or headers
    let csrfToken: string | null = null;

    if (
      request.method === "POST" ||
      request.method === "PUT" ||
      request.method === "DELETE"
    ) {
      // Clone request to read form data without consuming original
      const clonedRequest = request.clone();

      try {
        const formData = await clonedRequest.formData();
        csrfToken = formData.get("_csrf") as string;
      } catch {
        // If form data parsing fails, try headers
        csrfToken = request.headers.get("X-CSRF-Token");
      }
    }

    if (!csrfToken) {
      return { valid: false, error: "CSRF token missing" };
    }

    return validateCSRFToken(csrfToken, sessionId, userId);
  } catch (error) {
    console.error("CSRF validation error:", error);
    return { valid: false, error: "CSRF validation failed" };
  }
}

/**
 * Helper to check if request needs CSRF protection
 */
export function requiresCSRFProtection(request: Request): boolean {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  // Only protect state-changing operations
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return false;
  }

  // Skip CSRF for API endpoints that use other authentication
  if (
    url.pathname.startsWith("/api/discord/") ||
    url.pathname.startsWith("/api/webhooks/")
  ) {
    return false;
  }

  return true;
}
